<!--lint disable strong-marker-->

# Work Order Entity Index: WO-18

**Initialized At (UTC):** 2026-07-09T19:45:00Z
**Current Status:** implemented — 269/269 Vitest + 28/28 E2E; en review

## Work Order

- WO-18: Build 4 — Territory Intelligence: Demographic Data Layer (`b3696200-38f3-460a-90f3-9e28c108c4c0`)

## Requirements

- Territory Intelligence (`26189b4a-f386-4315-ae3d-2da36f795b08`) — REQ-TI-001/002/010 (porción Build 4)

## Blueprints

- Territory Intelligence (`d9e7cb5d-6a41-42e8-914b-6f75f9035df3`) — ADR-001 datos en Build 4 /
  portal en Build 8, ADR-002 pre-fetch-and-calculate, ADR-003 umbral 2 contribuyentes

## Referenced Blueprints

- Content Intelligence — Agent 05 consume get_zip_scores (WO-17, blocked por DataForSEO)
- Brand Extraction / BrandMePage Generation — TerritoryAvailabilityIngester (FUERA del scope WO-18)
- Competitive Territory Monitor — "Later", gated en Agent 11 (60 días producción)

## Delivery

- Branch: 8080juniora
- Issue: https://github.com/BrandME2026/brandme-concept-studio/issues/17

## Hallazgo de ejecución clave

El Census API (fuente pública/gratuita del requirement) EXIGE key desde 2026 —
verificado en vivo ("Missing Key", HTTP 302). Key gratuita en 2 minutos:
https://api.census.gov/data/key_signup.html (llega por email → no obtenible por
el agente). Provider real gated; interfaz CensusProvider lista para el swap.
