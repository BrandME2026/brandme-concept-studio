import { describe, expect, it } from "vitest";
import { blendAndNormalize, computeDemographicComponents } from "./scoring";
import type { ZipSignals } from "./types";

/**
 * WO-18: matemática pura del franchise readiness score (REQ-TI-002) —
 * normalización min-max por señal, redistribución de pesos ante señales
 * ausentes (jamás estimar, AC-TI-001.3) y blending con performance.
 */

function zip(zipCode: string, overrides: Partial<ZipSignals> = {}): ZipSignals {
  return {
    zipCode,
    medianHhIncome: 60_000,
    popGrowth5yrPct: 5,
    businessOwnerPct: 10,
    ownerOccupancyRate: 60,
    age3565Pct: 40,
    age2552Pct: 35,
    age65PlusPct: 15,
    householdDensityPerSqMile: 1200,
    acsVintageYear: 2023,
    dataLimited: false,
    ...overrides,
  };
}

const GLOBAL = {
  business_owner_pct: 30,
  median_hh_income: 25,
  age_35_65_pct: 20,
  pop_growth_5yr_pct: 15,
  owner_occupancy_rate: 10,
};

describe("computeDemographicComponents", () => {
  it("el ZIP dominante en todas las señales obtiene el componente máximo", () => {
    const zips = [
      zip("11111", { medianHhIncome: 40_000, businessOwnerPct: 5, age3565Pct: 30, popGrowth5yrPct: 1, ownerOccupancyRate: 40 }),
      zip("22222", { medianHhIncome: 90_000, businessOwnerPct: 20, age3565Pct: 50, popGrowth5yrPct: 9, ownerOccupancyRate: 80 }),
      zip("33333"),
    ];
    const c = computeDemographicComponents(zips, GLOBAL);
    expect(c.get("22222")).toBe(100);
    expect(c.get("11111")).toBe(0);
    expect(c.get("33333")).toBeGreaterThan(0);
    expect(c.get("33333")).toBeLessThan(100);
  });

  it("una señal null redistribuye su peso (no se estima)", () => {
    const zips = [
      zip("11111", { businessOwnerPct: null, medianHhIncome: 90_000 }),
      zip("22222", { businessOwnerPct: 20, medianHhIncome: 40_000 }),
    ];
    const c = computeDemographicComponents(zips, GLOBAL);
    // 11111 gana income (peso renormalizado sin business_owner); no lanza ni inventa.
    expect(c.get("11111")).toBeGreaterThan(0);
    expect(Number.isFinite(c.get("11111")!)).toBe(true);
  });

  it("señal constante en todo el set vale 0.5 (sin división por cero)", () => {
    const zips = [zip("11111"), zip("22222")];
    const c = computeDemographicComponents(zips, GLOBAL);
    expect(c.get("11111")).toBe(50);
    expect(c.get("22222")).toBe(50);
  });

  it("el perfil elige las señales: senior_care pondera age_65_plus", () => {
    const senior = { age_65_plus_pct: 40, median_hh_income: 25, owner_occupancy_rate: 20, pop_growth_5yr_pct: 15 };
    const zips = [
      zip("11111", { age65PlusPct: 30, medianHhIncome: 60_000, ownerOccupancyRate: 60, popGrowth5yrPct: 5 }),
      zip("22222", { age65PlusPct: 5, medianHhIncome: 60_000, ownerOccupancyRate: 60, popGrowth5yrPct: 5 }),
    ];
    const c = computeDemographicComponents(zips, senior);
    expect(c.get("11111")!).toBeGreaterThan(c.get("22222")!);
  });
});

describe("blendAndNormalize (AC-TI-002.2/.3)", () => {
  it("sin performance: demográfico al 100% y normalización 0-100", () => {
    const out = blendAndNormalize(
      [
        { zipCode: "1", demographic: 20, performance: null },
        { zipCode: "2", demographic: 80, performance: null },
        { zipCode: "3", demographic: 50, performance: null },
      ],
      20,
    );
    const byZip = Object.fromEntries(out.map((o) => [o.zipCode, o.score]));
    expect(byZip["2"]).toBe(100);
    expect(byZip["1"]).toBe(0);
    expect(byZip["3"]).toBe(50);
  });

  it("la performance mueve el ranking cuando está presente (peso 20%)", () => {
    const out = blendAndNormalize(
      [
        { zipCode: "a", demographic: 60, performance: null },
        { zipCode: "b", demographic: 55, performance: 100 }, // perf lo empuja arriba
      ],
      20,
    );
    const byZip = Object.fromEntries(out.map((o) => [o.zipCode, o.score]));
    expect(byZip["b"]).toBeGreaterThan(byZip["a"]);
  });

  it("set de un solo ZIP: punto medio (50), sin NaN", () => {
    const out = blendAndNormalize([{ zipCode: "x", demographic: 70, performance: null }], 20);
    expect(out[0].score).toBe(50);
  });
});
