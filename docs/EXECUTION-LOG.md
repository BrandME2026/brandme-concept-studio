# EXECUTION LOG — sesión nocturna autónoma (plan 8090)

> Registro por work order de la ejecución autónoma iniciada la noche del 2026-07-08
> (plan aprobado: ejecutar el producto 8090 fase por fase, arrancando por la Fase 1).
> Modalidad: autónoma con checkpoints escritos; commits locales, **sin push**.

## Estado de la cola (Fase 1 — ejecutable sin infra viva)

| # | WO | Estado |
|---|----|--------|
| 1 | WO-3 Multi-Tenant RLS + Test Suite | ✅ in_review |
| 2 | WO-4 LLM Wrapper | pendiente |
| 3 | WO-7 ConfigStore | pendiente |
| 4 | WO-6 Webhook Handler | pendiente |
| 5 | WO-9 Rate Limit | pendiente |
| 6 | WO-8 Observability | pendiente |
| 7 | WO-32 Product Security | pendiente |
| 8 | WO-34 CI merge gate | pendiente |

Bloqueados por infra (decisión del plan, no fallo): WO-5 (Firebase Auth — necesita proyecto/service account), WO-10 (Firebase Storage). Diferidos por prioridad: WO-11, WO-40, WO-41.

---

## WO-3 — Multi-Tenant Isolation Layer (RLS) + Test Suite

- **Inicio:** 2026-07-08 23:59 · **Fin:** 2026-07-09 07:17 · **Duración:** 7h 18m de pared
  (incluye esperas de review delegada y pausas del harness; el trabajo fue continuo desde ~00:00)
- **Tokens subagentes (exacto, reportado por harness):** exploración 42.6k + diseño 85.7k + review A 70.3k + review B 89.6k + review ronda 2 98.0k ≈ **386k** (la ronda 2 reanuda al delegado B, posible doble conteo parcial). Sesión principal: no visible para el agente — ver `/cost`.
- **Estado:** `in_review` en 8090 (WO 13612b88) · Ejecución documentada en `.sw-factory/WO-3/`
- **Commit:** ver `git log` (feat(db): WO-3 …)

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

### Notas / pendientes que NO bloquean

- 2 errores de tipos PREEXISTENTES en fixtures de tests unit (`design-md.test.ts`, `tokens.test.ts`) — los tests pasan; limpiar cuando WO-34 añada typecheck a CI.
- Next 16 depreca la convención `middleware` (→ `proxy`) — preexistente, migrar aparte.
- El working tree tenía borrados locales previos a esta sesión (AGENTS.md, CLAUDE.md, DESIGN.md, README.md) y untracked del tooling (.agents/, .claude/, skills-lock.json) — NO se tocaron ni commitearon.
- Despliegue a Railway: el runbook está en docs/BACKEND.md; NO se tocó producción esta noche (todo contra Docker local).
