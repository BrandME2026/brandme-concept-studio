import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { APP_DB_URL, MIGRATIONS_DB_URL } from "../../db-urls";

/**
 * COV_TI_001: Territory Data Layer — @territory @data (P2)
 *
 * Nivel de integración (patrón llm-wrapper/brand-extraction): la capa REAL de
 * ingesta + scoring contra la DB REAL con transporte Census fake — el Census
 * API exige key desde 2026 (gratuita) y el provider real queda gated en
 * CENSUS_API_KEY. Fixtures con valores ACS 5-year publicados reales.
 */

process.env.DATABASE_URL = APP_DB_URL;

import { computeTerritoryScores, ingestTerritory } from "../../../src/lib/territory/pipeline";
import type { CensusProvider } from "../../../src/lib/territory/types";

const provider: CensusProvider = {
  name: "fake-census-e2e",
  async fetchZipSignals(zipCode) {
    const fixtures: Record<string, [number, number, number, number, number]> = {
      // [income, growth, businessOwner, ownerOcc, age35-65] — ACS 2023 publicados
      "75201": [106_875, 22.5, 8.9, 22.1, 39.2],
      "75204": [85_662, 9.8, 7.2, 26.4, 36.5],
    };
    const f = fixtures[zipCode];
    if (!f) throw new Error(`sin fixture para ${zipCode}`);
    return {
      zipCode,
      medianHhIncome: f[0],
      popGrowth5yrPct: f[1],
      businessOwnerPct: f[2],
      ownerOccupancyRate: f[3],
      age3565Pct: f[4],
      age2552Pct: null,
      age65PlusPct: null,
      householdDensityPerSqMile: null,
      acsVintageYear: 2023,
      dataLimited: false,
    };
  },
};

async function withMigrator<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: MIGRATIONS_DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test("@COV_TI_001.1 @territory @data — los ZIP scores se computan según el perfil y quedan tenant-scoped", async () => {
  const consultantId = await withMigrator(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO consultants (firebase_uid) VALUES (NULL) RETURNING id`,
    );
    await c.query(
      `INSERT INTO consultant_sessions (session_id, consultant_id) VALUES ($1, $2)`,
      [`sess-ti-${randomUUID().slice(0, 8)}`, rows[0].id],
    );
    return rows[0].id;
  });

  const ingestion = await ingestTerritory(consultantId, ["75201", "75204"], provider, {
    sleep: async () => {},
  });
  expect(ingestion.ingested.sort()).toEqual(["75201", "75204"]);

  const scores = await computeTerritoryScores(consultantId, null);
  expect(scores).toHaveLength(2);
  for (const s of scores) {
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.weightProfileUsed).toBe("global_default");
  }

  // Tenant-scoped: otro consultant no ve estos scores (rol de app + RLS).
  const otherConsultant = await withMigrator(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO consultants (firebase_uid) VALUES (NULL) RETURNING id`,
    );
    return rows[0].id;
  });
  const appClient = new Client({ connectionString: APP_DB_URL });
  await appClient.connect();
  try {
    await appClient.query("BEGIN");
    await appClient.query(`SELECT set_config('app.consultant_id', $1, true)`, [otherConsultant]);
    const { rows } = await appClient.query(`SELECT id FROM zip_franchise_scores`);
    expect(rows, "cero scores ajenos visibles").toHaveLength(0);
    await appClient.query("COMMIT");
  } finally {
    await appClient.end();
  }
});
