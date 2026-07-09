import { getConfigNumber, getConfigValue } from "@/lib/config/config-store";
import { db, withSystemContext } from "@/lib/db/tenant-context";
import { captureError, withObservabilityContext } from "@/lib/observability/observability";
import { blendAndNormalize, computeDemographicComponents } from "./scoring";
import type {
  CensusProvider,
  IngestionResult,
  WeightProfile,
  ZipScore,
  ZipSignals,
} from "./types";

/**
 * DemographicIngestionPipeline + TerritoryScoreComputer (WO-18). La ingesta
 * corre como proceso background in-process (el Task Server real llega con
 * Trigger.dev — mismo interim documentado que Agentes 02/04); el cómputo es
 * READ-AND-CALCULATE puro sobre Postgres (ADR-002: cero APIs externas en
 * compute-time). Todas las escrituras en bloques cortos withSystemContext;
 * los fetch del Census corren FUERA de contexto DB (regla WO-3).
 */

const DEFAULT_PROFILES: Record<string, WeightProfile> = {
  global_default: {
    business_owner_pct: 30,
    median_hh_income: 25,
    age_35_65_pct: 20,
    pop_growth_5yr_pct: 15,
    owner_occupancy_rate: 10,
  },
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Confirma el territorio del consultant (llamado por Stage 1/WO-12 o admin) e
 * ingesta las señales ACS de cada ZIP con retries 3× backoff (AC-TI-001.1).
 * Un ZIP que falla queda `pending→failed` y JAMÁS bloquea el resto.
 */
export async function ingestTerritory(
  consultantId: string,
  zipCodes: string[],
  provider: CensusProvider,
  opts: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<IngestionResult> {
  return withObservabilityContext(
    { surface: "territory-ingestion", role: "system", consultant_id: consultantId },
    async () => {
      const sleep = opts.sleep ?? defaultSleep;
      const retries = await getConfigNumber("territory", "ingest_retries", 3);
      const baseMs = await getConfigNumber("territory", "ingest_retry_base_ms", 2000);

      await withSystemContext("territory-ingestion", async () => {
        for (const zip of zipCodes) {
          await db().query(
            `INSERT INTO consultant_territories (consultant_id, zip_code)
             VALUES ($1, $2) ON CONFLICT (consultant_id, zip_code) DO NOTHING`,
            [consultantId, zip],
          );
        }
      });

      const result: IngestionResult = { ingested: [], dataLimited: [], failed: [] };
      for (const zip of zipCodes) {
        let signals: ZipSignals | null = null;
        for (let attempt = 0; attempt <= retries && !signals; attempt++) {
          try {
            signals = await provider.fetchZipSignals(zip);
          } catch (err) {
            if (attempt < retries) {
              await sleep(baseMs * 2 ** attempt); // 2s, 4s, 8s
            } else {
              captureError(err, `[territory] ingesta de ZIP ${zip} agotó ${retries + 1} intentos`);
            }
          }
        }

        await withSystemContext("territory-ingestion", async () => {
          if (!signals) {
            await db().query(
              `UPDATE consultant_territories SET ingestion_status = 'failed'
               WHERE consultant_id = $1 AND zip_code = $2`,
              [consultantId, zip],
            );
            result.failed.push(zip);
            return;
          }
          await db().query(
            `INSERT INTO zip_demographic_data
               (zip_code, median_hh_income, pop_growth_5yr_pct, business_owner_pct,
                owner_occupancy_rate, age_35_65_pct, age_25_52_pct, age_65_plus_pct,
                household_density_per_sq_mile, acs_vintage_year, data_limited, last_fetched_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
             ON CONFLICT (zip_code) DO UPDATE SET
               median_hh_income = EXCLUDED.median_hh_income,
               pop_growth_5yr_pct = EXCLUDED.pop_growth_5yr_pct,
               business_owner_pct = EXCLUDED.business_owner_pct,
               owner_occupancy_rate = EXCLUDED.owner_occupancy_rate,
               age_35_65_pct = EXCLUDED.age_35_65_pct,
               age_25_52_pct = EXCLUDED.age_25_52_pct,
               age_65_plus_pct = EXCLUDED.age_65_plus_pct,
               household_density_per_sq_mile = EXCLUDED.household_density_per_sq_mile,
               acs_vintage_year = EXCLUDED.acs_vintage_year,
               data_limited = EXCLUDED.data_limited,
               last_fetched_at = now()`,
            [
              zip,
              signals.medianHhIncome,
              signals.popGrowth5yrPct,
              signals.businessOwnerPct,
              signals.ownerOccupancyRate,
              signals.age3565Pct,
              signals.age2552Pct,
              signals.age65PlusPct,
              signals.householdDensityPerSqMile,
              signals.acsVintageYear,
              signals.dataLimited,
            ],
          );
          await db().query(
            `UPDATE consultant_territories SET ingestion_status = 'ingested'
             WHERE consultant_id = $1 AND zip_code = $2`,
            [consultantId, zip],
          );
          (signals.dataLimited ? result.dataLimited : result.ingested).push(zip);
        });
      }
      return result;
    },
  );
}

async function resolveProfile(
  brandId: string | null,
): Promise<{ key: string; profile: WeightProfile }> {
  const profiles = await getConfigValue<Record<string, WeightProfile>>(
    "territory",
    "weight_profiles",
    DEFAULT_PROFILES,
  );
  if (brandId) {
    const { rows } = await db().query<{ vertical: string | null }>(
      `SELECT vertical_category AS vertical FROM brand_extractions
       WHERE brand_id = $1 AND status = 'completed'
       ORDER BY extracted_at DESC LIMIT 1`,
      [brandId],
    );
    const vertical = rows[0]?.vertical;
    if (vertical && profiles[vertical]) return { key: vertical, profile: profiles[vertical] };
  }
  return { key: "global_default", profile: profiles.global_default ?? DEFAULT_PROFILES.global_default };
}

/**
 * TerritoryScoreComputer (REQ-TI-002): calcula y persiste los scores del
 * territorio del consultant para un brand (o global con brand null). Excluye
 * ZIPs data_limited; el componente de performance solo aplica con ≥2
 * consultants contribuyentes (AC-TI-002.3).
 */
export async function computeTerritoryScores(
  consultantId: string,
  brandId: string | null,
): Promise<ZipScore[]> {
  return withSystemContext("territory-scoring", async () => {
    const { key: profileKey, profile } = await resolveProfile(brandId);
    const perfWeight = await getConfigNumber("territory", "performance_weight_pct", 20);
    const minContributors = await getConfigNumber("territory", "min_contributing_consultants", 2);

    const { rows: zips } = await db().query<{
      zip_code: string;
      median_hh_income: number | null;
      pop_growth_5yr_pct: string | null;
      business_owner_pct: string | null;
      owner_occupancy_rate: string | null;
      age_35_65_pct: string | null;
      age_25_52_pct: string | null;
      age_65_plus_pct: string | null;
      household_density_per_sq_mile: string | null;
      acs_vintage_year: number;
    }>(
      `SELECT d.*
       FROM consultant_territories t
       JOIN zip_demographic_data d ON d.zip_code = t.zip_code
       WHERE t.consultant_id = $1 AND t.ingestion_status = 'ingested'
         AND d.data_limited = false`,
      [consultantId],
    );

    const num = (v: string | number | null) => (v === null ? null : Number(v));
    const signals = zips.map((z) => ({
      zipCode: z.zip_code,
      medianHhIncome: num(z.median_hh_income),
      popGrowth5yrPct: num(z.pop_growth_5yr_pct),
      businessOwnerPct: num(z.business_owner_pct),
      ownerOccupancyRate: num(z.owner_occupancy_rate),
      age3565Pct: num(z.age_35_65_pct),
      age2552Pct: num(z.age_25_52_pct),
      age65PlusPct: num(z.age_65_plus_pct),
      householdDensityPerSqMile: num(z.household_density_per_sq_mile),
      acsVintageYear: z.acs_vintage_year,
      dataLimited: false,
    }));
    if (signals.length === 0) return [];

    const demographic = computeDemographicComponents(signals, profile);

    // Performance: agregados anónimos con umbral de contribuyentes (ADR-003).
    const { rows: perf } = await db().query<{
      zip_code: string;
      contributing_consultant_count: number;
      aggregate_qualified_lead_rate: string | null;
    }>(
      `SELECT zip_code, contributing_consultant_count, aggregate_qualified_lead_rate
       FROM cross_consultant_zip_signals
       WHERE zip_code = ANY($1)`,
      [signals.map((s) => s.zipCode)],
    );
    const perfByZip = new Map(
      perf
        .filter(
          (p) => p.contributing_consultant_count >= minContributors &&
            p.aggregate_qualified_lead_rate !== null,
        )
        .map((p) => [p.zip_code, Number(p.aggregate_qualified_lead_rate) * 100]),
    );

    const blended = blendAndNormalize(
      signals.map((s) => ({
        zipCode: s.zipCode,
        demographic: demographic.get(s.zipCode) ?? 50,
        performance: perfByZip.get(s.zipCode) ?? null,
      })),
      perfWeight,
    );

    const scores: ZipScore[] = blended.map((b) => ({
      zipCode: b.zipCode,
      score: b.score,
      demographicComponent: Math.round((demographic.get(b.zipCode) ?? 50) * 100) / 100,
      performanceComponent: perfByZip.has(b.zipCode)
        ? Math.round(perfByZip.get(b.zipCode)! * 100) / 100
        : null,
      weightProfileUsed: profileKey,
    }));

    // El conflict target depende del índice parcial que aplica (brand vs global).
    const conflict = brandId
      ? `ON CONFLICT (consultant_id, brand_id, zip_code) WHERE brand_id IS NOT NULL`
      : `ON CONFLICT (consultant_id, zip_code) WHERE brand_id IS NULL`;
    for (const s of scores) {
      await db().query(
        `INSERT INTO zip_franchise_scores
           (consultant_id, brand_id, zip_code, score, demographic_component,
            performance_component, weight_profile_used, computed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now())
         ${conflict}
         DO UPDATE SET score = EXCLUDED.score,
           demographic_component = EXCLUDED.demographic_component,
           performance_component = EXCLUDED.performance_component,
           weight_profile_used = EXCLUDED.weight_profile_used,
           computed_at = now()`,
        [
          consultantId,
          brandId,
          s.zipCode,
          s.score,
          s.demographicComponent,
          s.performanceComponent,
          s.weightProfileUsed,
        ],
      );
    }
    return scores;
  });
}

/** Interfaz para Agent 05 (contrato del blueprint): scores por ZIP. */
export async function getZipScores(
  consultantId: string,
  brandId: string | null,
  zipCodes: string[],
): Promise<Array<{ zipCode: string; franchiseReadinessScore: number; weightProfile: string }>> {
  return withSystemContext("territory-scoring", async () => {
    const { rows } = await db().query<{
      zip_code: string;
      score: string;
      weight_profile_used: string;
    }>(
      `SELECT zip_code, score, weight_profile_used FROM zip_franchise_scores
       WHERE consultant_id = $1 AND brand_id IS NOT DISTINCT FROM $2 AND zip_code = ANY($3)`,
      [consultantId, brandId, zipCodes],
    );
    return rows.map((r) => ({
      zipCode: r.zip_code,
      franchiseReadinessScore: Number(r.score),
      weightProfile: r.weight_profile_used,
    }));
  });
}
