<!--lint disable strong-marker-->

# Review Log: WO-32

**Work Order:** WO-32 — Build 1 — Product Security (CORS, file validation, injection baseline)
**Initialized At (UTC):** 2026-07-09T13:22:57Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Un delegado (escrutinio de bypasses). Verificación previa: 168/168 Vitest, 16/16 e2e, tsc, build, exploratorio en vivo.

### Requirements / Blueprint Alignment

**Blocking:** ninguno. AC-SEC-002 (headers+CSP con gate anti-drift e2e; HSTS preload), 003 (CORS allowlist EP-07 sin wildcard, 403 ANTES de resolver identidad), 004.2 (scrub de credenciales en el wrapper), 006.1-.3 (magic bytes como único gate; SVG correctamente fuera de la allowlist; wiring completo screenshot+images+logo), 010.3 (append-only por GRANT sin UPDATE/DELETE/TRUNCATE + trigger), 011 (baseline 4 categorías inestrechable; fallback sin leak; evento con longitud, jamás texto).

### Security, Privacy, And Data Safety (escrutinio de bypasses — todos fail-closed)

- CORS: `evil-getbrandme.ai` NO matchea (endsWith con punto literal); `Origin: null` → fail-closed 403.
- Base64 truncado a 64 chars (múltiplo de 4) → 48 bytes reales, suficiente para todos los magic checks; payload indecodificable → rechazo.
- Polyglot PNG+HTML pasa como PNG (inherente a magic bytes) pero sin vector de ejecución: HTML/SVG fuera de allowlist.
- /embed conserva frame-ancestors 'self'; /p/[slug] mantiene su CSP sandbox (matcher); CSP de la app = endurecimiento neto sobre "sin CSP".
- Homoglyph/evasión sofisticada del baseline: fuera de la promesa (piso mínimo editable EP-07, extensible por admin) — documentado.

### Tests And Build

**Commands run:** pnpm test:db (106/106) · pnpm test (62/62) · pnpm test:e2e (16/16) · tsc · build.

### User-Facing Verification

**Skipped:** no. Exploratorio en vivo: POST /api/agent con inyección → fallback UIMessage stream sin invocar el modelo; CSP + HSTS preload servidos en /. Specs e2e de headers = gate anti-drift permanente (ADR-001).

### Round 1 Verdict

- Total blocking: 0 · Total advisory: 0
- **Verdict:** APPROVED
