<!--lint disable strong-marker-->

# Review Log: WO-5

**Work Order:** WO-5 — Build 1 — Firebase Auth Adapter + Account State Machine
**Initialized At (UTC):** 2026-07-09T15:31:39Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Reviewer: subagente `feature-dev:code-reviewer` sobre el diff staged completo (2026-07-09).

### Requirements Alignment

**Blocking:** ninguno.

**Advisory:** ninguno.

### Blueprint Alignment

**Blocking:**

- (MAJOR) Gating `ACCOUNT_PENDING` bypasseable en `src/app/c/[conversationId]/page.tsx` —
  única ruta clasificada `tenant` en route-manifest que NO pasa por `tenantRoute`;
  resolvía con `resolveConsultantId()` (sin accountState). RLS impide fuga cross-tenant,
  pero el contrato "pending sin acceso a portal" del blueprint no se aplicaba ahí.

**Advisory:** re-entrada active_post_cancel→subscribed aceptada como extensión documentada.

### Architecture And Conventions

**Blocking:** ninguno.

**Advisory:** evaluados y descartados con announce explícito: CAS + set_config-en-FROM
(correcto en pooled y direct; el planner no puede omitir la subquery cuando hay filas),
interpolación de `column` en recordMilestone (mapa interno cerrado, sin input externo),
ESLint de dos bloques (override deliberado y correcto), hueco teórico de upsert
ON CONFLICT sobre consultants (no existe ningún caller), RLS de onboarding_sessions
(simétrica al patrón WO-3, FORCE presente).

### Tests And Build

**Commands run:** `git diff --cached`, lectura de callers (route-manifest, middleware,
tenant-context, subscriptions). Estado reportado por el ejecutor: 185/185 Vitest,
23/23 E2E, lint/tsc a cero.

**Blocking:** ninguno.

### User-Facing Verification

**Skipped:** no.

**Evidence:** E2E COV_PF_AUTH_002.1/.2 contra el server real con usuario Firebase REAL
(identitytoolkit REST) y webhooks Stripe firmados; regresión Stripe `customer_not_found`
(500 → retry) verificada intacta.

**Blocking:** ninguno.

### Security, Privacy, And Data Safety

**Skipped:** no.

**Blocking:** ninguno (el MAJOR de blueprint arriba es de gating de negocio; RLS contiene
el impacto cross-tenant).

### Round 1 Verdict

- Total blocking: 1 (MAJOR)
- Total advisory: 0
- Files reviewed: 12 staged + 4 de contexto
- **Verdict:** CHANGES_REQUESTED

---

## Round 2

### Fix aplicado

- `src/app/c/[conversationId]/page.tsx`: `resolveConsultant()` + redirect("/") si
  `accountState === "pending"`, ANTES de abrir `withTenant()`.
- Cobertura E2E del hallazgo: conversación propia sembrada para el pending; GET
  /c/<id> pending → expulsado a "/"; tras activación real → permanece en /c/<id>.

### Tests And Build

**Commands run:** `pnpm lint` (cero), `npx tsc --noEmit` (cero),
`npx playwright test tests/platform/auth-lifecycle.spec.ts` → 2/2 verde.

### Round 2 Verdict

- Total blocking: 0
- Total advisory: 0
- Files reviewed: fix + spec (verificación dirigida del hallazgo R1)
- **Verdict:** APPROVED
