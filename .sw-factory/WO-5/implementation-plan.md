<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-5

**Work Order:** WO-5 — Build 1 — Firebase Auth Adapter + Account State Machine
**Created At (UTC):** 2026-07-09T15:31:39Z

## Summary

Añade el `AccountStateMachine` como único escritor de `consultants.account_state`
(`pending → active → subscribed → active_post_cancel`, enforcement por trigger a
nivel BD), la tabla `onboarding_sessions` con milestones write-once, el gating de
portal para cuentas `pending` (403 en `tenantRoute`), y consolida la frontera
única del SDK de Firebase Auth (ESLint). Desbloqueado hoy: el proyecto Firebase
real `brandme-5551f` existe en `.env.local` y el provider Email/Password está
habilitado (verificado en vivo) — los E2E usan tokens REALES.

## Code Reuse And Package Structure

**Reuso (no se reemplaza nada):**
- `src/lib/auth/verify-token.ts` — verificación JWKS existente (server half del adapter).
- `src/lib/firebase/client.ts` + `src/lib/auth/context.tsx` — client half del adapter.
- `src/lib/db/tenant-context.ts` (`db()`, `withSystemContext`) y patrón RLS de WO-3.
- `src/lib/webhooks/stripe-adapter.ts` (WO-6) — punto de señal de Stripe.
- `src/lib/observability/observability.ts` (`captureError`).
- Patrón E2E de firma HMAC local: `e2e-validator/tests/platform/webhook.spec.ts`.

**Nuevo / modificado:**
- `drizzle/0011_account_state.sql` — columna + CHECK + backfill subscribed + triggers
  (single-writer, milestones write-once) + `onboarding_sessions` con RLS + GRANTs.
- `src/lib/auth/account-state-machine.ts` — máquina (NUEVO).
- `src/lib/db/schema.ts` — columna y tabla en el schema drizzle (tipos).
- `src/lib/tenant.ts` — `resolveConsultant()` devuelve `{id, accountState}` sin
  queries extra; `resolveConsultantId`/`requireConsultantId` quedan como wrappers.
- `src/lib/api/tenant-route.ts` — 403 `ACCOUNT_PENDING` para estado `pending`.
- `src/lib/db/users.ts` — `upsertUserAndLinkSession` devuelve el consultant final.
- `src/app/api/auth/link/route.ts` — señal `password_set` si el consultant es pending.
- `src/lib/webhooks/stripe-adapter.ts` — señales checkout_completed/subscription_deleted.
- `eslint.config.mjs` — `firebase/auth` restringido fuera de `src/lib/{auth,firebase}/`.
- `tests/db/account-state.test.ts` (NUEVO) · `e2e-validator/tests/platform/auth-lifecycle.spec.ts` (NUEVO).

## Components And Flow

- **AccountStateMachine** (blueprint 1a85d215): `signalAccountState(consultantId,
  signal)` con `SELECT ... FOR UPDATE`; transiciones válidas: pending→active
  (password_set), active→subscribed (checkout_completed), subscribed→
  active_post_cancel (subscription_deleted), active_post_cancel→subscribed
  (re-suscripción — extensión documentada del path lineal). Señal repetida = no-op
  silencioso (webhooks reintentan); transición inválida = no-op + `captureError`
  (nunca 500 → evita tormenta de retries de Stripe). Escribe con
  `set_config('app.account_state_writer', ..., true)` en subquery FROM del mismo
  UPDATE (atómico, agnóstico pooled/direct). Milestones vía UPSERT COALESCE-once.
- **FirebaseAuthAdapter** (blueprint a3e6c964): frontera ya real (JWKS server +
  client SDK aislado); este WO la consolida con la regla ESLint y conecta la señal
  password_set. El routing por WebhookHandlerPrimitive del blueprint requiere un
  sender (GCIP blocking functions) que no existe — gap documentado, no simulado;
  la señal real de HOY es el link verificado sobre consultant `pending` (Stage 2
  de Build 2 golpea este mismo path).
- **Gating**: `tenantRoute` → `requireConsultant()` → `accountState === 'pending'`
  → 403 `{ code: "ACCOUNT_PENDING" }`. El redirect a la claim screen es del portal (Build 6).
- **Stripe**: `process()` tras `applySubscriptionEvent === "applied"` mapea status
  resultante → señal: active|trialing → checkout_completed; canceled|unpaid|
  incomplete_expired → subscription_deleted; past_due/incomplete → sin señal.

## Steps

1. **RED** — `tests/db/account-state.test.ts`: transiciones completas, no-op
   idempotente, inválida no escribe, UPDATE directo bloqueado por trigger,
   milestones write-once, default 'active', backfill subscribed.
2. **GREEN** — migración `0011_account_state.sql` + `account-state-machine.ts` + schema.
3. **Wiring** — tenant.ts/tenant-route.ts (gating), users.ts/auth-link (password_set),
   stripe-adapter (señales), eslint.config.mjs (frontera).
4. **E2E** — `auth-lifecycle.spec.ts` (COV_PF_AUTH_002.1/.2) con usuario Firebase
   REAL desechable (identitytoolkit REST + API key de .env.local) y webhook firmado.
5. Suite completa + lint + tsc → review delegada → commit + push + CI.

## Testing

- `pnpm test:db` — suite nueva `account-state.test.ts` + regresión completa db.
- `pnpm test` — unit intactos.
- `pnpm e2e` — `auth-lifecycle.spec.ts`: token manipulado → 401; pending denegado
  en API tenant (403 ACCOUNT_PENDING); pending→active con ID token REAL de
  Firebase; active→subscribed y subscribed→active_post_cancel vía webhook Stripe
  firmado (HMAC local); UPDATE directo → excepción del trigger. Cleanup del
  usuario desechable vía accounts:delete.
- Regresión E2E completa (21 specs previos) + lint + tsc.
