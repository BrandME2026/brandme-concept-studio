<!--lint disable strong-marker-->

# Review Log: WO-3

**Work Order:** WO-3 — Build 1 — Multi-Tenant Isolation Layer (RLS) + Test Suite
**Initialized At (UTC):** 2026-07-09T05:00:03Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Dos delegados de review en paralelo: bucket A (capa de datos + migraciones) y bucket B (rutas + sesión/middleware + tests). Change set: 34 archivos modificados + 10 rutas/dirs nuevos (ver git status del 2026-07-09).

### Requirements Alignment

**Blocking:** ninguno.

**Advisory:** ninguno. AC-PF-001.1–.4 (aislamiento estructural, 401 sin sesión), AC-PF-002.1–.4 (suite con ≥2 tenants, reporta endpoints desprotegidos por nombre vía route-manifest, lista para gate CI en WO-34), AC-PF-015.1–.2 (validación pooled/direct) verificados con evidencia en tests. AC-PF-002.5/.6 explícitamente fuera de scope (Build 4+/9). AC-PF-001.5 (brand admin) fuera de scope (Build 9).

### Blueprint Alignment

**Blocking:** ninguno.

**Advisory:**
- Deriva documentada y aceptada: modelo `Consultant` del blueprint incluye `account_state` y campos de credenciales — se difieren a WO-5/Build 2 (EP-01 aditivo). `firebase_uid` alineado al blueprint.
- Deriva documentada: runner de migraciones propio en vez del journal de drizzle-kit (baseline debe aplicar idempotente sobre la DB Railway existente); drizzle-kit queda configurado para generar futuras migraciones. Honestidad técnica: las queries siguen en pg crudo (coexistencia decidida por el usuario 2026-07-01); NO afirmamos "usar Drizzle" como ORM de runtime.

### Architecture And Conventions

**Blocking:** ninguno.

**Advisory (bucket A, confianza 85) — RESUELTO en esta ronda:** `scripts/db-migrate.ts` sin exclusión entre runners concurrentes (deploys solapados podrían duplicar consultants en el backfill de huérfanos). Fix aplicado: `pg_advisory_lock(hashtext('brandme_migrations'))` al inicio, liberado con el `client.end()` del finally. Suite db re-verificada verde (56/56).

### Tests And Build

**Commands run:** `pnpm test` (62/62 unit), `pnpm test:db` (56/56), `pnpm test:all` (118/118, 17 archivos), `pnpm test:e2e` (3/3 COV_PF_TENANT_001), `pnpm tsc --noEmit` (limpio en src salvo 2 errores PREEXISTENTES en fixtures de `design-md.test.ts`/`tokens.test.ts` — tipos incompletos, los tests pasan; baseline documentado, no ocultado), `pnpm build` (verde).

**Blocking:** ninguno.

**Advisory:** los 2 errores de tipos preexistentes en fixtures de tests unit; fuera de scope de WO-3, candidatos a limpieza en WO-34 (CI con typecheck).

### User-Facing Verification

**Skipped:** no.

**Evidence:** pase exploratorio manual con curl contra `next dev` real + Docker DB (2026-07-09 07:12): sin cookie → 401 en conversations/history/leads/publish; sesión A crea y lista su conversación; sesión B lista vacía, 404 al leer la conversación de A, DELETE cruzado no borra (la conversación sigue 200 para A); gallery/webs/sitemap.xml/llms.txt → 200. Los 3 specs e2e ejercitan el mismo flujo con el middleware real acuñando cookies.

**Blocking:** ninguno.

**Advisory:** Next 16 avisa `middleware` file convention deprecada (usar `proxy`) — PREEXISTENTE, no scope de WO-3.

### Security, Privacy, And Data Safety

**Skipped:** no.

**Blocking (bucket B, confianza 90) — RESUELTO en esta ronda:** bypass del paywall PREEXISTENTE (no introducido por WO-3) en tres superficies públicas que no pasaban `enforcePaywall`: `sitemap.ts` (indexaba webs impagas), `api/gallery` (las listaba) y `api/gallery/[id]` (servía su HTML). Contradice `publish/route.ts` que exige suscripción server-side. Fix aplicado (commit separado): los tres call-sites pasan `isStripeConfigured()`, y `gallery/[id]` omite el fallback de `conversations` (sin gate propio) cuando el paywall está activo — mismo criterio documentado de `p/[slug]/route.ts`. Cierra también el advisory relacionado (confianza 55) sobre `getPublicConversationPage` sin gate.

**Advisory:** passwords hardcodeadas en `scripts/db/init-roles.sql` — aceptable: Docker LOCAL efímero (tmpfs); en Railway se ejecuta a mano con credenciales propias (runbook en docs/BACKEND.md).

### Round 1 Verdict

- Total blocking: 1 (paywall, preexistente — corregido)
- Total advisory: 4 (1 corregido — advisory lock; 3 documentados/preexistentes)
- Files reviewed: 34 modificados + 10 nuevos (lista completa en outputs de los delegados)
- **Verdict:** CHANGES_REQUESTED → fixes aplicados; pasa a Round 2

---

## Round 2

Re-review delegada (mismo delegado del bucket B) SOLO sobre los fixes: gate de paywall en sitemap/gallery/gallery-[id] + advisory lock del runner. Verificación local previa: tsc limpio, 118/118 Vitest, 3/3 e2e.

### Round 2 Verdict

Delegado confirmó los 4 puntos: (1) sitemap con gate, límite 200 intacto; (2) gallery con gate, límite 60 explícito = mismo valor que el default previo, sin cambio de comportamiento; (3) gallery/[id] con gate + fallback de conversations omitido bajo paywall, patrón textual de p/[slug]; (4) advisory lock correcto (se libera al cerrar la sesión). Sin imports huérfanos, sin firmas tocadas, sin issues nuevos. Nota adicional del delegado: `api/chat` usa `listAllGenerations(8)` sin gate y es CORRECTO (solo nombres/hosts para el prompt, no expone HTML ni datos sensibles).

- Total blocking: 0
- Total advisory: 0 nuevos
- **Verdict:** APPROVED
