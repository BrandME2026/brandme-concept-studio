# EXECUTION LOG — sesión nocturna autónoma (plan 8090)

> Registro por work order de la ejecución autónoma iniciada la noche del 2026-07-08
> (plan aprobado: ejecutar el producto 8090 fase por fase, arrancando por la Fase 1).
> Modalidad: autónoma con checkpoints escritos; commits locales, **sin push**.

## Estado de la cola (Fase 1 — ejecutable sin infra viva)

| # | WO | Estado |
|---|----|--------|
| 1 | WO-3 Multi-Tenant RLS + Test Suite | ✅ in_review |
| 2 | WO-7 ConfigStore | ✅ in_review (adelantado a WO-4: LLMWrapper depende de ConfigStore) |
| 3 | WO-4 LLM Wrapper | ✅ in_review |
| 4 | WO-6 Webhook Handler | ✅ in_review |
| 5 | WO-8 Observability | ✅ in_review (adelantado a WO-9: la alerta de breach lo necesita) |
| 6 | WO-9 Rate Limit | ✅ in_review |
| 7 | WO-32 Product Security | pendiente |
| 8 | WO-34 CI merge gate | pendiente |

Bloqueados por infra (decisión del plan, no fallo): WO-5 (Firebase Auth — necesita proyecto/service account), WO-10 (Firebase Storage). Diferidos por prioridad: WO-11, WO-40, WO-41.

---

## WO-3 — Multi-Tenant Isolation Layer (RLS) + Test Suite

- **Inicio:** 2026-07-08 23:59 · **Fin:** 2026-07-09 07:17 · **Duración:** 7h 18m de pared
  (incluye esperas de review delegada y pausas del harness; el trabajo fue continuo desde ~00:00)
- **Tokens subagentes (exacto, reportado por harness):** exploración 42.6k + diseño 85.7k + review A 70.3k + review B 89.6k + review ronda 2 98.0k ≈ **386k** (la ronda 2 reanuda al delegado B, posible doble conteo parcial). Sesión principal: no visible para el agente — ver `/cost`.
- **Estado:** `in_review` en 8090 (WO 13612b88) · Ejecución documentada en `.sw-factory/WO-3/`
- **Commit:** `180eac4` feat(db): WO-3 — Multi-Tenant Isolation Layer (RLS) + test suite

### Qué se construyó

1. **Tenant core:** tablas `consultants` + `consultant_sessions`; `consultant_id UUID NOT NULL` en `conversations`/`generations`/`leads`/`subscriptions` con default desde el GUC `app.consultant_id`.
2. **RLS estructural:** `ENABLE`+`FORCE ROW LEVEL SECURITY` + política `tenant_all` (USING/WITH CHECK por GUC) + políticas `system_*` explícitas por comando para superficies públicas. El publishGate (pago) se queda en SQL de la app, NO en políticas.
3. **TenantIsolationLayer** (`src/lib/db/tenant-context.ts`): `withTenant()` (transacción + `SET LOCAL` en pool; `SET` sesión + limpieza en direct), `withSystemContext(reason)`, `db()` que lanza sin contexto → 401. AsyncLocalStorage; anidamiento seguro; regla dura "nunca abarcar awaits no-DB".
4. **Migraciones versionadas:** `drizzle/0000–0003` (baseline idempotente = ensureSchema históricos; tenants; backfill con asserts fail-fast; RLS+GRANTs) + runner propio `scripts/db-migrate.ts` con advisory lock. Los `ensureSchema()` runtime se retiraron. Roles `brandme_app` (NOBYPASSRLS) / `brandme_migrator` (BYPASSRLS, solo tooling). drizzle-kit + `schema.ts` tipado para futuras migraciones por diff.
5. **Rutas:** `tenantRoute()` (401 antes de tocar datos) + `route-manifest.ts` (clasificación de ~26 endpoints: tenant / public-system / no-db, con test que reporta endpoints sin clasificar POR NOMBRE). Cookie `bmc_session` ahora se acuña SOLO en navegaciones HTML (middleware); las APIs sin cookie responden 401.
6. **Merge de login:** al vincular Firebase, la sesión se repunta al consultant canónico y el historial del provisional se reasigna (una transacción).
7. **Test suite:** 56 tests db (Vitest proyecto `db` contra Docker: migraciones, matriz RLS A/B × pooled/direct, limpieza de GUC drenando el pool, 25 contextos concurrentes, módulos, registro de endpoints) + **e2e-validator** Playwright con COV_PF_TENANT_001.1/.2/.3 contra la app real.
8. **Docs:** sección RLS + runbook Railway en `docs/BACKEND.md`.

