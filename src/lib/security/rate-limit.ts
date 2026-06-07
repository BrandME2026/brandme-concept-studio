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

const num = (v: string | undefined, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

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
const LLM_DAILY_CAP = num(process.env.LLM_DAILY_CAP, 300);

let dayKey = "";
let dayCount = 0;
function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export const llmBudget = {
  /** Reserva 1 operación cara del cupo diario. false si ya se alcanzó el tope. */
  tryConsume(): boolean {
    const today = utcDay(Date.now());
    if (today !== dayKey) {
      dayKey = today;
      dayCount = 0;
    }
    if (dayCount >= LLM_DAILY_CAP) return false;
    dayCount += 1;
    return true;
  },
  /** Estado actual (para logs/diagnóstico). */
  status() {
    return { day: dayKey, used: dayCount, cap: LLM_DAILY_CAP };
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
const MAX_CONCURRENT_EXTRACT = num(process.env.EXTRACT_CONCURRENCY, 3);
let activeExtract = 0;

export function acquireExtractSlot(): boolean {
  if (activeExtract >= MAX_CONCURRENT_EXTRACT) return false;
  activeExtract += 1;
  return true;
}
export function releaseExtractSlot(): void {
  if (activeExtract > 0) activeExtract -= 1;
}

/** Límites por endpoint, configurables por env (ajustables sin tocar código). */
export const LIMITS = {
  generate: { windowMs: 60_000, max: num(process.env.RL_GENERATE_PER_MIN, 5) },
  extract: { windowMs: 60_000, max: num(process.env.RL_EXTRACT_PER_MIN, 6) },
  chat: { windowMs: 60_000, max: num(process.env.RL_CHAT_PER_MIN, 20) },
  agent: { windowMs: 60_000, max: num(process.env.RL_AGENT_PER_MIN, 20) },
  resolve: { windowMs: 60_000, max: num(process.env.RL_RESOLVE_PER_MIN, 15) },
  leads: { windowMs: 60_000, max: num(process.env.RL_LEADS_PER_MIN, 5) },
  checkout: { windowMs: 60_000, max: num(process.env.RL_CHECKOUT_PER_MIN, 5) },
};
