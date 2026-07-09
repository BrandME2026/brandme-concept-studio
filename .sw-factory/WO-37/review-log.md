<!--lint disable strong-marker-->

# Review Log: WO-37

**Work Order:** WO-37 — Multi-Brand Comparison Card

Nota: WO-37 y WO-38 comparten superficie (bloques de la BrandMePage) y se
revisaron JUNTOS en un solo diff staged por el mismo reviewer.

---

## Round 1

Reviewer: subagente feature-dev:code-reviewer sobre el diff staged conjunto (22 archivos).

### Hallazgos

- (BLOCKING, WO-38) RLS tenant_all en testimonials permitía al tenant
  auto-aprobar su propio pending_review (UPDATE status) saltándose el quality
  filter — violaba el patrón hermano de brandme_pages (WO-15).
- (MAJOR, WO-38) URL_RE no detectaba URLs sin prefijo (bit.ly/x, wa.me/…) —
  falso negativo del AC "sin URLs en ningún campo".
- (MAJOR, WO-37) display:none en tarjetas no adyacentes del modo móvil rompía
  el swipe directo a la tarjeta lejana (AC-MBC-005: swipe Y botones).

Verificado sin hallazgos: isValidDisplayName fiel al AC, XSS (solo JSX),
LATERAL join correcto, preview sin comparison, contratos WO-3, límite de 3.

### Round 1 Verdict: CHANGES_REQUESTED (1 BLOCKING + 2 MAJOR)

---

## Round 2

### Fixes

1. 0015: tenant_select/insert/delete SIN UPDATE tenant; visibility/reorder a
   system scope con filtro por consultant_id; test de regresión (UPDATE bajo
   asTenant → 0 filas).
2. URL_RE ampliada a dominios sin prefijo (TLDs comunes) + tests bit.ly/wa.me
   y anti-falso-positivo ("Austin TX.").
3. comparison-card: las 3 tarjetas se renderizan siempre (sin display:none).

### Tests: 294/294 Vitest, tsc/lint cero.

### Round 2 Verdict

- Total blocking: 0 · Total advisory: 0
- **Verdict:** APPROVED (los 3 fixes verificados con evidencia; tests de regresión ejercitan el escenario exacto)
