<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-13

**Work Order:** WO-13 — Build 3 — Brand Extraction (Agent 02)
**Created At (UTC):** 2026-07-09T17:27:08Z

## Summary

Construye el Agente 02 como LIBRERÍA de pipeline (`src/lib/extraction/`):
crawl multi-página del sitio de la marca (provider swappable), pass LLM único
(alias `large` vía LLMWrapper/WO-4) que deriva identity tokens + content
signals + vertical + FDD + coverage, quality gate con graceful degradation
(<3 señales primarias), y persistencia de payload + salud en Postgres con RLS.
SIN superficie HTTP nueva: los triggers reales (Stage 1 de WO-12, admin console
de Build 6) no existen aún — mismo criterio que WO-4 (wrapper sin ruta).

## Drift documentado (flaggear en 8090 al cerrar)

1. **Firecrawl (ADR-001)**: sin API key en la máquina. Se implementa el
   `ScrapeProvider` como frontera de transporte (tal como el ADR lo define:
   "transport-layer dependency, not business logic") con `LocalScrapeProvider`
   (Playwright + SSRF guard existentes). El adapter Firecrawl se escribe cuando
   haya key para verificarlo honestamente — NO se sube un adapter no probado.
2. **StorageService (WO-10 blocked)**: el contenido crudo va a Postgres
   (`brand_extractions.raw_content`) detrás de la interfaz `ScrapeStore`; el
   swap a Firebase Storage es un adapter cuando WO-10 se desbloquee.
3. **PostHog (AC-BEX-009.3)**: no configurado; la latencia se persiste en la
   corrida (extracted_at − created_at) y se loguea vía ObservabilityWrapper.
4. **Superficies de Build 6** fuera de scope explícito del WO: resolution cards,
   emails, Brand Extraction Health Dashboard, shared cache. Los DATOS que esas
   superficies leerán (health records, opciones, prioridad) SÍ se persisten.
5. **ComplianceBoundaryChecker**: gatea BrandMePageConfig (no existe hasta
   WO-15/Build 4). El check de 6 palabras verbatim se implementa como función
   pura reutilizable (`compliance.ts`) con tests, sin gate que consumir aún.

## Code Reuse And Package Structure

**Reuso (informe del explorador en context.md):**
- `src/lib/extract/ssrf-guard.ts` (assertSafeUrl/isBlockedHost) tal cual.
- Patrón Playwright anti-SSRF de `extract-design.ts` (route-abort por host).
- `src/lib/ai/llm-wrapper.ts` (WO-4) — invokeLLM alias `large`, provider EP-05
  inyectable (tests con MockLanguageModelV3, patrón llm-wrapper.spec.ts).
- ConfigStore (WO-7) — 8 parámetros nuevos feature_area `extraction`.
- `captureError`/`withObservabilityContext` (WO-8).

**Nuevo (`src/lib/extraction/` — separado de `src/lib/extract/` que sigue
siendo el extractor VISUAL del Concept Studio):**
- `types.ts` — ScrapedPage, ScrapeResult, BrandExtractionPayload (zod), enums.
- `scrape-provider.ts` — interfaz + `LocalScrapeProvider` (Playwright: texto,
  headings, meta, links con anchor text, candidatos a logo og/header/favicon).
- `scraper.ts` — BrandSiteScraper: crawl (max_pages/depth/timeout de config),
  priorización About/FAQ/Locations/Investor + franchise-intent (AC-BEX-014.1),
  retries backoff 2s/4s/8s, clasificación de fallo terminal (4 clases), backup
  URL, truncado a max_content_bytes en orden de prioridad, logo best-effort.
- `agent02-extractor.ts` — prompt único (system ESTÁTICO; contenido en prompt),
  invokeLLM alias large, parse zod, retries ×2 sobre el MISMO contenido,
  sub-tipos de fallo (malformed_response/empty_extraction/api_error/timeout).
- `quality-gate.ts` — 5 señales primarias, degradation_flag <3, per_field_status,
  vertical low → 'other' + guess aparte (AC-BEX-007.3).
- `compliance.ts` — verbatim ≥6 palabras (función pura, AC-BEX-004.2).
- `concurrency-limiter.ts` — cap ConfigStore (clamp 1–50), cola FIFO sin drops,
  contadores expuestos (AC-BEX-012).
- `pipeline.ts` — runBrandExtraction({url, backupUrl?, consultantId?, provider?,
  scrapeProvider?}): upsert brand → corrida running → scrape (backup si terminal)
  → store raw → LLM gated por limiter → quality gate → persistir
  completed/degraded/failed + health record. `reextractFromStored(extractionId)`
  re-corre el pass LLM sobre raw_content SIN re-scrape (AC-BEX-013.3).
- `store.ts` — acceso a brands/brand_extractions/health (db() ambiental).
- `drizzle/0012_brand_extraction.sql` + `src/lib/db/schema.ts`.

## Components And Flow

Stage1/admin (futuro) → `runBrandExtraction` → BrandSiteScraper
(LocalScrapeProvider) → ScrapeStore (raw_content) → Agent02LLMExtractor
(limiter → invokeLLM large) → ExtractionQualityGate → payload
completed/degraded → health record si degradación/fallo. Todas las escrituras
DB en bloques cortos withSystemContext (la corrida es proceso de sistema;
triggered_by_consultant_id es dato); JAMÁS un contexto abarca los awaits de
scrape/LLM (regla WO-3, pool 5).

## Steps

1. **RED** — tests unit (gate, limiter, scoring de links, truncado, compliance,
   schema) + tests db (pipeline con providers fake: completed/degraded/failed/
   re-extract/concurrent-same-brand/RLS).
2. **GREEN** — migración + módulos en el orden types → provider → scraper →
   extractor → gate → limiter → store → pipeline.
3. **E2E** — COV_BEX_001 (.1 payload completo con providers fake in-process;
   .2 sitio inalcanzable con scraper REAL → degradación) — patrón in-process de
   llm-wrapper.spec.ts (sin superficie HTTP que ejercitar; documentado).
4. Suite completa + lint + tsc → review delegada → commit + push + CI.

## Testing

- `tests/extraction/*.test.ts` (unit, node): quality-gate (matriz de señales),
  limiter (cap, FIFO, contadores, clamp 1–50), link-scoring (franchise-intent
  gana, About/FAQ priorizados), truncado (franchise-dev sobrevive, resto se
  corta), compliance verbatim (6+ palabras detecta, 5 no, excepción aprobada),
  zod schema (payload malformado → malformed_response; <2 señales → empty).
- `tests/db/brand-extraction.test.ts`: corrida completa persiste payload +
  active-extraction query; degradada crea health record (único activo por
  brand); fallo scrape terminal → failed + clase; re-extract reusa raw_content
  (el scrape provider NO se invoca); corridas concurrentes mismo brand
  independientes (AC-BEX-001.7); RLS tenant A no ve corridas de B.
- `e2e-validator/tests/extraction/brand-extraction.spec.ts`: COV_BEX_001.1/.2.
- Regresión: pnpm test (unit+db) + e2e completo + lint + tsc.
