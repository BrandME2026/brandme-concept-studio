<!--lint disable no-undefined-references strong-marker-->

# Work Order Execution Checklist: WO-6

**Work Order Number:** WO-6
**Work Order Title:** Build 1 — Webhook Handler Primitive (HMAC + idempotency)
**Initialized At (UTC):** 2026-07-09T12:48:37Z

## Phase 1: Start / Context Gathering

### Required Steps

- [x] Review work order description provided by MCP tool output
  WO-6 (id 5aa8b92a) completo, incl. COV_PF_WEBHOOK_001.
- [x] Identify linked requirements and blueprints
  Requirement: Platform Foundation (58afc8ff). Blueprint: WebhookHandlerPrimitive (0028b99f).
- [x] Review every connected requirements document
  Platform Foundation ya leído íntegro esta sesión. Gobierna: REQ-PF-009 (.1-.4, EP-02).
- [x] Review every connected blueprint document
  WebhookHandlerPrimitive (62 líneas, modelo WebhookEvent + ADR-001 insert-before-process) leído completo.
- [x] Follow `@…` mentions **and links** to other blueprints in linked documents and read each referenced blueprint via MCP
  Referencias: #AccountStateMachine (transiciones = WO-5, out of scope declarado del WO) — frontera definida en el propio blueprint.
- [x] Review every referenced blueprint discovered that way; add them to **Referenced Blueprints** in `context.md`
- [x] Extract acceptance criteria from requirements
  AC-PF-009.1-.4 mapeados en implementation-plan.md.
- [x] Identify architecture path from blueprints (components, contracts, composition)
  Primitivo dueño de firma+dedup+transacción; vendors aportan adapter (firma+handler); Stripe migra ya.
- [x] `context.md` is filled or updated with `execution/scripts/update-context-index.sh` for Work Order, connected requirements, connected blueprints, referenced blueprints, and known delivery links

- [x] **Certification: Phase 1 complete. Proceeding to Phase 2.**

## Phase 2: Planning And Implementation

### Implementation Plan

(see `execution/writing-implementation-plans.md`)

- [x] Implementation plan documented in `implementation-plan.md`
- [x] Testing section documented in `implementation-plan.md`

### Implementation

- [x] Implemented changes are scoped to the Work Order
  Primitivo + adapter Stripe + migración de la ruta. Firebase/Cal.com y AccountStateMachine out of scope declarado.
- [x] Tests added or updated for changed behavior
  6 tests db (webhooks) + 2 e2e (COV_PF_WEBHOOK_001 contra la ruta real con firma HMAC artesanal). 143 Vitest + 9 e2e verdes.
- [x] Documentation, generated files, fixtures, migrations, or config updated where relevant
  drizzle/0006 + seed retención EP-07; schema.ts; env STRIPE_* dummy en playwright config (documentado).

- [x] **Certification: Phase 2 complete. Proceeding to Phase 3.**

## Phase 3: Review And Verification

### Review

- [x] Review subagent spawned per `execution/review-phase.md` and returned a verdict
  Round 1 CHANGES_REQUESTED (1 blocking: UPDATE 0-filas silencioso) → fix aplicado → Round 2 APPROVED.
- [x] All acceptance criteria from the Work Order and linked requirements are satisfied
- [x] Architecture is aligned with linked blueprints, or documented drift is accepted
- [x] Exploratory pass on user-visible or external behavior — not only automated tests; for browser apps, use browser-based testing if available. Brief notes in `review-log.md` or evidence.
  COV_PF_WEBHOOK_001 contra la ruta real con firmas HMAC artesanales ES la verificación externa; evidencia en review-log.
- [x] Latest `review-log.md` verdict is `APPROVED`

- [x] **Certification: Phase 3 complete. Proceeding to Final Completion.**

## Final Completion Check

- [x] All phase certifications above are complete
- [x] Checklist is fully filled out with evidence
- [x] Review log is complete (`review-log.md`) — 2 rondas, APPROVED
- [x] Implementation plan was followed (`implementation-plan.md`)
- [x] All intended files are present in the working tree
- [x] Work order status updated to `in_review`
