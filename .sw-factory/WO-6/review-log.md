<!--lint disable strong-marker-->

# Review Log: WO-6

**Work Order:** WO-6 — Build 1 — Webhook Handler Primitive (HMAC + idempotency)
**Initialized At (UTC):** 2026-07-09T12:48:37Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Un delegado sobre el change set completo (8 archivos + soporte). Verificación previa: 143/143 Vitest, 9/9 e2e, tsc limpio, build verde.

### Requirements / Blueprint Alignment

**Blocking (confianza 85) — RESUELTO en esta ronda:** `applySubscriptionEvent` era un UPDATE que con 0 filas afectadas completaba en silencio: el dedup se consumía como "processed" y el evento se perdía — la misma pérdida silenciosa que el WO dice resolver con el cambio 200→500. Fix: la función ahora devuelve `applied | customer_not_found | stale_event`; el adapter lanza SOLO en customer_not_found (rollback del dedup → 500 → retry de Stripe, cubre la carrera checkout→webhook) y trata stale_event como descarte idempotente por diseño (warn, sin retry — lanzar ahí habría convertido cada descarte legítimo de eventos out-of-order en una tormenta de reintentos de 3 días). Test nuevo cubre ambos resultados.

**Verificado sin hallazgos:** insert-before-process correcto; sin deadlock en entregas concurrentes (lock del unique; ROLLBACK de la 1ª → la 2ª inserta y procesa — testeado); prepare() antes del dedup es trade-off intencional (mover el check fuera de la tx introduce TOCTOU); purga TTL solo borra vencidos, fail-soft, transacción separada; rawBody leído UNA vez; verifyAndParse tolera secret ausente (null→400) sin tocar getStripe(); firma e2e replica exactamente el esquema de constructEvent; GRANT sin UPDATE coherente.

### Architecture And Conventions

**Advisory (confianza 80, deuda conocida):** (a) sin dead-letter/alerta diferenciada para fallos PERMANENTES de negocio — Stripe reintentará ~3 días con 500s; trade-off correcto vs pérdida silenciosa, registrado en EXECUTION-LOG. (b) una entrega duplicada concurrente retiene una conexión del pool (max 5) mientras la primera procesa — riesgo de capacidad bajo ráfagas, no de correctitud; aceptado para el alcance del WO.

### Tests And Build

**Commands run:** pnpm test:db (82/82 post-fix) · pnpm test (62/62) · pnpm test:e2e (9/9) · pnpm tsc --noEmit · pnpm build.

### User-Facing Verification

**Skipped:** no. COV_PF_WEBHOOK_001.1/.2 contra la ruta REAL /api/stripe/webhook con firmas HMAC artesanales (secret dummy, crypto local): firma mala → 400 y cero efectos; replay del mismo event id con contenido distinto → 200 reconocido sin re-ejecución.

### Security, Privacy, And Data Safety

**Blocking:** ninguno (el de arriba era de correctitud). Firma verificada con body crudo; sin secrets fuera de env.

### Round 1 Verdict

- Total blocking: 1 (resuelto)
- Total advisory: 2 (deuda documentada)
- **Verdict:** CHANGES_REQUESTED → fix aplicado; pasa a Round 2

---

## Round 2

Re-review delegada (mismo delegado) SOLO sobre el fix de applySubscriptionEvent/adapter.

Delegado confirmó: el fix resuelve el blocking (discriminante applied/customer_not_found/stale_event correcto; adapter lanza solo en not_found; test cubre ambas ramas con estado final). Nota menor sin acción: check-then-act SELECT→UPDATE dentro de la misma transacción es aceptable (READ COMMITTED; nada borra subscriptions concurrentemente en este dominio).

- Total blocking: 0
- **Verdict:** APPROVED
