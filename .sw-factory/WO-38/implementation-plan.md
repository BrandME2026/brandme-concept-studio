<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-38

**Work Order:** WO-38 — Build 4 — Testimonials Block (BrandMePage)
**Created At (UTC):** 2026-07-09T20:30:00Z

## Summary

Testimonials como datos de PERFIL del consultant (una lista para todas sus
páginas, máx 5): modelo con RLS (0015), validación estricta pura
(AC-TES-003.1: 30-250 chars, first-name+inicial, sin PII/URLs), quality filter
compartido (vetado → pending_review sin tocar la página viva), sugerencias
brand-sourced desde el payload del Agente 02 con descartes persistentes y
label "via [Brand] website", oversight admin (approve/reject/remove), re-render
de todas las páginas al cambiar, y el bloque en la sección 9 del render con
threshold de colapso de ConfigStore vía <details> sin JS.

## Drift documentado

1. Panel del portal (alta/edición/drag-drop/estados "Publishing...") = Build 6;
   estas funciones son la librería que ese panel invoca.
2. Notificaciones in-portal/ops-channel y Testimonial Activity feed del Admin
   Console (AC-TES-004.1c/d) = Build 6; los ESTADOS quedan persistidos.
3. Audit log del admin remove (AC-TES-004.5) = Admin Console Build 6.
4. Retry affordance ante fallo de re-render (AC-TES-002.4) = superficie portal.

## Testing

6 unit (validación + first-name-initial) · 10 db (filtro, máx 5, gestión,
admin, RLS, sugerencias con descartes) · 1 E2E (COV_TST_001.1 contra la página
pública real). Regresión: 292 Vitest + 31 E2E.
