import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { resetAndMigrate, createTenant, asTenant } from "./harness";
import { withMigrator } from "./db-util";
import {
  computeTerritoryScores,
  getZipScores,
  ingestTerritory,
} from "../../src/lib/territory/pipeline";
import type { CensusProvider, ZipSignals } from "../../src/lib/territory/types";

/**
 * WO-18 / COV_TI_001: la capa de datos territorial REAL contra la DB REAL con
 * transporte Census fake (el API exige key desde 2026 — el provider real queda
 * gated en CENSUS_API_KEY). Las cifras de los fixtures son valores ACS 5-year
 * PUBLICADOS reales (Dallas 75201 / 75204, vintage 2023) — datos de test, no
 * mocks de producción.
 */

process.env.CONFIG_CACHE_TTL_MS = "150";

// Valores ACS reales publicados (census.gov, ACS 5-year 2023, redondeados).
const ACS_FIXTURES: Record<string, Partial<ZipSignals>> = {
  "75201": { medianHhIncome: 106_875, popGrowth5yrPct: 22.5, businessOwnerPct: 8.9, ownerOccupancyRate: 22.1, age3565Pct: 39.2, age2552Pct: 46.8, age65PlusPct: 9.4, householdDensityPerSqMile: 4820 },
  "75204": { medianHhIncome: 85_662, popGrowth5yrPct: 9.8, businessOwnerPct: 7.2, ownerOccupancyRate: 26.4, age3565Pct: 36.5, age2552Pct: 49.1, age65PlusPct: 7.8, householdDensityPerSqMile: 6510 },
  "75205": { medianHhIncome: 143_750, popGrowth5yrPct: 3.1, businessOwnerPct: 12.4, ownerOccupancyRate: 55.9, age3565Pct: 34.8, age2552Pct: 38.2, age65PlusPct: 14.6, householdDensityPerSqMile: 3980 },
};

function makeProvider(
  overrides: Record<string, Partial<ZipSignals> | Error> = {},
  calls: string[] = [],
): CensusProvider & { calls: string[] } {
  return {
    name: "fake-census",
    calls,
    async fetchZipSignals(zipCode) {
      calls.push(zipCode);
      const override = overrides[zipCode];
      if (override instanceof Error) throw override;
      const base = ACS_FIXTURES[zipCode] ?? override;
      if (!base) throw new Error(`sin fixture para ${zipCode}`);
      return {
        zipCode,
        medianHhIncome: null,
        popGrowth5yrPct: null,
        businessOwnerPct: null,
        ownerOccupancyRate: null,
        age3565Pct: null,
        age2552Pct: null,
        age65PlusPct: null,
        householdDensityPerSqMile: null,
        acsVintageYear: 2023,
        dataLimited: false,
        ...base,
        ...(override instanceof Error ? {} : override),
      };
    },
  };
}

const FAST = { sleep: async () => {} };

beforeAll(async () => {
  await resetAndMigrate();
});

describe("ingesta (REQ-TI-001 / COV_TI_001.1)", () => {
  it("ingesta las señales ACS de cada ZIP del territorio y marca el estado", async () => {
    const t = await createTenant("ti-ingest");
    const result = await ingestTerritory(
      t.consultantId,
      ["75201", "75204", "75205"],
      makeProvider(),
      FAST,
    );
    expect(result.ingested.sort()).toEqual(["75201", "75204", "75205"]);
    expect(result.failed).toHaveLength(0);

    const { rows } = await withMigrator((c) =>
      c.query(
        `SELECT zip_code, median_hh_income, acs_vintage_year, data_limited
         FROM zip_demographic_data WHERE zip_code = ANY($1) ORDER BY zip_code`,
        [["75201", "75204", "75205"]],
      ),
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].median_hh_income).toBe(106_875);
    expect(rows[0].acs_vintage_year).toBe(2023);
  });

  it("errores transitorios reintentan con backoff; el fallo terminal NO bloquea el resto (AC-TI-001.1)", async () => {
    const t = await createTenant("ti-retry");
    let attempts = 0;
    const flaky: CensusProvider = {
      name: "flaky",
      async fetchZipSignals(zip) {
        if (zip === "75201") {
          attempts++;
          if (attempts <= 2) throw new Error("rate limited");
        }
        if (zip === "99999") throw new Error("siempre falla");
        return makeProvider().fetchZipSignals(zip);
      },
    };
    const result = await ingestTerritory(t.consultantId, ["75201", "99999", "75204"], flaky, FAST);
    expect(attempts).toBe(3); // 2 fallos + éxito
    expect(result.ingested.sort()).toEqual(["75201", "75204"]);
    expect(result.failed).toEqual(["99999"]);

    const { rows } = await withMigrator((c) =>
      c.query(
        `SELECT zip_code, ingestion_status FROM consultant_territories
         WHERE consultant_id = $1 ORDER BY zip_code`,
        [t.consultantId],
      ),
    );
    expect(rows.map((r) => `${r.zip_code}:${r.ingestion_status}`)).toEqual([
      "75201:ingested",
      "75204:ingested",
      "99999:failed",
    ]);
  });

  it("ACS suprimido → data_limited, excluido del scoring, jamás estimado (AC-TI-001.3)", async () => {
    const t = await createTenant("ti-limited");
    const provider = makeProvider({
      "00001": { medianHhIncome: null, dataLimited: true },
    });
    const result = await ingestTerritory(t.consultantId, ["00001", "75201"], provider, FAST);
    expect(result.dataLimited).toEqual(["00001"]);

    const scores = await computeTerritoryScores(t.consultantId, null);
    expect(scores.map((s) => s.zipCode)).toEqual(["75201"]);
  });
});

