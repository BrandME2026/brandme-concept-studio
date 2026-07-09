import { AsyncLocalStorage } from "node:async_hooks";
import { getConfigNumber } from "@/lib/config/config-store";

/**
 * ObservabilityWrapper (WO-8, REQ-PF-008 / EP-04): la interfaz canónica ÚNICA
 * de captura de errores. Ningún código llama al backend de monitoreo directo:
 * todo pasa por captureError, que adjunta los tags EP-04 automáticamente desde
 * el contexto de request (los callers JAMÁS setean tags a mano), scrubbea PII
 * y dispara alertas por tasa (umbral EP-07 en ConfigStore).
 *
 * Backend conectable (ObservabilitySink). HONESTIDAD TÉCNICA: el target es
 * Sentry, pero NO hay SENTRY_DSN provisionado — el default es un sink de log
 * estructurado; el adapter de Sentry se enchufa vía setObservabilitySink cuando
 * exista el DSN (infra del usuario). No afirmamos "usar Sentry" hasta entonces.
 */

export interface ObservabilityTags {
  consultant_id?: string;
  agent_id?: string;
  model_alias?: string;
  role?: string;
  surface?: string;
}

export interface CapturedError {
  level: "error";
  message: string;
  note?: string;
  stack?: string;
  tags: ObservabilityTags;
}

export interface RateAlert {
  surface: string;
  count: number;
  windowMs: number;
  message: string;
}

export interface ObservabilitySink {
  capture(payload: CapturedError): void;
  alert(alert: RateAlert): void;
}

/** Sink default: log estructurado (una línea JSON greppeable/parseable). */
const consoleSink: ObservabilitySink = {
  capture(payload) {
    console.error("[observability]", JSON.stringify(payload));
  },
  alert(alert) {
    console.error("[observability:ALERT]", JSON.stringify(alert));
  },
};

let sink: ObservabilitySink = consoleSink;

/** Enchufa otro backend (adapter Sentry cuando exista SENTRY_DSN; sinks fake en tests). */
export function setObservabilitySink(next: ObservabilitySink): void {
  sink = next;
}
export function resetObservabilitySink(): void {
  sink = consoleSink;
}

// ── Contexto EP-04 (tags automáticos, nunca manuales) ────────────────────────

const storage = new AsyncLocalStorage<ObservabilityTags>();

/** Anida/mergea tags de contexto; los callers de captureError no setean tags. */
export function withObservabilityContext<T>(
  tags: Partial<ObservabilityTags>,
  fn: () => T,
): T {
  const merged = { ...(storage.getStore() ?? {}), ...tags };
  return storage.run(merged, fn);
}

export function currentObservabilityTags(): ObservabilityTags {
  return { ...(storage.getStore() ?? {}) };
}

// ── Scrubbing de PII (AC-PF-008.2) ───────────────────────────────────────────
// Emails y teléfonos por patrón. Sobre-scrub deliberado (mejor privar de un
// timestamp que filtrar un teléfono). Los NOMBRES no son detectables por regex:
// la defensa es estructural — mensajes de error genéricos, sin campos de usuario
// en payloads (regla de código; el review de cada feature la vigila).

const EMAIL_RE = /[^\s@"',;()[\]]+@[^\s@"',;()[\]]+\.[a-z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;

export function scrubPii(text: string): string {
  return text.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[tel]");
}

// ── Alerta por tasa (AC-PF-008.3) ────────────────────────────────────────────

const WINDOW_MS = 60_000;
interface SurfaceBucket {
  count: number;
  resetAt: number;
  alerted: boolean;
}
const buckets = new Map<string, SurfaceBucket>();

async function checkRateAlert(surface: string): Promise<void> {
  const now = Date.now();
  let bucket = buckets.get(surface);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS, alerted: false };
    buckets.set(surface, bucket);
  }
  bucket.count += 1;
  if (bucket.alerted) return;
  const threshold = await getConfigNumber(
    "observability",
    "error_rate_threshold_per_min",
    10,
  );
  // Re-chequeo POST-await: N captureError concurrentes pasan el chequeo de
  // arriba antes de que alguno setee el flag; las continuaciones sí se
  // serializan, así que este segundo chequeo garantiza UNA alerta por ventana.
  if (bucket.alerted) return;
  if (bucket.count >= threshold) {
    bucket.alerted = true; // una alerta por ventana
    sink.alert({
      surface,
      count: bucket.count,
      windowMs: WINDOW_MS,
      message: `Tasa de errores en ${surface}: ${bucket.count} en 60s (umbral ${threshold})`,
    });
  }
}

/**
 * Alerta operacional directa al canal de alertas (p.ej. breach de rate limit,
 * AC-PF-019.4). A diferencia de la alerta por tasa de captureError, aquí el
 * CALLER decide cuándo alertar; el destino sigue siendo el sink único.
 */
export function emitOpsAlert(alert: RateAlert): void {
  try {
    sink.alert(alert);
  } catch (sinkErr) {
    console.error("[observability] sink de alertas falló", sinkErr);
  }
}

/** Solo tests. */
export function __resetObservabilityForTests(): void {
  buckets.clear();
  sink = consoleSink;
}

// ── Captura ──────────────────────────────────────────────────────────────────

/**
 * Captura un error con tags EP-04 automáticos y PII scrubbeada. Síncrona a
 * propósito (se llama desde catch); el chequeo de alerta corre fire-and-forget.
 */
export function captureError(err: unknown, note?: string): void {
  const tags = currentObservabilityTags();
  const error = err instanceof Error ? err : new Error(String(err));
  const payload: CapturedError = {
    level: "error",
    message: scrubPii(error.message),
    ...(note ? { note: scrubPii(note) } : {}),
    ...(error.stack ? { stack: scrubPii(error.stack) } : {}),
    tags,
  };
  try {
    sink.capture(payload);
  } catch (sinkErr) {
    // El sink jamás debe tumbar el request path.
    console.error("[observability] sink falló", sinkErr);
  }
  if (tags.surface) {
    void checkRateAlert(tags.surface).catch((alertErr) =>
      console.error("[observability] chequeo de alerta falló", alertErr),
    );
  }
}
