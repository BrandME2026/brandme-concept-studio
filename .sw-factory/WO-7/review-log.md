<!--lint disable strong-marker-->

# Review Log: WO-7

**Work Order:** WO-7 — Build 1 — ConfigStore + PlatformConfig (runtime configuration)
**Initialized At (UTC):** 2026-07-09T12:20:09Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Un delegado de review sobre el change set completo (14 archivos). Verificación previa: tsc limpio, 125/125 Vitest, 4/4 e2e, build verde.

### Requirements Alignment

**Blocking:** ninguno. REQ-PF-020.1 (sin hardcode/env para EP-07) y .3 (aplica <60s sin restart — demostrado en vivo por el e2e: cambio de cap aplicó en ~4s con TTL de test) satisfechos. REQ-PF-020.2 (superficie admin) = Build 6, out of scope declarado.

**Advisory:** ninguno.

### Blueprint Alignment

**Blocking:** ninguno. Modelo PlatformConfig fiel (drift documentado: last_modified_by sin FK hasta Build 6). Boundaries respetadas: sin secrets, sin pricing.

**Advisory:** ninguno.

### Architecture And Conventions

**Blocking:** ninguno.

**Advisory (confianza 55, solo nota):** sin deduplicación de promesas in-flight en el cold start de la cache (mini-stampede teórico). No requiere acción.

### Tests And Build

**Commands run:** pnpm tsc --noEmit (limpio) · pnpm test:all (125/125) · pnpm test:e2e (4/4) · pnpm build (verde).

**Blocking:** ninguno.

**Advisory:** ninguno. Verificado por el delegado: miss de fila se cachea, ERROR no se cachea (reintenta); call-sites de rate limit semánticamente idénticos (auth/link mantiene cap "chat" como antes); getDesignModel async se resuelve antes de streamText.

### User-Facing Verification

**Skipped:** no.

**Evidence:** e2e COV_PF_CONFIG_001.1 contra la app real: con el cap sembrado (5/min) el 6º POST a /api/leads da 429; tras UPDATE del admin (cap 2) la conducta cambia en vivo sin redeploy dentro de la ventana del contrato.

**Blocking:** ninguno.

### Security, Privacy, And Data Safety

**Skipped:** no.

**Blocking:** ninguno. GRANT solo SELECT al rol de app; sin secrets en seeds; platform_config sin RLS es coherente (tabla de plataforma sin dimensión tenant).

**Advisory (confianza 85) — RESUELTO en esta ronda:** `.env.example` seguía documentando LLM_DAILY_CAP/EXTRACT_CONCURRENCY/RL_*_PER_MIN como si tuvieran efecto (documentación que miente; viola la regla de honestidad del proyecto). Fix aplicado: bloque reemplazado por la nota de deprecación EP-07 + documentadas DATABASE_URL/DATABASE_URL_MIGRATIONS. Pendiente operacional anotado en EXECUTION-LOG: limpiar esas vars en Railway si existen.

### Round 1 Verdict

- Total blocking: 0
- Total advisory: 1 formal (resuelto) + 1 nota de diseño
- Files reviewed: 14 (change set completo del WO)
- **Verdict:** APPROVED
