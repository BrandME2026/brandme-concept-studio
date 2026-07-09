<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-34

**Work Order:** WO-34 — Build 1 — CI / Test Runner pipeline (merge gate)
**Created At (UTC):** 2026-07-09T14:15:00Z

## Summary

Introduce el pipeline CI (GitHub Actions) que cierra la brecha entre verificación manual y gate obligatorio: `pnpm install --frozen-lockfile` → lint → `tsc --noEmit` → Vitest completo (unit + proyecto db contra Postgres en Docker con los roles RLS reales) → e2e Playwright (app real). La TenantIsolationTestSuite (WO-3) corre dentro de `test:all` y BLOQUEA el merge; los endpoints desprotegidos se reportan POR NOMBRE (endpoint-registry). Protección de branch `main` con el check requerido (vía gh api; si faltan permisos, paso manual documentado).

**Prerequisito ejecutado:** tsc y lint quedaron 100% limpios (2 fixtures con tipos incompletos preexistentes arreglados + 2 warnings de unused vars) — con el gate activo eran blockers.

**Nota de trazabilidad:** el WO linkea el blueprint standalone `TenantIsolationTestSuite` (8fef7c4d), eliminado de 8090 el 2026-07-01 (consolidado dentro de TenantIsolationLayer y del container CI / Test Runner, leído completo) — link residual conocido, no bloquea.

## Code Reuse And Package Structure

**Reuso:** docker-compose.yml + init-roles.sql (mismo entorno local y CI — cero drift) · scripts `pnpm test/test:db/test:all/test:e2e` · endpoint-registry (el "named offender" ya existe) · specs e2e como suite de headers anti-drift (WO-32).

**Nuevos:** `.github/workflows/ci.yml` · `e2e-validator/tests/ci/merge-gate.spec.ts`.

**Modificados:** fixtures `design-md.test.ts`/`tokens.test.ts` (tipos completos), `rls-policies.test.ts` + `tenant-isolation.spec.ts` (unused vars) · docs/BACKEND.md (sección CI).

## Components And Flow

Workflow único `verify` en ubuntu-latest: checkout → pnpm/action-setup (lee packageManager) → setup-node 22 con cache pnpm → install frozen → lint → tsc → `docker compose up -d --wait db-test` → `pnpm test:all` (aquí vive el gate de aislamiento) → `pnpm test:e2e` → teardown always. Triggers: pull_request + push a main/8080juniora.

@COV_CI_001.1 (merge-gate.spec.ts): simula el "PR que rompe aislamiento" localmente — crea `src/app/api/__ci-probe/route.ts` (endpoint sin clasificación de aislamiento), corre el endpoint-registry en subproceso y asserta que FALLA nombrando `api/__ci-probe`; cleanup en finally. Es la verificación ejecutable del contrato "named offender + merge bloqueado" sin necesitar un PR real.

Branch protection: `gh api PUT /repos/.../branches/main/protection` con required status check `verify`. Si el token no alcanza (admin), queda el comando exacto documentado para Junior.

## Steps

1. Workflow ci.yml + fixes de tsc/lint (hechos).
2. merge-gate.spec.ts (RED implícito: el registry ya falla con rutas sin clasificar — el spec lo demuestra end-to-end).
3. Verificación local del workflow paso a paso (mismos comandos que el YAML).
4. Branch protection (intento + doc) + docs/BACKEND.md.
5. Review → commit → in_review → issue #8.

## Testing

Cada paso del workflow ejecutado localmente en el mismo orden: `pnpm lint` · `pnpm tsc --noEmit` · `pnpm db:up && pnpm test:all` · `pnpm test:e2e` (17 specs con merge-gate). El YAML se valida con actionlint si está disponible (o revisión sintáctica).