### Verificado (evidencia de esta sesión)

- `pnpm test:all` → **118/118** (17 archivos; 62 unit preexistentes intactos + 56 db)
- `pnpm test:e2e` → **3/3** (COV_PF_TENANT_001: A no lee datos de B en ningún endpoint; sin cookie → 401 y cero filas; paridad pooled/direct)
- `pnpm build` → verde · `pnpm tsc --noEmit` → limpio en src
- Pase exploratorio manual (curl, 2 sesiones de navegador reales): aislamiento y 401 confirmados
- Review delegada: 2 rondas, verdict final **APPROVED** (`.sw-factory/WO-3/review-log.md`)

### Hallazgos de review (resueltos en esta sesión)

- **[blocking, PREEXISTENTE] Bypass de paywall** en `sitemap`, `api/gallery` y `api/gallery/[id]` (no pasaban `enforcePaywall`; webs impagas indexadas/servidas). Corregido con el mismo gate de `/webs` y `p/[slug]`.
- **[advisory] Runner de migraciones sin exclusión** entre corridas concurrentes → `pg_advisory_lock` añadido.

---

## WO-7 — ConfigStore + PlatformConfig

- **Inicio:** 2026-07-09 07:20 · **Fin:** 2026-07-09 07:31 · **Duración:** ~11m
- **Tokens subagentes (exacto):** review 48.4k
- **Estado:** `in_review` en 8090 (WO 8185bd68) · **Commit:** `c8c6851`
- **Qué:** read path EP-07 — tabla `platform_config` (migración 0004 con seeds de los tunables vigentes) + `ConfigStore` (cache 60s, typed accessors, invalidación). Migrados: caps de rate limit (10 rutas → `checkRateLimit`), tope diario LLM, concurrencia de extract, aliases de modelo alta/rápido (`getDesignModel` async).
- **Verificado:** 125/125 Vitest + 4/4 e2e (COV_PF_CONFIG_001.1: un UPDATE de admin cambió el cap de 429 EN VIVO sin redeploy) + build + review APPROVED.
- **⚠️ Operacional (para ti, al despertar):** los env `RL_*`, `LLM_DAILY_CAP` y `EXTRACT_CONCURRENCY` YA NO SE LEEN (contrato EP-07). Si están seteados en Railway, quítalos al deployar — los valores ahora viven en `platform_config` (defaults sembrados = los mismos de hoy). `.env.example` lo documenta.
- Pendiente para WO-4 (anotado): `chatModel`/fallback models/cache TTLs siguen en env; el LLMWrapper los llevará a PlatformConfig (AC-PF-016.2/.6).

---

## WO-4 — LLM Wrapper Service

- **Inicio:** 2026-07-09 07:32 · **Fin:** 2026-07-09 07:50 · **Duración:** ~18m
- **Tokens subagentes (exacto):** review 41.6k
- **Estado:** `in_review` en 8090 (WO 744883c0) · **Commit:** `fed4345`
- **Qué:** `invokeLLM` como interfaz exclusiva para agentes (WO-12+): aliases `large`/`fast` vía ConfigStore (Sonnet/Haiku sembrados según stack 8090), `cache_control` explícito por modo, rechazo de system prompts tenant-scoped (AC-PF-016.5), telemetría `llm_invocations` síncrona (hard error), `AIModelProvider` (EP-05) + adapter OpenRouter, `LLMBudgetBreaker` de gasto diario. Rutas del prototipo NO migradas (out of scope del WO; migran cuando se toquen).
- **Verificado:** 137/137 Vitest + 7/7 e2e (COV_PF_LLM_016 con transporte mock, cero tokens) + build + review APPROVED sin cambios.
- **Pendientes anotados:** `llm.pricing` y `llm.daily_cost_cap_usd` vacíos hasta recomputar el Cost Model (banner en 8090, owner: tú); `chatModel`/fallbacks de openrouter.ts pasarán al wrapper cuando las rutas migren.

---

## WO-6 — Webhook Handler Primitive

