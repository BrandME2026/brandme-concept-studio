<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-9

**Work Order:** WO-9 — Build 1 — Rate Limit Middleware (IP + consultant_id)
**Created At (UTC):** 2026-07-09T13:10:00Z

## Summary

Completa el RateLimitMiddleware (REQ-PF-019): al limiter IP-only existente se añaden (a) límites por `consultant_id` que aplican SIMULTÁNEAMENTE con los de IP — el primero alcanzado dispara el 429 con `Retry-After` antes de cualquier handler (AC-PF-019.5) — y (b) alerta vía ObservabilityWrapper en CADA breach, con surface, requester (IP o consultant) y count de la ventana (AC-PF-019.4). Los caps por surface YA vienen de ConfigStore (WO-7). El store en memoria se mantiene (single-instance; Redis = target multi-réplica documentado — stack note del blueprint).

## Code Reuse And Package Structure

**Reuso:** motor `rateLimit()` + `checkRateLimit` + `tooMany` (WO-7) · `emitOpsAlert` nuevo sobre el sink de WO-8 · caps EP-07 existentes (`rate_limiting.<name>_per_min`).

**Modificados:** `src/lib/observability/observability.ts` (export `emitOpsAlert`) · `src/lib/security/rate-limit.ts` (RateResult gana `count`; alertas de breach; `checkConsultantRateLimit`) · `src/lib/api/tenant-route.ts` (opts `{ limit?: LimitName }`: aplica el límite por consultant POST-resolución — el de IP ya corre en la entrada de la ruta, así no se double-cuenta) · rutas generate y checkout (pasan su limit a tenantRoute).

**Nuevos:** `tests/db/rate-limit.test.ts` · `e2e-validator/tests/platform/rate-limit.spec.ts`.

## Components And Flow

Dual-key sin doble conteo: la dimensión IP se evalúa en la entrada de la ruta (pre-auth, protege la resolución de tenant); la dimensión consultant se evalúa en tenantRoute tras resolver la identidad. Ambas aplican al mismo request; la primera alcanzada corta con 429 (AC-PF-019.5 literal). Claves: `<name>:ip:<ip>` (formato actual `<name>:<ip>` se conserva) y `<name>:consultant:<id>`; mismo cap EP-07 por surface en ambas dimensiones.

Breach alert: `emitOpsAlert({surface, count, windowMs, message})` en CADA breach (contrato literal del blueprint; el riesgo de ruido bajo ataque se acepta y se anota — el sink/backend dedupea).

## Steps

1. RED: tests/db/rate-limit.test.ts (429+Retry-After; consultant cap independiente del IP y viceversa; primera dimensión alcanzada corta; alerta por CADA breach con surface/requester/count; cap de config aplica tras invalidate).
2. GREEN: emitOpsAlert + rate-limit.ts + tenant-route opts + generate/checkout.
3. E2E rate-limit.spec.ts (@COV_PF_RATE_001.1: exceder cap de leads → 429 + header Retry-After + cero filas nuevas).
4. Suites completas + review → commit → in_review.

## Testing

`pnpm test:db` · `pnpm test` · `pnpm test:e2e` (11 specs) · `pnpm tsc --noEmit` · `pnpm build`.
