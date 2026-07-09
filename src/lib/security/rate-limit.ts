/**
 * Defensa anti-abuso para los endpoints públicos. Primera capa EN LA APP:
 *  - rateLimit(): límite por clave (IP) en ventana deslizante, en memoria.
 *  - llmBudget: tope diario GLOBAL de operaciones caras de LLM (circuit-breaker) para
 *    proteger los tokens/dinero aunque el rate-limit por IP se sortee.
 *
 * En memoria (una sola instancia en Railway): se resetea en cada deploy y no cubre
 * múltiples réplicas. Es la 1ª capa; el tope DURO de dinero es el límite de gasto de la
 * API key en OpenRouter (ver README). Migrable a Redis sin cambiar las firmas.
 */

import { getConfigNumber } from "@/lib/config/config-store";

// ── Rate-limit por clave (ventana fija en memoria) ──────────────────────────
interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

// Limpieza perezosa para que el Map no crezca sin fin (evita fuga de memoria).
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export interface RateResult {
  ok: boolean;
  retryAfter: number; // segundos hasta poder reintentar
}

/** Cuenta una petición para `key`. Devuelve ok=false si supera `max` en `windowMs`. */
export function rateLimit(
  key: string,
  opts: { windowMs: number; max: number },
): RateResult {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > opts.max) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Clave de cliente a partir de la IP. En Railway el edge inyecta x-forwarded-for.
 * Es la 1ª capa, no infalible (spoofeable sin proxy de confianza) — por eso el tope
 * diario global NO depende de esto.
 */
export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "no-ip";
}

// ── Circuit-breaker: tope diario global de operaciones LLM CARAS ────────────
// Protege el dinero: aunque alguien sortee el rate-limit por IP, no se superan N
// operaciones caras al día. Corta SOLO lo caro (generación premium / Playwright);
// el chat/agente baratos no pasan por aquí (decisión: no matar la captación).
// El cap es EP-07 (llm.daily_cap en PlatformConfig, editable sin deploy — WO-7).

let dayKey = "";
let dayCount = 0;
let lastCap = 300; // último cap resuelto (para status() síncrono en logs)
function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export const llmBudget = {
  /** Reserva 1 operación cara del cupo diario. false si ya se alcanzó el tope. */
  async tryConsume(): Promise<boolean> {
    lastCap = await getConfigNumber("llm", "daily_cap", 300);
    const today = utcDay(Date.now());
    if (today !== dayKey) {
      dayKey = today;
      dayCount = 0;
    }
    if (dayCount >= lastCap) return false;
    dayCount += 1;
    return true;
  },
  /** Estado actual (para logs/diagnóstico). */
  status() {
    return { day: dayKey, used: dayCount, cap: lastCap };
  },
};

// ── Helpers de respuesta ────────────────────────────────────────────────────
import { NextResponse } from "next/server";

export function tooMany(retryAfter: number) {
  return NextResponse.json(
    { success: false, error: { code: "RATE_LIMITED", message: "Demasiadas peticiones, intenta en un momento." } },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } },
  );
}

export function budgetExceeded() {
  return NextResponse.json(
    { success: false, error: { code: "BUSY", message: "Servicio muy solicitado ahora mismo. Intenta más tarde." } },
    { status: 503 },
  );
}

// ── Semáforo de concurrencia (proteger RAM de Playwright en /api/extract) ───
// Máximo de operaciones pesadas simultáneas. Si está lleno, se rechaza (no se encola
// indefinidamente) para no acumular requests que tumben la instancia.
// El máximo es EP-07 (extract.max_concurrent en PlatformConfig — WO-7).
let activeExtract = 0;

export async function acquireExtractSlot(): Promise<boolean> {
  const max = await getConfigNumber("extract", "max_concurrent", 3);
  if (activeExtract >= max) return false;
  activeExtract += 1;
  return true;
}
export function releaseExtractSlot(): void {
  if (activeExtract > 0) activeExtract -= 1;
}

// ── Caps por endpoint (EP-07: rate_limiting.<name>_per_min en PlatformConfig) ─
// Los fallbacks son los defaults sembrados por la migración 0004; los env RL_*
// dejaron de leerse (contrato EP-07: sin hardcode ni env para tunables).
export type LimitName =
  | "generate"
  | "extract"
  | "chat"
  | "agent"
  | "resolve"
  | "leads"
  | "checkout"
  | "speech";

const LIMIT_DEFAULTS: Record<LimitName, number> = {
  generate: 5,
  extract: 6,
  chat: 20,
  agent: 20,
  resolve: 15,
  leads: 5,
  checkout: 5,
  speech: 10,
};

const WINDOW_MS = 60_000;

/** Rate-limit por clave con el cap EP-07 del endpoint (ConfigStore, <60s liveness). */
export async function checkRateLimit(name: LimitName, key: string): Promise<RateResult> {
  const max = await getConfigNumber("rate_limiting", `${name}_per_min`, LIMIT_DEFAULTS[name]);
  return rateLimit(key, { windowMs: WINDOW_MS, max });
}