describe("scoring (REQ-TI-002 / COV_TI_001.1)", () => {
  it("computa 0-100 con el perfil global, persiste y es tenant-scoped", async () => {
    const t = await createTenant("ti-score");
    await ingestTerritory(t.consultantId, ["75201", "75204", "75205"], makeProvider(), FAST);
    const scores = await computeTerritoryScores(t.consultantId, null);

    expect(scores).toHaveLength(3);
    for (const s of scores) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
      expect(s.weightProfileUsed).toBe("global_default");
      expect(s.performanceComponent).toBeNull(); // sin señales cross-consultant
    }
    // 75205 domina income + business owner + owner occupancy con el perfil global.
    const byZip = Object.fromEntries(scores.map((s) => [s.zipCode, s.score]));
    expect(byZip["75205"]).toBe(100);

    // Tenant A ve SOLO sus scores (RLS).
    const other = await createTenant("ti-score-b");
    const seenByOther = await asTenant(other, "pooled", (h) =>
      h.query(`SELECT id FROM zip_franchise_scores`),
    );
    expect(seenByOther.rows).toHaveLength(0);
    const seenByOwner = await asTenant(t, "pooled", (h) =>
      h.query(`SELECT id FROM zip_franchise_scores`),
    );
    expect(seenByOwner.rows).toHaveLength(3);
  });

  it("re-cómputo actualiza en lugar de duplicar (índice parcial global)", async () => {
    const t = await createTenant("ti-recompute");
    await ingestTerritory(t.consultantId, ["75201", "75204"], makeProvider(), FAST);
    await computeTerritoryScores(t.consultantId, null);
    await computeTerritoryScores(t.consultantId, null);
    const { rows } = await withMigrator((c) =>
      c.query(`SELECT count(*) AS n FROM zip_franchise_scores WHERE consultant_id = $1`, [
        t.consultantId,
      ]),
    );
    expect(Number(rows[0].n)).toBe(2);
  });

  it("el vertical del brand elige el perfil (senior_care)", async () => {
    const t = await createTenant("ti-vertical");
    const brandId = await withMigrator(async (c) => {
      const host = `sen-${randomUUID().slice(0, 6)}.test`;
      const b = await c.query<{ id: string }>(
        `INSERT INTO brands (url, host) VALUES ($1, $2) RETURNING id`,
        [`https://${host}/`, host],
      );
      await c.query(
        `INSERT INTO brand_extractions (brand_id, status, vertical_category, extracted_at)
         VALUES ($1, 'completed', 'senior_care', now())`,
        [b.rows[0].id],
      );
      return b.rows[0].id;
    });
    await ingestTerritory(t.consultantId, ["75201", "75205"], makeProvider(), FAST);
    const scores = await computeTerritoryScores(t.consultantId, brandId);
    expect(scores[0].weightProfileUsed).toBe("senior_care");
    // 75205 gana también aquí (65+ 14.6% vs 9.4%, income y occupancy mayores).
    const byZip = Object.fromEntries(scores.map((s) => [s.zipCode, s.score]));
    expect(byZip["75205"]).toBe(100);
  });

  it("performance solo aplica con ≥2 consultants contribuyentes (AC-TI-002.3)", async () => {
    const t = await createTenant("ti-perf");
    await ingestTerritory(t.consultantId, ["75201", "75204"], makeProvider(), FAST);
    await withMigrator((c) =>
      c.query(
        `INSERT INTO cross_consultant_zip_signals
           (zip_code, contributing_consultant_count, aggregate_lead_volume, aggregate_qualified_lead_rate)
         VALUES ('75201', 1, 10, 0.90), ('75204', 3, 40, 0.75)
         ON CONFLICT (zip_code) DO UPDATE SET
           contributing_consultant_count = EXCLUDED.contributing_consultant_count,
           aggregate_qualified_lead_rate = EXCLUDED.aggregate_qualified_lead_rate`,
      ),
    );
    const scores = await computeTerritoryScores(t.consultantId, null);
    const byZip = Object.fromEntries(scores.map((s) => [s.zipCode, s]));
    expect(byZip["75201"].performanceComponent, "1 contribuyente < umbral 2").toBeNull();
    expect(byZip["75204"].performanceComponent).toBe(75);
  });

  it("getZipScores sirve la interfaz de Agent 05", async () => {
    const t = await createTenant("ti-a05");
    await ingestTerritory(t.consultantId, ["75201", "75204"], makeProvider(), FAST);
    await computeTerritoryScores(t.consultantId, null);
    const out = await getZipScores(t.consultantId, null, ["75201", "75204", "00000"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ weightProfile: "global_default" });
    expect(typeof out[0].franchiseReadinessScore).toBe("number");
  });
});
