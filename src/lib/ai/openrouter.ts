import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const apiKey = process.env.OPENROUTER_API_KEY;

const DEFAULT_MODEL =
  process.env.OPENROUTER_DEFAULT_MODEL ?? "anthropic/claude-sonnet-4.6";

const FALLBACK_MODELS = (
  process.env.OPENROUTER_FALLBACK_MODELS ??
  "google/gemini-2.5-flash,openai/gpt-4o"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const openrouter = createOpenRouter({
  apiKey,
  headers: {
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "",
    "X-Title": process.env.OPENROUTER_SITE_NAME ?? "BrandMe Concept",
  },
});

/**
 * Modelo multimodal con fallbacks automáticos de OpenRouter: si el primario falla,
 * enruta al siguiente del array `models`.
 */
export const designModel = openrouter(DEFAULT_MODEL, {
  extraBody: { models: [DEFAULT_MODEL, ...FALLBACK_MODELS] },
});

/**
 * Variante con reasoning tokens habilitados: el modelo expone su razonamiento,
 * que streameamos para mostrar "qué piensa el agente" mientras genera.
 */
export const designModelWithReasoning = openrouter(DEFAULT_MODEL, {
  extraBody: { models: [DEFAULT_MODEL, ...FALLBACK_MODELS] },
  reasoning: { enabled: true, effort: "low" },
});

export function assertOpenRouterConfigured() {
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY no configurada. Copia .env.example a .env.local.",
    );
  }
}
