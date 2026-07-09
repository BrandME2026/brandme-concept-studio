import { randomUUID } from "node:crypto";
import { generateText } from "ai";
import { getConfigString, getConfigValue } from "@/lib/config/config-store";
import { db, withSystemContext } from "@/lib/db/tenant-context";
import type { AIModelProvider, CacheTtl } from "./model-provider";
import { openRouterProvider } from "./openrouter-provider";
import { llmBudgetBreaker, LLMBudgetExceededError } from "./llm-budget-breaker";

/**
 * LLMWrapper (WO-4, REQ-PF-016): la interfaz EXCLUSIVA de invocación de modelos
 * para agentes y features nuevos. Resuelve aliases (`large`/`fast`) y TTLs de
 * cache vía ConfigStore (sin deploy), rechaza system prompts con contenido
 * tenant-scoped (AC-PF-016.5), gatea con el LLMBudgetBreaker ANTES del
 * transporte, y escribe telemetría LLMInvocation síncrona (fallo = hard error,
 * AC-PF-016.3). El transporte lo pone AIModelProvider (EP-05).
 *
 * REGLAS:
 * - Nunca llamar dentro de withTenant()/withSystemContext(): la llamada al
 *   modelo es red externa (regla dura de WO-3). El wrapper abre su propio
 *   contexto SOLO para el INSERT de telemetría.
 * - El contexto específico del consultor va SIEMPRE en `prompt` (user message),
 *   jamás en `system` — es lo que permite compartir cache key entre consultores.
 * - Las rutas del prototipo (generate/chat/agent) siguen en openrouter.ts por
 *   scope explícito del WO; migran cuando se toquen. Todo agente nuevo (WO-12+)
 *   entra por aquí.
 */

export type ModelAlias = "large" | "fast";
export type InvocationMode = "realtime" | "batch";

export class LLMStaticPromptError extends Error {}
export class LLMUnknownAliasError extends Error {}
export class LLMTelemetryError extends Error {}
export { LLMBudgetExceededError };

export interface InvokeLLMParams {
  /** `large` = razonamiento complejo · `fast` = tareas estructuradas. */
  alias: ModelAlias;
  /** SOLO instrucciones estáticas del agente. Nada tenant-scoped. */
  system: string;
  /** El mensaje del usuario — aquí va TODO el contexto específico del consultor. */
  prompt: string;
  mode?: InvocationMode; // default "realtime" (TTL 5m); "batch" = TTL 1h
  consultantId?: string | null;
  agentId?: string | null;
  /** Inyectable para tests (EP-05); default: adapter OpenRouter. */
  provider?: AIModelProvider;
}

