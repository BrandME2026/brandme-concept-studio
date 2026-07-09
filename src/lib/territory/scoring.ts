import type { WeightProfile, ZipSignals } from "./types";

/**
 * Matemática PURA del franchise readiness score (WO-18, REQ-TI-002):
 * 1) cada señal se normaliza min-max DENTRO del set de ZIPs del cómputo,
 * 2) suma ponderada por el perfil (señales null redistribuyen su peso entre
 *    las presentes — jamás se estima un valor, AC-TI-001.3),
 * 3) el compuesto final se normaliza min-max al rango 0-100 por par
 *    consultant-brand (contrato del blueprint: ranking relativo del portafolio).
 * Sets degenerados (1 ZIP o señal constante) valen 50 — punto medio honesto.
 */

const SIGNAL_KEYS: Record<string, (s: ZipSignals) => number | null> = {
  median_hh_income: (s) => s.medianHhIncome,
  pop_growth_5yr_pct: (s) => s.popGrowth5yrPct,
  business_owner_pct: (s) => s.businessOwnerPct,
  owner_occupancy_rate: (s) => s.ownerOccupancyRate,
  age_35_65_pct: (s) => s.age3565Pct,
  age_25_52_pct: (s) => s.age2552Pct,
  age_65_plus_pct: (s) => s.age65PlusPct,
  household_density_per_sq_mile: (s) => s.householdDensityPerSqMile,
};

function minMax(values: number[]): { min: number; max: number } {
  return { min: Math.min(...values), max: Math.max(...values) };
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

/**
 * Componente demográfico 0-100 por ZIP (pre-blending con performance).
 * Excluye ZIPs data_limited (el caller no debe pasarlos).
 */
export function computeDemographicComponents(
  zips: ZipSignals[],
  profile: WeightProfile,
): Map<string, number> {
  const ranges = new Map<string, { min: number; max: number }>();
  for (const key of Object.keys(profile)) {
    const getter = SIGNAL_KEYS[key];
    if (!getter) continue;
    const present = zips.map(getter).filter((v): v is number => v !== null);
    if (present.length > 0) ranges.set(key, minMax(present));
  }

  const result = new Map<string, number>();
  for (const zip of zips) {
    let weighted = 0;
    let weightUsed = 0;
    for (const [key, weight] of Object.entries(profile)) {
      const getter = SIGNAL_KEYS[key];
      const range = ranges.get(key);
      const value = getter?.(zip) ?? null;
      if (value === null || !range) continue; // señal ausente: peso redistribuido
      weighted += weight * normalize(value, range.min, range.max);
      weightUsed += weight;
    }
    result.set(zip.zipCode, weightUsed > 0 ? (weighted / weightUsed) * 100 : 50);
  }
  return result;
}

/**
 * Blending demográfico + performance (AC-TI-002.3) y normalización final
 * min-max 0-100 del compuesto. perf null (bajo umbral de 2 consultants) →
 * demográfico al 100%.
 */
export function blendAndNormalize(
  components: Array<{ zipCode: string; demographic: number; performance: number | null }>,
  performanceWeightPct: number,
): Array<{ zipCode: string; score: number }> {
  const composites = components.map((c) => ({
    zipCode: c.zipCode,
    composite:
      c.performance === null
        ? c.demographic
        : (c.demographic * (100 - performanceWeightPct) + c.performance * performanceWeightPct) /
          100,
  }));
  const values = composites.map((c) => c.composite);
  const { min, max } = values.length ? minMax(values) : { min: 0, max: 0 };
  return composites.map((c) => ({
    zipCode: c.zipCode,
    score: Math.round(normalize(c.composite, min, max) * 10000) / 100,
  }));
}
