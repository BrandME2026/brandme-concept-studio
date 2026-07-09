import type { LanguageModel } from "ai";

/**
 * AIModelProvider (WO-4, EP-05 / REQ-PF-018): interfaz provider-agnóstica de
 * transporte de modelos. LLMWrapper depende de ESTA interfaz, nunca de un
 * vendor concreto — cambiar de provider = nuevo adapter + config, cero cambios
 * en el wrapper o los agentes.
 */

export type CacheTtl = "5m" | "1h";

export interface ModelRequestOptions {
  /** Modelos de respaldo (el adapter decide cómo aplicarlos; OpenRouter: array `models`). */
  fallbackModels: string[];
  /** TTL de prompt-cache SIEMPRE explícito (AC-PF-016.6); nunca el default del provider. */
  cacheTtl: CacheTtl;
}

export interface AIModelProvider {
  readonly name: string;
  languageModel(modelName: string, opts: ModelRequestOptions): LanguageModel;
}