export interface InvokeLLMUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface InvokeLLMResult {
  text: string;
  resolvedModel: string;
  invocationId: string;
  usage: InvokeLLMUsage;
  latencyMs: number;
  estimatedCostUsd: number;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

const ALIAS_DEFAULTS: Record<ModelAlias, string> = {
  large: "anthropic/claude-sonnet-4.6",
  fast: "anthropic/claude-haiku-4.5",
};

/**
 * Baseline runtime de AC-PF-016.5: rechaza señales inequívocas de contenido
 * dinámico/tenant-scoped (el consultantId de la llamada, UUIDs, emails).
 * La garantía completa es el code review previo al primer deploy de cada
 * agente (lo dice el propio AC); esto corta los casos detectables en runtime.
 */
function assertStaticSystemPrompt(system: string, consultantId: string | null): void {
  if (consultantId && system.includes(consultantId)) {
    throw new LLMStaticPromptError(
      "System prompt contiene el consultant_id: el contexto del consultor va en el user message (AC-PF-016.5)",
    );
  }
  if (UUID_RE.test(system)) {
    throw new LLMStaticPromptError(
      "System prompt contiene un UUID (dato tenant-scoped): muévelo al user message (AC-PF-016.5)",
    );
  }
  if (EMAIL_RE.test(system)) {
    throw new LLMStaticPromptError(
      "System prompt contiene un email (dato personal): muévelo al user message (AC-PF-016.5)",
    );
  }
}

interface PricingRate {
  input_per_mtok?: number;
  output_per_mtok?: number;
  cache_write_per_mtok?: number;
  cache_read_per_mtok?: number;
}

/** Costo por token-bucket con rates de ConfigStore (llm.pricing) — nunca hardcodeado. */
async function estimateCostUsd(resolvedModel: string, usage: InvokeLLMUsage): Promise<number> {
  const pricing = await getConfigValue<Record<string, PricingRate>>("llm", "pricing", {});
  const rate = pricing[resolvedModel];
  if (!rate) {
    // Cost Model pendiente de recomputación (banner en 8090): sin rate → costo 0.
    console.warn(`[llm-wrapper] sin pricing para ${resolvedModel}; estimated_cost_usd=0`);
    return 0;
  }
  const per = (tokens: number, usdPerMtok?: number) =>
    usdPerMtok ? (tokens / 1_000_000) * usdPerMtok : 0;
  const cost =
    per(usage.inputTokens, rate.input_per_mtok) +
    per(usage.outputTokens, rate.output_per_mtok) +
    per(usage.cacheWriteTokens, rate.cache_write_per_mtok) +
    per(usage.cacheReadTokens, rate.cache_read_per_mtok);
  return Math.round(cost * 1e6) / 1e6;
}

export async function invokeLLM(params: InvokeLLMParams): Promise<InvokeLLMResult> {
  const {
    alias,
    system,
    prompt,
    mode = "realtime",
    consultantId = null,
    agentId = null,
  } = params;

  // Alias desconocido → error temprano (ADR-001: evitar misrouting silencioso).
  if (alias !== "large" && alias !== "fast") {
    throw new LLMUnknownAliasError(`Alias de modelo desconocido: ${String(alias)}`);
  }
  assertStaticSystemPrompt(system, consultantId);
  await llmBudgetBreaker.assertWithinBudget();

  const resolvedModel = await getConfigString(
    "llm",
    alias === "large" ? "alias_large" : "alias_fast",
    ALIAS_DEFAULTS[alias],
  );
  const ttl = (await getConfigString(
    "llm",
    mode === "batch" ? "cache_ttl_batch" : "cache_ttl_interactive",
    mode === "batch" ? "1h" : "5m",
  )) as CacheTtl;
  const fallbackModels = await getConfigValue<string[]>("llm", "fallback_models", []);

  const provider = params.provider ?? openRouterProvider;
  const model = provider.languageModel(resolvedModel, { fallbackModels, cacheTtl: ttl });

  const started = Date.now();
  const result = await generateText({ model, system, prompt });
  const latencyMs = Date.now() - started;

  const rawUsage = result.usage as {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
  };
  const usage: InvokeLLMUsage = {
    inputTokens: rawUsage.inputTokens ?? 0,
    outputTokens: rawUsage.outputTokens ?? 0,
    cacheReadTokens:
      rawUsage.inputTokenDetails?.cacheReadTokens ?? rawUsage.cachedInputTokens ?? 0,
    cacheWriteTokens: rawUsage.inputTokenDetails?.cacheWriteTokens ?? 0,
  };
  const estimatedCostUsd = await estimateCostUsd(resolvedModel, usage);
  // El gasto YA ocurrió (el modelo respondió): contarlo aunque la telemetría
  // falle después — el breaker protege dinero real, no filas escritas.
  llmBudgetBreaker.track(estimatedCostUsd);

  // Telemetría síncrona y obligatoria (AC-PF-016.3): fallo = hard error.
  const invocationId = randomUUID();
  try {
    await withSystemContext("llm-telemetry", async () => {
      await db().query(
        `INSERT INTO llm_invocations
           (id, model_alias, resolved_model_name, input_tokens, cache_write_tokens,
            cache_write_ttl_variant, cache_read_tokens, output_tokens,
            estimated_cost_usd, latency_ms, consultant_id, agent_id, invocation_mode)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          invocationId,
          alias,
          resolvedModel,
          usage.inputTokens,
          usage.cacheWriteTokens,
          ttl === "1h" ? "1hour" : "5min",
          usage.cacheReadTokens,
          usage.outputTokens,
          estimatedCostUsd,
          latencyMs,
          consultantId,
          agentId,
          mode,
        ],
      );
    });
  } catch (err) {
    throw new LLMTelemetryError(
      `Escritura de LLMInvocation falló (hard error por contrato): ${(err as Error).message}`,
    );
  }

  return { text: result.text, resolvedModel, invocationId, usage, latencyMs, estimatedCostUsd };
}
