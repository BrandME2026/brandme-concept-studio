<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-37

**Work Order:** WO-37 — Build 4 — Multi-Brand Comparison Card
**Created At (UTC):** 2026-07-09T20:30:00Z

## Summary

Comparison Card read-only sin recomendación: datos 100% de lo ya extraído
(getComparisonBrands: páginas PUBLICADAS del consultant + FDD 'explicit' de la
última extracción completed; cero llamadas en render-time), dimensión ausente =
"Información no disponible aún" (jamás celdas vacías ni estimados,
AC-MBC-003.2), selección hasta 3 marcas (client component; entry point SSR),
móvil <768px apilado con swipe (scroll-snap) + botones con dimensiones
idénticas (AC-MBC-005). Tenant-scoped por construcción.

## Drift documentado

1. "Knowledge Vault ready" ≈ "extracción completed" hasta WO-14 (blocked).
2. franchise fee: el Agente 02 no lo extrae como campo separado → siempre
   "no disponible" (honesto); añadirlo al schema del Agente 02 es decisión
   de backlog (flag en 8090).
3. territory status: llega con REQ-TI-006 (fuera del scope de WO-18 actual).
4. PostHog (comparison_card_opened/clickthrough) + panel de analytics del
   portal (REQ-MBC-004) = sin PostHog/portal; flaggeado.

## Testing

4 unit (dimensionsFromFdd) · 3 db (multi-marca, tenant-scoped, mono-marca) ·
2 E2E (COV_MBC_001.1/.2 contra la página pública real).
