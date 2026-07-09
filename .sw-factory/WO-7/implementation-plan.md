<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-7

**Work Order:** WO-7 — Build 1 — ConfigStore + PlatformConfig (runtime configuration)
**Created At (UTC):** 2026-07-09T12:20:09Z

## Summary

Implementa el read-path canónico de configuración EP-07: tabla `PlatformConfig` (migración 0004, sembrada con los tunables actuales) + accessor `ConfigStore` con cache local de 60s e invalidación manual, y migra los tunables existentes (caps de rate limit, tope diario LLM, concurrencia de extract, aliases de modelo alta/rápido) detrás de él. El write path admin es Build 6 (out of scope); los secrets siguen en env.

## Code Reuse And Package Structure

**Reuso:** `withSystemContext`/`db()` de WO-3 (platform_config es tabla de plataforma sin RLS; se lee bajo system scope). Runner de migraciones y harness de tests db existentes. Patrón de suites `tests/db/*`.

**Nuevos:** `src/lib/config/config-store.ts` · `drizzle/0004_platform_config.sql` · `tests/db/config-store.test.ts` · `e2e-validator/tests/platform/config-store.spec.ts`.

**Modificados:** `src/lib/db/schema.ts` (tabla platformConfig) · `src/lib/security/rate-limit.ts` (caps/daily cap/concurrencia vía ConfigStore; motor en memoria intacto) · `src/lib/ai/openrouter.ts` (QUALITY_MODELS vía ConfigStore; getDesignModel async) · los 10 call-sites de rate limit + extract + generate + callers de getDesignModel.

## Components And Flow

**ConfigStore (`src/lib/config/config-store.ts`):**

```ts
getConfigValue<T>(featureArea: string, key: string, fallback: T): Promise<T>
getConfigNumber(featureArea: string, key: string, fallback: number): Promise<number>
getConfigString(featureArea: string, key: string, fallback: string): Promise<string>
invalidateConfigCache(): void   // hook del write path (Build 6) y de tests
```

- Resolución: `current_value ?? default_value ?? fallback`. Lectura bajo `withSystemContext("config-store")`. Cache por `(area,key)` con TTL 60s (`CONFIG_CACHE_TTL_MS` override para tests/e2e; el contrato de 60s queda como default de producción). Cachea también misses.
- Degradación deliberada: sin `DATABASE_URL` o ante error de lectura → `console.error` + fallback (un fallo de config no tumba superficies; los fallbacks son los defaults actuales de producción). Tipos inválidos (p.ej. number no finito) → fallback + warn.

**PlatformConfig (0004):** modelo del blueprint (`feature_area`, `config_key`, `current_value jsonb`, `default_value jsonb`, `last_modified_at`, `last_modified_by uuid` — SIN FK: la identidad admin llega en Build 6, drift documentado). Unique `(feature_area, config_key)`. `GRANT SELECT` a brandme_app (write path = Build 6/migrator). Seeds (default_value, current_value NULL):
- `rate_limiting`: generate/extract/chat/agent/resolve/leads/checkout/speech `_per_min` (5/6/20/20/15/5/5/10)
- `llm`: `daily_cap` 300 · `model_alias_alta` "openai/gpt-5.5" · `model_alias_rapido` "anthropic/claude-sonnet-4.6"
- `extract`: `max_concurrent` 3

**Consumidores migrados:**
- `rate-limit.ts`: nuevo `checkRateLimit(name, key): Promise<RateResult>` (lee `rate_limiting.<name>_per_min`, ventana fija 60s, motor `rateLimit()` intacto); `LIMITS` se elimina; `llmBudget.tryConsume()` y `acquireExtractSlot()` pasan a async leyendo su cap. Los env `RL_*`/`LLM_DAILY_CAP`/`EXTRACT_CONCURRENCY` DEJAN de leerse (contrato EP-07) — anotar en EXECUTION-LOG por si están seteados en Railway.
- `openrouter.ts`: `getDesignModel(quality, mode)` pasa a async resolviendo el alias vía ConfigStore (defaults = valores actuales); `designModel` const se elimina si no tiene callers. `chatModel`/fallbacks/cache TTLs se quedan en env — son scope de WO-4 (LLMWrapper, AC-PF-016.2/.6); anotado como pendiente explícito.

## Steps

1. RED: `tests/db/config-store.test.ts` (seeds de 0004; default; override+invalidate; TTL corto; fallback sin fila; tipo inválido).
2. GREEN: `drizzle/0004_platform_config.sql` + `src/lib/config/config-store.ts` + schema.ts.
3. Migrar consumidores: rate-limit.ts (+10 call-sites), extract, generate (llmBudget), openrouter (+callers de getDesignModel). Checkpoint: `pnpm tsc --noEmit` + unit + db verdes + `pnpm build`.
4. E2E `config-store.spec.ts` (@COV_PF_CONFIG_001.1): con `CONFIG_CACHE_TTL_MS=2000` en el webServer, (a) el cap sembrado gobierna el 429 (leads: 6ª petición por IP → 429), (b) UPDATE de `current_value` vía migrator → nueva conducta en <60s sin redeploy (poll con IPs frescas vía x-forwarded-for).
5. Review delegada (1 bucket) → review-log → commit → in_review.

## Testing

- `pnpm test:db` — nueva suite config-store + idempotencia extendida a 0004.
- `pnpm test` — unit intactos (openrouter.test/cache-control.test pueden requerir ajuste por getDesignModel async; ajustar SOLO forma, no aserciones de negocio).
- `pnpm test:e2e` — COV_PF_TENANT_001 (regresión) + COV_PF_CONFIG_001.
- `pnpm build` + `pnpm tsc --noEmit`.
