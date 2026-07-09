<!--lint disable strong-marker-->

# Work Order Entity Index: WO-13

**Initialized At (UTC):** 2026-07-09T17:27:08Z
**Current Status:** implemented — 219/219 Vitest + 25/25 E2E; en review

## Work Order

- WO-13: Build 3 — Brand Extraction (Agent 02) (`24686611-a648-4d0f-af3f-3daf9dcbc5c6`)

## Requirements

- Brand Extraction (`03296888-5840-4adb-9f34-9f85d3f1570e`) — REQ-BEX-001…014

## Blueprints

- Brand Extraction (`1b5a8f04-571c-48b7-b0ae-d1f4accb0ad1`) — ADR-001 Firecrawl transporte,
  ADR-002 single-pass, ADR-003 degradación siempre claimable, ADR-004 re-extract sin re-scrape

## Referenced Blueprints

Blueprints reached through `@…` mentions and links while reading linked blueprints.

- Shared Brand Extraction Cache (`21049556`) — hijo, Build 6+: OUT OF SCOPE (per WO)
- Platform Foundation (LLMWrapper/StorageService/ConfigStore/ObservabilityWrapper) — WO-4/7/8 ya
  implementados; StorageService (WO-10) BLOCKED → drift raw_content en Postgres
- BrandMePage Generation / Knowledge Vault — consumidores de brand_extraction.completed
  (Build 4): los eventos no tienen suscriptores aún; el payload queda persistido y consultable

## Delivery

- Branch: 8080juniora
- Pull Request URL: (sin PR — flujo de commits directos autorizado por el usuario)
- Issue: https://github.com/BrandME2026/brandme-concept-studio/issues/15

## Decisiones de ejecución clave

1. Pipeline como LIBRERÍA sin ruta HTTP (triggers reales: WO-12 Stage 1 / Build 6 admin) —
   mismo criterio que WO-4. Los E2E ejercitan el pipeline in-process (patrón llm-wrapper.spec.ts).
2. ScrapeProvider = frontera de transporte (ADR-001). LocalScrapeProvider reutiliza el
   endurecimiento SSRF del extractor visual (src/lib/extract/); adapter Firecrawl pendiente
   de API key (no se sube transporte no verificable).
3. src/lib/extraction/ (marca, multi-página, texto) separado de src/lib/extract/
   (visual single-page del Concept Studio) — este último NO se toca salvo exportar 2 helpers.
4. Drift documentado en implementation-plan.md: raw content en Postgres, PostHog ausente,
   superficies de Build 6 (cards/emails/dashboard) fuera de scope con datos ya persistidos.
