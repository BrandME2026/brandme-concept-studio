/**
 * Territory Intelligence — capa de datos demográficos (WO-18, Build 4,
 * blueprint d9e7cb5d). La visualización/portal llega en Build 8; esto es la
 * capa que acumula datos y sirve a Agent 05 vía get_zip_scores.
 */

/** Señales ACS por ZIP (modelo ZipDemographicData). null = señal ausente. */
export interface ZipSignals {
  zipCode: string;
  medianHhIncome: number | null;
  popGrowth5yrPct: number | null;
  businessOwnerPct: number | null;
  ownerOccupancyRate: number | null;
  age3565Pct: number | null;
  age2552Pct: number | null;
  age65PlusPct: number | null;
  householdDensityPerSqMile: number | null;
  acsVintageYear: number;
  /** ACS suprimido/bajo umbral: se excluye del scoring, jamás se estima (AC-TI-001.3). */
  dataLimited: boolean;
}

/**
 * Frontera de transporte del Census (mismo criterio que ScrapeProvider/EP-05):
 * el Census API exige key desde 2026 (gratuita — api.census.gov/data/key_signup)
 * y no hay una en el entorno; el provider REAL se implementa y verifica cuando
 * exista CENSUS_API_KEY — no se sube transporte no probado.
 */
export interface CensusProvider {
  name: string;
  /** Señales del ZIP, o `dataLimited: true` cuando ACS lo suprime. Lanza en error transitorio. */
  fetchZipSignals(zipCode: string): Promise<ZipSignals>;
}

/** Perfil de pesos (clave = columna de señal; valor = peso en %). */
export type WeightProfile = Record<string, number>;

export interface ZipScore {
  zipCode: string;
  score: number;
  demographicComponent: number;
  performanceComponent: number | null;
  weightProfileUsed: string;
}

export interface IngestionResult {
  ingested: string[];
  dataLimited: string[];
  failed: string[];
}
