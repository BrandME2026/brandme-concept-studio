import { createOpenRouter } from "@openrouter/ai-sdk-provider";

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
 * Modelos seleccionables desde la UI (allowlist). "alta" = mejor benchmark de
 * diseño; "rapido" = balance calidad/coste/latencia.
 */
export const QUALITY_MODELS = {
  alta: "openai/gpt-5.5",
  rapido: "anthropic/claude-sonnet-4.6",
} as const;

export type Quality = keyof typeof QUALITY_MODELS;

const openrouter = createOpenRouter({
  apiKey,
  headers: {
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "",
    "X-Title": process.env.OPENROUTER_SITE_NAME ?? "BrandMe Concept",
  },
});

/**
 * Devuelve un modelo (con fallbacks automáticos de OpenRouter) para la calidad pedida.
 * El primario es el de la calidad; el resto del fallback se mantiene como respaldo.
 */
export function getDesignModel(quality: Quality = "alta") {
  const primary = QUALITY_MODELS[quality] ?? DEFAULT_MODEL;
  const models = [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];
  return openrouter(primary, { extraBody: { models } });
}

/** Modelo por defecto (alta calidad) para usos que no eligen calidad. */
export const designModel = getDesignModel("alta");

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
});

export function assertOpenRouterConfigured() {
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY no configurada. Copia .env.example a .env.local.",
    );
  }
}
