<!--lint disable no-undefined-references strong-marker-->

# Work Order Execution Checklist: WO-5

**Work Order Number:** WO-5
**Work Order Title:** Build 1 — Firebase Auth Adapter + Account State Machine
**Initialized At (UTC):** 2026-07-09T15:31:39Z

## Phase 1: Start / Context Gathering

### Required Steps

- [x] Review work order description provided by MCP tool output (read_work_order id=5)
- [x] Identify linked requirements and blueprints (Platform Foundation; AccountStateMachine + FirebaseAuthAdapter)
- [x] Review every connected requirements document (Platform Foundation — leído en sesión previa de la Fase 1 y re-consultado)
- [x] Review every connected blueprint document (ambos leídos vía MCP esta sesión)
- [x] Follow `@…` mentions **and links** to other blueprints in linked documents and read each referenced blueprint via MCP (TenantIsolationLayer, WebhookHandlerPrimitive — ya implementados en WO-3/WO-6)
- [x] Review every referenced blueprint discovered that way; add them to **Referenced Blueprints** in `context.md`
- [x] Extract acceptance criteria from requirements (COV_PF_AUTH_002.1/.2 + contratos del blueprint)
- [x] Identify architecture path from blueprints (components, contracts, composition) — ver implementation-plan.md
- [x] `context.md` is filled or updated with `execution/scripts/update-context-index.sh` for Work Order, connected requirements, connected blueprints, referenced blueprints, and known delivery links

- [x] **Certification: Phase 1 complete. Proceeding to Phase 2.**

## Phase 2: Planning And Implementation

### Implementation Plan

(see `execution/writing-implementation-plans.md`)

- [x] Implementation plan documented in `implementation-plan.md` (antes de tocar código)
- [x] Testing section documented in `implementation-plan.md`

### Implementation

- [x] Implemented changes are scoped to the Work Order (12 archivos, stage quirúrgico)
- [x] Tests added or updated for changed behavior (tests/db/account-state.test.ts ×12 TDD-first; auth-lifecycle.spec.ts ×2)
- [x] Documentation, generated files, fixtures, migrations, or config updated where relevant (drizzle/0011, schema.ts, eslint.config.mjs)

- [x] **Certification: Phase 2 complete. Proceeding to Phase 3.**

## Phase 3: Review And Verification

### Review

- [x] Review subagent spawned per `execution/review-phase.md` and returned a verdict (2 rondas, ver review-log.md)
- [x] All acceptance criteria from the Work Order and linked requirements are satisfied (COV_PF_AUTH_002.1/.2 verdes contra Firebase real)
- [x] Architecture is aligned with linked blueprints, or documented drift is accepted (drift documentado: re-entrada re-suscripción; routing password-set por webhook primitive pendiente de sender GCIP — implementation-plan.md)
- [x] Exploratory pass on user-visible or external behavior (E2E contra server real: página /c gating + APIs + webhooks; usuario Firebase real creado/borrado) — not only automated tests; for browser apps, use browser-based testing if available. Brief notes in `review-log.md` or evidence.
- [x] Latest `review-log.md` verdict is `APPROVED` (Round 2)

- [x] **Certification: Phase 3 complete. Proceeding to Final Completion.**

## Final Completion Check

- [x] All phase certifications above are complete
- [x] Checklist is fully filled out with evidence
- [x] Review log is complete (`review-log.md`)
- [x] Implementation plan was followed (`implementation-plan.md`)
- [x] All intended files are present in the working tree (13 archivos)
- [x] Work order status updated — `completed` directo con autorización vigente del usuario ("sí hazlo"/"termines todo", 2026-07-09) tras review APPROVED
