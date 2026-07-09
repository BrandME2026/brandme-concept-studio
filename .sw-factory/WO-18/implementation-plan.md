<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-18

**Work Order:** WO-18 — Build 4 — Territory Intelligence: Demographic Data Layer
**Created At (UTC):** 2026-07-09T19:45:00Z

## Summary

Capa de datos demográficos del Territory Intelligence (porción Build 4):
modelos ZipDemographicData/ConsultantTerritories/ZipFranchiseScore/
CrossConsultantZipSignal (0014, RLS), DemographicIngestionPipeline (retries 3×
backoff, data_limited sin estimación, fallo por-ZIP sin bloquear el resto),
TerritoryScoreComputer (read-and-calculate puro, ADR-002: cero APIs en compute)
con 5 perfiles de pesos en ConfigStore y blending 80/20 con umbral de 2
contribuyentes (ADR-003), y la interfaz get_zip_scores para Agent 05.

## Drift documentado (flaggear en 8090 al cerrar)

1. **Census API key (BLOCKER de transporte)**: el API público del Census exige
   key desde 2026 ("Missing Key" verificado en vivo). La key es GRATUITA
   (api.census.gov/data/key_signup.html, llega por email — 2 minutos de Junior).
   El provider real se implementa y verifica al existir CENSUS_API_KEY; mientras,
   la ingesta corre detrás de la interfaz CensusProvider (criterio WO-13:
   no se sube transporte no verificable).
2. **Inconsistencia del spec**: el modelo del blueprint almacena 3 buckets de
   edad (35-65, 25-52, 65+) pero los perfiles citan rangos 42-58/25-50/35-55 —
   mapeados al bucket almacenado más cercano (documentado en 0014).
3. Trigger real (`consultant.territory_confirmed` de Stage 1) llega con WO-12;
   `ingestTerritory()` es la librería que ese evento invocará. Refresh anual Q1
   y agregador semanal cross-consultant = jobs de Trigger.dev (pendiente).
4. TerritoryAvailabilityIngester (REQ-TI-006) NO está en el In Scope del WO-18
   (es de la feature TI pero fuera de la porción "demographic data layer").
5. household_density: sin fuente ACS directa en el set mínimo — columna
   presente, señal null hasta definir la variable ACS (perfil QSR la redistribuye).

## Steps ejecutados

1. 0014 (modelos + RLS + 6 seeds config) → 2. scoring.ts puro (min-max por
señal, redistribución de pesos ante null, blending, degenerados=50) →
3. pipeline.ts (ingesta + cómputo + get_zip_scores) → 4. tests (7 unit + 8 db
con fixtures de valores ACS 2023 PUBLICADOS reales + 1 e2e) → 5. review.

## Testing

- src/lib/territory/scoring.test.ts (unit ×7) · tests/db/territory.test.ts (×8)
- e2e-validator/tests/territory/data-layer.spec.ts (COV_TI_001.1)
- Regresión: 269 Vitest + 28 E2E, lint/tsc cero.
