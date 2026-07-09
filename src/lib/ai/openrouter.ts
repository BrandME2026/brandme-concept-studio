import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getConfigString } from "@/lib/config/config-store";

const apiKey = process.env.OPENROUTER_API_KEY;

// Modelo por defecto: GPT-5.5 (1º del benchmark frontend 2026).
const DEFAULT_MODEL = process.env.OPENROUTER_DEFAULT_MODEL ?? "openai/gpt-5.5";

// Fallbacks ordenados por benchmark de diseño (Opus 4.7 > Sonnet 4.6 > Gemini 3.1 Pro).
const FALLBACK_MODELS = (
  process.env.OPENROUTER_FALLBACK_MODELS ??
  "anthropic/claude-opus-4.7,anthropic/claude-sonnet-4.6,google/gemini-3.1-pro-preview"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

/**
 * Calidades seleccionables desde la UI (allowlist). El MODELO concreto de cada
 * calidad es un tunable EP-07 (WO-7): vive en PlatformConfig (`llm.model_alias_*`)
 * y es editable sin deploy; estos son los fallbacks (= defaults sembrados).
 */
const QUALITY_DEFAULTS = {
  alta: "openai/gpt-5.5",
  rapido: "anthropic/claude-sonnet-4.6",
} as const;

export type Quality = keyof typeof QUALITY_DEFAULTS;

const openrouter = createOpenRouter({
  apiKey,
  headers: {
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "",
    "X-Title": process.env.OPENROUTER_SITE_NAME ?? "BrandMe Concept",
  },
});

// Prompt caching (requisito financiero del spec v0.3 / WO-1, AC-PF-016.6): el TTL
// se setea SIEMPRE explícito, nunca el default del provider — Anthropic cambió el
// default de 1h a 5min en marzo 2026 sin aviso, y depender del default es un riesgo
// de costos. OpenRouter solo aplica cache_control en modelos Claude; en otros modelos
// (p. ej. GPT-5.5 de generación) es inocuo. TTL configurable por env.
//   - interactivo (chat, generación on-demand): 5m
//   - batch/scheduled (agentes programados, cuando existan): 1h
const CACHE_TTL_INTERACTIVE = (process.env.OPENROUTER_CACHE_TTL_INTERACTIVE ?? "5m") as "5m" | "1h";
const CACHE_TTL_BATCH = (process.env.OPENROUTER_CACHE_TTL_BATCH ?? "1h") as "5m" | "1h";

/**
 * Devuelve un modelo (con fallbacks automáticos de OpenRouter) para la calidad pedida.
 * El primario se resuelve vía ConfigStore (llm.model_alias_alta/_rapido — editable
 * sin deploy, WO-7); el resto del fallback se mantiene como respaldo.
 *
 * @param quality calidad del modelo (alta/rapido).
 * @param mode modo de invocación que define el TTL de cache (default interactivo).
 */
export async function getDesignModel(
  quality: Quality = "alta",
  mode: "interactive" | "batch" = "interactive",
) {
  const configKey = quality === "alta" ? "model_alias_alta" : "model_alias_rapido";
  const primary =
    (await getConfigString("llm", configKey, QUALITY_DEFAULTS[quality])) || DEFAULT_MODEL;
  const ttl = mode === "batch" ? CACHE_TTL_BATCH : CACHE_TTL_INTERACTIVE;
  return buildOpenRouterModel(primary, FALLBACK_MODELS, ttl);
}

/**
 * @internal Builder compartido con el adapter AIModelProvider (WO-4): modelo
 * OpenRouter con fallbacks y cache_control SIEMPRE explícito.
 */
export function buildOpenRouterModel(
  primary: string,
  fallbackModels: string[],
  ttl: "5m" | "1h",
) {
  // OpenRouter limita el array `models` a 3 ítems. Primario + 2 fallbacks como máximo.
  const models = [primary, ...fallbackModels.filter((m) => m !== primary)].slice(0, 3);
  return openrouter(primary, {
    extraBody: { models },
    cache_control: { type: "ephemeral", ttl },
  });
}

// Reasoning tokens de OpenRouter (chain-of-thought). DESACTIVADO por defecto en
// generación: con reasoning activo el modelo emitía 130+ pasos de pensamiento antes del
// HTML → esperas de varios minutos, inaceptable. El panel "razonamiento del agente" es
// cosmético; no justifica esa latencia. Reactivable por env (OPENROUTER_REASONING_EFFORT).
const REASONING_EFFORT = process.env.OPENROUTER_REASONING_EFFORT as
  | "xhigh" | "high" | "medium" | "low" | "minimal" | undefined;

/** providerOptions para streamText. undefined (sin reasoning) salvo que se pida por env. */
export const REASONING_PROVIDER_OPTIONS = REASONING_EFFORT
  ? { openrouter: { reasoning: { enabled: true, effort: REASONING_EFFORT } } }
  : undefined;

// Modelo barato para tareas livianas (chat de afinado y resolución marca→URL): no
// requieren el juicio del modelo premium. DeepSeek V4 Flash da el mejor calidad/precio
// (~12× más barato que GPT-5.5). Configurable por env var; fallback a Sonnet si falla.
const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL ?? "deepseek/deepseek-v4-flash";
const CHAT_FALLBACK = process.env.OPENROUTER_CHAT_FALLBACK ?? "anthropic/claude-sonnet-4.6";

/** Modelo económico para chat y resolución (no para la generación de la propuesta). */
export const chatModel = openrouter(CHAT_MODEL, {
  extraBody: { models: [CHAT_MODEL, CHAT_FALLBACK] },
  // TTL interactivo explícito: el system prompt del chat se repite en cada turno,
  // así que el cache reduce el costo cuando el routing usa un modelo Claude.
  cache_control: { type: "ephemeral", ttl: CACHE_TTL_INTERACTIVE },
});

export function assertOpenRouterConfigured() {
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY no configurada. Copia .env.example a .env.local.",
    );
  }
}
