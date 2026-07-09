<!--lint disable strong-marker-->

# Review Log: WO-13

**Work Order:** WO-13 — Build 3 — Brand Extraction (Agent 02)
**Initialized At (UTC):** 2026-07-09T17:27:08Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Reviewer: subagente `feature-dev:code-reviewer` sobre el diff staged completo (2026-07-09).

### Requirements Alignment

**Blocking:** ninguno. Fidelidad AC-por-AC verificada por el reviewer contra los tests
(AC-BEX-001.6/.7, 002.5, 004.2, 005.1/.8, 007.3, 013.2b/.3).

**Advisory:** ninguno.

### Blueprint Alignment

**Blocking:** ninguno (drift Firecrawl/Storage/PostHog pre-documentado y excluido del scope de review).

**Advisory:** ninguno.

### Architecture And Conventions

**Blocking:**

- (BLOCKING) **SSRF en checkRobots** (`scraper.ts`): el fetch de robots.txt corría en el
  orquestador SIN assertSafeUrl — una URL de tenant resolviendo a red interna/metadata
  (169.254.169.254) habría disparado la petición server-side.

**Advisory:**

- (IMPORTANT) **Promise huérfana en timeout del pass LLM**: Promise.race no cancela
  invokeLLM (EP-05 sin AbortSignal); reintentar tras timeout duplicaba la invocación real
  y la telemetría con dos llamadas concurrentes.

Confirmado correcto explícitamente: transferencia de slot del limiter (sin ventana de robo),
truncateToBudget (rank y corte), ON CONFLICT sobre índice parcial de health records, upsert
concurrente de brands, RLS (tenant solo lee lo suyo; health 100% system), contratos WO-3
(ningún contexto DB abarca awaits de scrape/LLM), SYSTEM_PROMPT estático, SSRF del provider
y del logo, cero interpolación SQL, exports aditivos.

### Tests And Build

**Commands run:** `git diff --cached` + lectura de módulos y suites. Estado del ejecutor:
219/219 Vitest, 25/25 E2E, lint/tsc cero.

**Blocking:** ninguno adicional.

### User-Facing Verification

**Skipped:** sí — el WO no tiene superficie de usuario (librería de pipeline; triggers
llegan con WO-12/Build 6). Evidencia de conducta: E2E COV_BEX_001.1/.2 in-process contra
la DB real (patrón llm-wrapper.spec.ts).

### Security, Privacy, And Data Safety

**Skipped:** no.

**Blocking:** el hallazgo SSRF de arriba.

### Round 1 Verdict

- Total blocking: 1 · Total advisory: 1 (IMPORTANT)
- Files reviewed: 21 staged + contexto (llm-wrapper, tenant-context, ssrf-guard)
- **Verdict:** CHANGES_REQUESTED

---

## Round 2

### Fixes aplicados

1. `scraper.ts`: `assertSafeUrl(robotsUrl)` ANTES del fetch de robots (el catch fail-open
   traga el rechazo SIN fetchear; el provider re-asserta y clasifica la corrida). Test de
   regresión: stub de fetch + 169.254.169.254 → cero peticiones al host interno.
2. `agent02-extractor.ts`: `llm_timeout` es TERMINAL (break del retry loop) — jamás una
   segunda invocación concurrente mientras la no-cancelable sigue en vuelo; trade-off
   documentado (la huérfana escribe su telemetría una vez; recuperación vía
   reextractFromStored).

### Tests And Build

**Commands run:** unit 23/23 (incl. regresión SSRF), db 12/12, tsc limpio.

### Round 2 Verdict

- Total blocking: 0 · Total advisory: 0
- Files reviewed: fixes + test de regresión (verificación dirigida R1)
- **Verdict:** APPROVED
