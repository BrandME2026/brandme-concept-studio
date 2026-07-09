<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-3

**Work Order:** WO-3 — Build 1 — Multi-Tenant Isolation Layer (RLS) + Test Suite
**Created At (UTC):** 2026-07-09T05:00:03Z

## Summary

Implementa el aislamiento multi-tenant a nivel de base de datos (requisito #1 no-negociable, ADR-001): entidad `Consultant` como tenant, columna `consultant_id` + políticas RLS con `FORCE ROW LEVEL SECURITY` en toda tabla tenant-scoped, contexto por request `withTenant()` (`SET LOCAL` en transacción para pool / `SET` de sesión para conexiones directas), rechazo 401 antes de cualquier query sin contexto, migración desde el aislamiento actual por cookie `session_id`, y la tenant-isolation test suite (harness + suites Vitest contra Postgres Docker + E2E Playwright) que gateará cada merge desde Build 1 (el gate CI en sí es WO-34).

Enfoque: Drizzle-kit entra SOLO como tooling de schema/migraciones versionadas (decisión del usuario 2026-07-01); las queries siguen en `pg` crudo. Los `ensureSchema()` runtime se retiran (el rol de app pierde DDL; una tabla creada en runtime nacería sin RLS). Acceso a datos únicamente vía `db()` ligado a un contexto explícito (`withTenant` / `withSystemContext`) — `getPool()` deja de exportarse, haciendo el acceso sin contexto imposible por construcción.

## Code Reuse And Package Structure

**Reuso directo:**
- `src/lib/db/client.ts` — lógica de conexión/SSL existente se conserva; solo se des-exporta `getPool` (pasa a consumo interno de la capa de contexto).
- `src/lib/db/{conversations,history,leads,subscriptions,users}.ts` — queries SQL existentes se conservan; cambian el handle (`getPool().query` → `db().query`) y pierden el filtro `session_id` donde RLS lo reemplaza.
- `src/lib/session.ts` — se divide: `readSessionId()` (solo lectura) + acuñado de cookie movido a `src/middleware.ts` (navegaciones HTML).
- `src/lib/auth/verify-token.ts` — sin cambios; la resolución de tenant se apoya en el vínculo `user_sessions` existente.
- Patrón de tests: Vitest ya configurado (`vitest.config.ts`, 12 suites unit existentes que deben seguir verdes).

**Archivos nuevos:**
- Capa de contexto: `src/lib/db/tenant-context.ts` (withTenant, withSystemContext, db(), TenantContextError), `src/lib/tenant.ts` (resolveConsultantId/requireConsultantId), `src/lib/api/tenant-route.ts` (wrapper 401), `src/lib/api/route-manifest.ts` (clasificación de rutas).
- Migraciones: `drizzle.config.ts`, `src/lib/db/schema.ts` (schema Drizzle, fuente de tipos), `drizzle/0000_baseline.sql`, `drizzle/0001_tenants.sql`, `drizzle/0002_backfill.sql`, `drizzle/0003_rls.sql`, `scripts/db-migrate.ts`.
- Infra local: `docker-compose.yml` (postgres:16-alpine, puerto 54329), `scripts/db/init-roles.sql` (`brandme_app` NOBYPASSRLS / `brandme_migrator` owner).
- Test suite: `tests/db/global-setup.ts`, `tests/db/harness.ts`, `tests/db/{migrations,rls-policies,tenant-context,db-modules,endpoint-registry}.test.ts`.
- E2E: `e2e-validator/` (package.json, playwright.config.ts, `tests/platform/tenant-isolation.spec.ts`).
- Docs: runbook de roles/migraciones en `docs/BACKEND.md`.

**Modificados:** `vitest.config.ts` (proyectos unit/db), `package.json` (deps drizzle-orm/drizzle-kit/tsx + scripts db:up/db:down/db:migrate/test:db/test:all), `eslint.config.mjs` (no-restricted-imports para `pg`), `src/middleware.ts`, `src/lib/session.ts`, los 5 módulos db, y los route handlers según clasificación del manifiesto.

## Components And Flow

**TenantIsolationLayer (blueprint f4fa0000) → `src/lib/db/tenant-context.ts`:**

```ts
class TenantContextError extends Error {}            // capa API la mapea a 401
type ConnectionMode = "pooled" | "direct";
withTenant<T>(consultantId: string, fn: () => Promise<T>, opts?: { mode?: ConnectionMode }): Promise<T>
withSystemContext<T>(reason: string, fn: () => Promise<T>, opts?: { mode?: ConnectionMode }): Promise<T>
db(): DbHandle                                        // { query(text, params) } ligado al contexto ALS
currentContext(): { kind: "tenant"; consultantId } | { kind: "system"; reason } | null
```

- Propagación por `AsyncLocalStorage`. Pooled: `pool.connect()` → `BEGIN` → `SELECT set_config('app.consultant_id', $1, true)` (semántica SET LOCAL, parametrizado) → fn → COMMIT/ROLLBACK → release. Direct: `new Client` dedicado → `set_config(..., false)` → fn → limpieza + `end()` en finally. Valida UUID antes de setear (fail fast).
- Anidamiento: mismo tenant reusa cliente/transacción; distinto tenant → `TenantMismatchError`; tenant/system no mezclables.
- Regla dura (docstring + review): `withTenant` NUNCA abarca awaits no-DB (streaming LLM con pool max 5 → inanición). Rutas generate/chat usan varios bloques cortos.
- `withSystemContext` NO es BYPASSRLS: GUC `app.scope='system'` evaluado por políticas explícitas por comando, solo para superficies públicas enumeradas.

**Modelo de datos (blueprint Platform Foundation, modelo `Consultant`):**
- `consultants`: `id UUID PK DEFAULT gen_random_uuid()`, `firebase_uid TEXT REFERENCES users(id)` (nullable, UNIQUE parcial — `users.id` ES el Firebase UID), `created_at`. `account_state` y campos de credenciales NO van en este WO (scope de WO-5/Build 2; EP-01 aditivo lo permite sin migración de ruptura — deriva documentada).
- `consultant_sessions`: `session_id TEXT PK` (cookie `bmc_session`) → `consultant_id UUID NOT NULL FK`.
- Tenant-scoped con RLS+FORCE: `conversations`, `generations`, `leads`, `subscriptions` — ganan `consultant_id UUID NOT NULL FK` con `DEFAULT NULLIF(current_setting('app.consultant_id', true), '')::uuid` (minimiza cambios en INSERTs). `leads` sin default (valor por lookup de slug bajo system scope). Identidad SIN RLS (documentado): `users`, `user_sessions`, `consultants`, `consultant_sessions` — solo se tocan bajo `withSystemContext('tenant-resolution'|'auth-link-merge')`.
- `session_id` se CONSERVA en todas las tablas (trazabilidad/rollback); deja de ser frontera.

**Flujo por request (authenticated):** route handler → `tenantRoute(handler)` → `requireConsultantId()` (lee cookie con `readSessionId()`; sin cookie → `TenantContextError` → 401 sin tocar datos; con cookie → lookup/auto-provisión en `consultant_sessions` bajo system scope) → handler recibe `{ consultantId }` → abre `withTenant(consultantId, ...)` por bloque de acceso a datos → módulos db usan `db()`.

**Políticas RLS (patrón por tabla, `drizzle/0003_rls.sql`):**

```sql
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_all ON conversations FOR ALL
  USING      (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid)
  WITH CHECK (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
CREATE POLICY system_select ON conversations FOR SELECT
  USING (current_setting('app.scope', true) = 'system');
```

Matriz system por tabla: conversations SELECT+UPDATE(merge) · generations SELECT+UPDATE(merge) · leads INSERT(WITH CHECK consultant_id IS NOT NULL)+SELECT? no—solo INSERT+UPDATE(merge) · subscriptions SELECT+UPDATE(webhook Stripe, merge). El publishGate (`published=true` + suscripción) permanece en SQL de la app — NO se codifica en políticas (riesgo de falso legacy-público). GUC sin setear/limpiado → `NULLIF(...,'')::uuid` = NULL → cero filas, INSERTs rechazados por WITH CHECK.

**Backfill (0002):** (1) un consultant por `user_id` distinto de `user_sessions` + mapear todas sus sesiones; (2) un consultant por `session_id` huérfano restante (distinct sobre conversations ∪ generations ∪ subscriptions); (3) UPDATE por join a las 3 tablas; (4) leads por `generations.slug`; (5) asserts `DO $$ ... RAISE EXCEPTION` si queda NULL antes del `SET NOT NULL` (en 0003). Merge al login (`auth/link`): sesión → consultant canónico del user + reasignación de filas del provisional, una transacción bajo `withSystemContext('auth-link-merge')`.

**Clasificación de rutas → `src/lib/api/route-manifest.ts`:**
- `tenant`: api/conversations (GET/POST), api/conversations/[id] (GET/PUT/DELETE), api/history (GET), api/history/[id] (GET), api/leads (GET), api/generate (POST), api/publish (POST), api/checkout (POST), api/subscription (GET), api/auth/link (POST, internamente system para el merge). Páginas server: `c/[conversationId]` (sin tenant → notFound()).
- `public-system`: api/leads (POST), api/agent, api/chat, api/gallery, api/gallery/[id], api/stripe/webhook, p/[slug], p/[slug]/llms.txt, llms.txt, sitemap, webs (galería pública).
- `no-db`: api/extract, api/resolve, api/speech-to-text, api/text-to-speech, api/voice-capabilities.
- `endpoint-registry.test.ts` hace glob de `src/app/**/route.ts` + páginas server con DB y falla nombrando cualquier ruta no clasificada (AC-PF-002.3).

## Steps

1. **Infra de test (RED)** — docker-compose.yml, scripts/db/init-roles.sql, deps (drizzle-orm, drizzle-kit, tsx), scripts pnpm, vitest.config.ts con proyectos unit/db, tests/db/global-setup.ts, tests/db/migrations.test.ts. Verificar: `pnpm db:up` levanta Postgres; `pnpm test:db` falla SOLO por migraciones ausentes; `pnpm test` (unit) sigue verde.
2. **Baseline + migrador (GREEN parcial)** — drizzle.config.ts, src/lib/db/schema.ts, drizzle/0000_baseline.sql (SQL exacto de los ensureSchema actuales), scripts/db-migrate.ts. Verificar: migrations.test parte baseline verde, incluida idempotencia (aplicar dos veces).
3. **Tenants + backfill** — RED: casos 0001/0002 en migrations.test.ts con fixture legacy (multi-sesión mismo user). GREEN: drizzle/0001_tenants.sql + 0002_backfill.sql. Verificar: mapping consistente, huérfanos cubiertos.
4. **RLS + withTenant (núcleo)** — RED: rls-policies.test.ts (matriz A/B × pooled/direct × tabla) + tenant-context.test.ts (limpieza GUC drenando pool, rollback, anidamiento, 25 concurrentes con pool max 5) contra stub que lanza. GREEN: drizzle/0003_rls.sql + src/lib/db/tenant-context.ts. Verificar: matriz completa verde en ambos modos.
5. **Cierre de getPool + módulos db** — RED: db-modules.test.ts (cada función pública como A no ve datos de B; sin contexto lanza TenantContextError). GREEN: des-exportar getPool, retirar ensureSchema de los 5 módulos, migrar a db(), nuevas firmas sin sessionId como discriminador. Verificar: `pnpm tsc --noEmit` lista call-sites rotos (input del paso 6); regla ESLint activa.
6. **Rutas** — RED: endpoint-registry.test.ts (manifiesto vacío → nombra ~26 rutas). GREEN por grupos: src/lib/tenant.ts + tenant-route.ts + split session/middleware; luego rutas tenant, luego public-system. Verificar por grupo: `pnpm build` + unit + db verdes.
7. **Merge de login** — RED: test del flujo auth-link-merge en db-modules.test.ts. GREEN: extensión de users.ts. Verificar: historial preservado tras login, canónico estable.
8. **E2E** — e2e-validator/ con tenant-isolation.spec.ts (@COV_PF_TENANT_001.1/.2/.3). Verificar: `pnpm playwright test` verde contra app real + Docker DB.
9. **Docs + cierre** — docs/BACKEND.md (roles, env vars DATABASE_URL vs DATABASE_URL_MIGRATIONS sin fallback, runbook Railway: crear roles → migrar → rotar URL → deploy; rollback documentado solo vía migración). Suite completa final.

## Testing

- **Comandos:** `pnpm db:up` (Docker Postgres 54329) · `pnpm db:migrate` · `pnpm test` (unit, sin DB — comportamiento actual intacto) · `pnpm test:db` (proyecto db, serial, forks) · `pnpm test:all` · `cd e2e-validator && pnpm playwright test`.
- **tests/db/migrations.test.ts** — baseline aplica en DB vacía + idempotente; backfill con fixture legacy (2 sesiones mismo user → mismo consultant; huérfanos → consultant propio); asserts pre-NOT NULL.
- **tests/db/rls-policies.test.ts** — 2 tenants A/B: por tabla × {pooled, direct}: A ve solo lo suyo (counts exactos), UPDATE/DELETE cross-tenant rowCount 0, INSERT hereda consultant_id del GUC, noContext() → SELECT 0 filas + INSERT rechazado. Paridad de resultados entre modos (AC-PF-015.2 / COV_PF_TENANT_001.3).
- **tests/db/tenant-context.test.ts** — GUC limpio tras uso (drenar pool con >max checkouts crudos), ROLLBACK en excepción, anidamiento (mismo tenant reusa; distinto lanza; tenant+system lanza), 25 withTenant concurrentes sin contaminación.
- **tests/db/db-modules.test.ts** — toda función pública de los 5 módulos: aislamiento A/B + TenantContextError sin contexto + flujo merge login.
- **tests/db/endpoint-registry.test.ts** — glob vs manifiesto; ruta sin clasificar → fallo con nombre (AC-PF-002.3).
- **e2e-validator/tests/platform/tenant-isolation.spec.ts** — @COV_PF_TENANT_001.1 (dos contexts Playwright con cookies independientes; datos de B jamás aparecen en endpoints de A), .2 (sin cookie → 401 y cero filas leídas), .3 (asserts del harness en pooled y direct, resultados idénticos).
- **Manual/exploratorio (review phase):** levantar `pnpm dev` contra Docker, recorrer flujo anónimo (generar → historial → publicar) y verificar aislamiento con dos navegadores/perfiles distintos.
