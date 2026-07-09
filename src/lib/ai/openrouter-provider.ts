import type { AIModelProvider } from "./model-provider";
import { buildOpenRouterModel } from "./openrouter";

/**
 * Adapter OpenRouter del AIModelProvider (WO-4, EP-05). Solo transporte:
 * reusa el cliente/builder existente de openrouter.ts (una API key, fallbacks,
 * cache_control explícito). Swap de provider = otro adapter + config.
 */
export const openRouterProvider: AIModelProvider = {
  name: "openrouter",
  languageModel(modelName, opts) {
    return buildOpenRouterModel(modelName, opts.fallbackModels, opts.cacheTtl);
  },
};
