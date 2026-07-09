<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-15

**Work Order:** WO-15 — Build 4 — BrandMePage Generation (Agent 04)
**Created At (UTC):** 2026-07-09T18:40:00Z

## Summary

Agente 04 como pipeline estructurado NUEVO (`src/lib/brandmepage/`): compone la
página desde 3 capas (brand layer del Agente 02 o BrandTemplate; copy LLM; overlay
del consultant), con lifecycle de 8 estados (single-writer por trigger, patrón
WO-5), ApprovalGateway configurable, ReRenderScheduler con cola de 3 prioridades,
ContentQualityFilter, SlugService con lista reservada, PreviewLinks, y render SSR
REAL en `/[consultantSlug]/[brandSlug]` con JSON-LD server-side + llms.txt por
página. A diferencia del Concept Studio (HTML emitido por el LLM), aquí el LLM
genera SOLO COPY (JSON) y la página es composición React determinista — el diseño
viene de los identity tokens del Agente 02.

## Drift documentado (flaggear en 8090 al cerrar)

1. Emails/notificaciones in-portal (fallos, aprobaciones): sin proveedor de email
   ni portal (Build 6) — los ESTADOS y datos que esas superficies leen sí quedan.
2. AMA widget (sección 7): se monta el agent chat EXISTENTE (/embed/agent, no
   grounded); el AMA real con RAG es WO-16 (blocked por WO-14/embeddings).
3. ROI Calculator/Territory/booking: condicionales por datos que no existen
   (KV/territory/Build 10) → omitidos per AC-BPG-008.2 (ROI) / pending state
   (Territory, AC-BPG-008.4) / Build 10 (booking).
4. Zone-slugs (AC-BPG-012.4): scope de Agent 05/WO-17.
5. PostHog (portfolio_nav_clickthrough) y CWV RUM (Vercel Analytics — la app
   corre en Railway): sin instrumentar; flaggear.
6. Batch re-render por activación de template: transiciones + jobs sí; emails no.
7. AC-BPG-002.2 (placeholder de headshot visible SOLO para el dueño autenticado):
   requiere sesión de dueño en la superficie pública — llega con el portal/editor
   (Build 6). Hoy: sin headshot NADIE ve placeholder (espacio omitido) — el AC
   queda parcial y flaggeado (hallazgo MINOR de review R1).

## Decisiones clave

- `consultants.slug` (ALTER en 0013): el consultant-slug es identidad estable del
  consultant, no de la página.
- Trigger single-writer `enforce_bmp_state_writer` (GUC `app.bmp_state_writer`,
  set_config atómico en FROM — patrón WO-5) para el contrato "state transitions
  written only by ApprovalGateway and ReRenderScheduler".
- Compliance (AC-BEX-004.3): el copy generado pasa por `findVerbatimViolations`
  (WO-13) contra el raw_content de la extracción; violación → retry del copy;
  limpio → `compliance_verified_at` en el config.
- Leads en BrandMePages: `leads.slug = "<consultantSlug>/<brandSlug>"`;
  `slugExists` acepta generations O brandme_pages publicadas (AC-BPG-001.4).
- Evento `brand_extraction.completed` → bus in-process mínimo
  (`src/lib/events/domain-events.ts`); el pipeline del Agente 02 emite y el
  Agente 04 se suscribe vía módulo de wiring — el Task Server real (Trigger.dev)
  reemplaza el bus cuando exista.
- Sitemap: `src/app/sitemap.ts` incluye brandme_pages published.

## Steps

1. 0013: ALTER consultants ADD slug + modelos + seeds reserved/disallowed.
2. Unit RED→GREEN por módulo: slug-service, quality-filter (whole-word+wildcard),
   copy schema, seo builders (JSON-LD/llms.txt/meta), render-data (composición de
   secciones/condicionales), scheduler (prioridad 3-tier).
3. db RED→GREEN: generación completa (fake LLM), template resolver, approval
   (flag on/off + auto-approve pendientes), single-writer, overrides + filter +
   restore original, preview links, re-render cycle + fallo preserva published,
   RLS, compliance retry.
4. Render SSR: /[consultantSlug]/[brandSlug] (+ llms.txt) + /preview/[token] +
   route-manifest + sitemap + leads.
5. E2E COV_BMP_001: pipeline in-process (fake LLM) → HTTP real a la página
   publicada (JSON-LD en HTML crudo, 404 en draft, llms.txt, lead POST).
6. Suite completa + lint/tsc → review delegada → commit + push + CI.

## Testing

- Unit: `src/lib/brandmepage/*.test.ts`. DB: `tests/db/brandme-page.test.ts`.
- E2E: `e2e-validator/tests/brandmepage/generation.spec.ts` (COV_BMP_001.1).
- Regresión completa: pnpm test + e2e + lint + tsc.
