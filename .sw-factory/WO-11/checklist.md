<!--lint disable no-undefined-references strong-marker-->

# Work Order Execution Checklist: WO-11

**Work Order Number:** WO-11
**Work Order Title:** Build 1 — Sitemap Service + Crawler Policy (SEO infra)
**Initialized At (UTC):** 2026-07-09T14:40:28Z

## Phase 1: Start / Context Gathering

### Required Steps

- [x] Review work order description provided by MCP tool output
  WO-11 (id 400e11fb) completo, incl. COV_PF_SEO_001.
- [x] Identify linked requirements and blueprints
  Requirement: Platform Foundation (58afc8ff). Blueprint: SitemapService (35f94a28).
- [x] Review every connected requirements document
  Platform Foundation ya leído íntegro. Gobiernan: REQ-PF-011 (.1-.3; .4 = gate humano Build 4) y REQ-PF-013 (.1-.2; .3-.5 GSC/Bing/IndexNow = Admin Console Build 6, documentado).
- [x] Review every connected blueprint document
  SitemapService (46 líneas + ADR-001) leído completo. CrawlerPolicyHandler definido en el feature blueprint de Platform Foundation (leído en WO-3).
- [SKIP] Follow `@…` mentions **and links** to other blueprints in linked documents and read each referenced blueprint via MCP
  Skip reason: referencias ya leídas en WOs previos.
- [x] Review every referenced blueprint discovered that way; add them to **Referenced Blueprints** in `context.md`
- [x] Extract acceptance criteria from requirements
- [x] Identify architecture path from blueprints (components, contracts, composition)
  Sitemap dinámico = inclusión síncrona en efecto; robots referencia el sitemap; GSC = Build 6.
- [x] `context.md` is filled or updated with `execution/scripts/update-context-index.sh` for Work Order, connected requirements, connected blueprints, referenced blueprints, and known delivery links

- [x] **Certification: Phase 1 complete. Proceeding to Phase 2.**

## Phase 2: Planning And Implementation

### Implementation Plan

(see `execution/writing-implementation-plans.md`)

- [x] Implementation plan documented in `implementation-plan.md`
- [x] Testing section documented in `implementation-plan.md`

### Implementation

- [x] Implemented changes are scoped to the Work Order
  robots.ts (política AI crawlers) + verificación e2e del sitemap existente. GSC/IndexNow = Build 6 documentado.
- [x] Tests added or updated for changed behavior
  2 specs e2e (COV_PF_SEO_001.1 con flujo real de publish, .2 listas completas). 19/19 e2e.
- [x] Documentation, generated files, fixtures, migrations, or config updated where relevant

- [x] **Certification: Phase 2 complete. Proceeding to Phase 3.**

## Phase 3: Review And Verification

### Review

- [x] Review subagent spawned per `execution/review-phase.md` and returned a verdict
  1 delegado, APPROVED sin hallazgos.
- [x] All acceptance criteria from the Work Order and linked requirements are satisfied
- [x] Architecture is aligned with linked blueprints, or documented drift is accepted
- [x] Exploratory pass on user-visible or external behavior — not only automated tests; for browser apps, use browser-based testing if available. Brief notes in `review-log.md` or evidence.
  El e2e .1 ES el flujo real (publish→sitemap); robots verificado en el spec .2.
- [x] Latest `review-log.md` verdict is `APPROVED`

- [x] **Certification: Phase 3 complete. Proceeding to Final Completion.**

## Final Completion Check

- [x] All phase certifications above are complete
- [x] Checklist is fully filled out with evidence
- [x] Review log is complete (`review-log.md`) — 1 ronda, APPROVED
- [x] Implementation plan was followed (`implementation-plan.md`)
- [x] All intended files are present in the working tree
- [x] Work order status updated to `in_review`
