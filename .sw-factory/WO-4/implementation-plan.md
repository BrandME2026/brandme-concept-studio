<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-4

**Work Order:** WO-4 — Build 1 — LLM Wrapper Service (aliases, cache_control, telemetry)
**Created At (UTC):** 2026-07-09T12:34:01Z

## Summary

Construye `LLMWrapper` como interfaz exclusiva de invocación de modelos (REQ-PF-016): aliases `large`/`fast` resueltos vía ConfigStore, `cache_control` explícito por modo (5m interactivo / 1h batch, valores en ConfigStore — AC-PF-016.6), rechazo de system prompts con contenido tenant-scoped (AC-PF-016.5), telemetría `LLMInvocation` síncrona (fallo = hard error, AC-PF-016.3) y gate del `LLMBudgetBreaker` (techo de gasto diario por costo, cap en ConfigStore) ANTES de cualquier transporte. Transporte delegado a `AIModelProvider` (EP-05) con adapter OpenRouter que REUSA el cliente existente.

**Scope note (del WO):** NO se migran las rutas existentes (generate/chat/agent siguen en openrouter.ts directo) — el wrapper es el punto de entrada mandatorio para los agentes desde WO-14. El `llmBudget` de OPERACIONES (rate-limit.ts) sigue gateando las rutas del prototipo; el breaker de COSTO gatea el wrapper (el blueprint los distingue: el breaker no es rate limiter).

## Code Reuse And Package Structure

**Reuso:** factory `openrouter` + `cache_control` de `src/lib/ai/openrouter.ts` (se extrae helper `buildOpenRouterModel`) · ConfigStore (WO-7) para aliases/TTLs/cap/rates · `withSystemContext`/`db()` (WO-3) para la telemetría · runner de migraciones · `MockLanguageModelV2` de `ai/test` para provider fake en tests.

**Nuevos:** `src/lib/ai/model-provider.ts` (interfaz EP-05) · `src/lib/ai/openrouter-provider.ts` (adapter) · `src/lib/ai/llm-wrapper.ts` (invokeLLM) · `src/lib/ai/llm-budget-breaker.ts` · `drizzle/0005_llm_invocations.sql` · `tests/db/llm-wrapper.test.ts` · `e2e-validator/tests/platform/llm-wrapper.spec.ts`.

**Modificados:** `src/lib/ai/openrouter.ts` (extraer builder; sin cambio de conducta) · `src/lib/db/schema.ts` (llmInvocations).

## Components And Flow

```ts
// model-provider.ts (EP-05)
type CacheTtl = "5m" | "1h";
interface ModelRequestOptions { fallbackModels: string[]; cacheTtl: CacheTtl }
interface AIModelProvider { name: string; languageModel(model: string, opts: ModelRequestOptions): LanguageModel }

// llm-wrapper.ts
type ModelAlias = "large" | "fast";
type InvocationMode = "realtime" | "batch";
invokeLLM({ alias, system, prompt, mode = "realtime", consultantId?, agentId?, provider? }): Promise<{
  text, resolvedModel, invocationId, usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
}>
// errores tipados: LLMStaticPromptError · LLMBudgetExceededError · LLMTelemetryError · LLMUnknownAliasError
```

Flujo de invokeLLM: (1) validar system prompt estático — heurística runtime baseline (rechaza si contiene el consultantId, un UUID o un email; la garantía profunda es code review por AC-PF-016.5) → (2) gate del breaker (cap `llm.daily_cost_cap_usd`; default null = sin techo hasta que el Cost Model se recalcule — pendiente 8090 con banner) → (3) resolver alias `llm.alias_large|alias_fast` + TTL `llm.cache_ttl_interactive|cache_ttl_batch` + fallbacks `llm.fallback_models` vía ConfigStore; alias desconocido → error temprano (ADR-001) → (4) `provider.languageModel(...)` + `generateText` midiendo latencia (el wrapper NUNCA se llama dentro de withTenant — regla WO-3) → (5) costo estimado con rates `llm.pricing` (jsonb por modelo/mtok; sin rate → 0 y warn; nunca hardcodeado) → (6) INSERT `llm_invocations` bajo `withSystemContext("llm-telemetry")` — fallo = LLMTelemetryError (hard error) → (7) breaker.track(costo).

**llm_invocations (0005):** modelo del blueprint (alias, resolved_model_name, input/cache_write/cache_read/output tokens, cache_write_ttl_variant, estimated_cost_usd decimal(10,6), latency_ms, consultant_id FK nullable, agent_id, invocation_mode, created_at). Tabla de plataforma SIN RLS (telemetría; exenta de retención estándar). GRANT INSERT+SELECT a brandme_app. Seeds ConfigStore: `alias_large` "anthropic/claude-sonnet-4.6" · `alias_fast` "anthropic/claude-haiku-4.5" (stack 8090: OpenRouter→Claude Sonnet/Haiku; la tabla autoritativa vive en el Cost Model) · `cache_ttl_interactive` "5m" · `cache_ttl_batch` "1h" · `fallback_models` array actual · `daily_cost_cap_usd` null · `pricing` {}.

## Steps

1. RED: `tests/db/llm-wrapper.test.ts` con provider fake (MockLanguageModelV2): alias desde config (+ remap en vivo), alias desconocido, TTL por modo, rechazo AC-PF-016.5 (email/UUID/consultantId — el provider NO se invoca), fila de telemetría con campos, REVOKE INSERT → LLMTelemetryError, breaker (cap bajo + track → LLMBudgetExceededError).
2. GREEN: 0005 + model-provider + openrouter-provider (+ extraer builder en openrouter.ts) + llm-budget-breaker + llm-wrapper + schema.ts.
3. Checkpoint: tsc + unit + db + build verdes.
4. E2E `llm-wrapper.spec.ts` (@COV_PF_LLM_016.1/.2/.3) — integración: wrapper REAL + DB REAL + transporte mock (sin gastar tokens); documentado en el spec.
5. Review delegada → review-log → commit → in_review.

## Testing

`pnpm test:db` (suite nueva) · `pnpm test` · `pnpm test:e2e` (7 specs: tenant 3 + config 1 + llm 3) · `pnpm tsc --noEmit` · `pnpm build`.