- **Inicio:** 2026-07-09 07:50 · **Fin:** 2026-07-09 07:58 · **Duración:** ~8m de implementación (+~6m de review en paralelo)
- **Tokens subagentes (exacto):** review 36.7k + ronda 2 46.6k
- **Estado:** `in_review` en 8090 (WO 5aa8b92a) · **Commit:** `06974be`
- **Qué:** primitivo `handleWebhook` + `WebhookAdapter` (firma → 400; dedup insert-before-process en `webhook_events`; transacción idempotente con rollback que libera el dedup; purga TTL EP-07). Stripe migrado.
- **Review:** Round 1 encontró un blocking REAL (UPDATE a 0 filas consumía el dedup en silencio) → fix con discriminante `applied/customer_not_found/stale_event` → Round 2 APPROVED.
- **⚠️ Cambio de conducta (para ti):** el webhook de Stripe ahora responde **500** ante fallos de negocio (antes 200): Stripe reintenta y el evento NO se pierde. Deuda conocida: sin dead-letter para fallos permanentes (reintentos ~3 días) — candidata a WO-8/observabilidad.
- **Verificado:** 144/144 Vitest + 9/9 e2e (COV_PF_WEBHOOK_001 contra la ruta real, firmas HMAC artesanales) + build.

---

## WO-8 — Observability Wrapper

- **Inicio:** 2026-07-09 07:59 · **Fin:** 2026-07-09 08:08 · **Duración:** ~9m
- **Tokens subagentes (exacto):** review 45.5k
- **Estado:** `in_review` en 8090 (WO 17faeb16) · **Commit:** `00a7798`
- **Qué:** `captureError` canónico con tags EP-04 automáticos (contexto ALS integrado en tenantRoute/invokeLLM/handleWebhook), scrub de PII, alerta por tasa (umbral EP-07), sink conectable. Sweep de ~27 `console.error` → `captureError`.
- **⚠️ Decisión de honestidad (para ti):** Sentry NO está integrado — no hay `SENTRY_DSN`. El default es log estructurado (`[observability] {json}` greppeable en Railway); cuando provisiones Sentry, se escribe el adapter y se enchufa vía `setObservabilitySink` sin tocar callers.
- **Verificado:** 151/151 Vitest + 10/10 e2e + build + review APPROVED sin hallazgos.

---

## WO-9 — Rate Limit Middleware (IP + consultant_id)

- **Inicio:** 2026-07-09 08:08 · **Fin:** 2026-07-09 08:16 · **Duración:** ~8m
- **Tokens subagentes (exacto):** review 38.5k
- **Estado:** `in_review` en 8090 (WO 95f938e2) · **Commit:** `b2fe83a` · **GitHub:** issue #6
- **Qué:** dimensión `consultant_id` simultánea con IP (sin double-count; primera alcanzada → 429+Retry-After antes de negocio) + alerta de breach vía ObservabilityWrapper en cada breach. Redis = target documentado.
- **Verificado:** 154/154 Vitest + 11/11 e2e + build + review APPROVED sin hallazgos.

---

## Trazabilidad en GitHub (pedida por Junior, 2026-07-09 08:15)

- **Project:** [BrandMe v0.3 — Ejecución 8090](https://github.com/orgs/BrandME2026/projects/1)
- **Issues #1–#6** (WO-3/7/4/6/8/9): `In Progress` = implementados, esperan TU revisión humana (espejo del `in_review` de 8090)
- **Issues #7–#8** (WO-32/34): `Todo` — cola de esta sesión · **#9–#10** (WO-5/10): `Todo` + label `blocked-infra`
- Desde WO-32 en adelante, cada WO nuevo crea su issue al arrancar y se actualiza al cerrar.

### Notas / pendientes que NO bloquean

- 2 errores de tipos PREEXISTENTES en fixtures de tests unit (`design-md.test.ts`, `tokens.test.ts`) — los tests pasan; limpiar cuando WO-34 añada typecheck a CI.
- Next 16 depreca la convención `middleware` (→ `proxy`) — preexistente, migrar aparte.
- El working tree tenía borrados locales previos a esta sesión (AGENTS.md, CLAUDE.md, DESIGN.md, README.md) y untracked del tooling (.agents/, .claude/, skills-lock.json) — NO se tocaron ni commitearon.
- Despliegue a Railway: el runbook está en docs/BACKEND.md; NO se tocó producción esta noche (todo contra Docker local).
