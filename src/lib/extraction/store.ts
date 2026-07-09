import { db } from "@/lib/db/tenant-context";
import type { Agent02Output, FailureClass, ScrapeResult } from "./types";

/**
 * Persistencia del Agente 02 (WO-13). Todas las funciones usan el db()
 * ambiental y corren bajo withSystemContext en bloques CORTOS del pipeline
 * (jamás abarcando awaits de scrape/LLM — regla WO-3). El contenido crudo vive
 * en brand_extractions.raw_content (drift documentado: pasa a StorageService
 * cuando WO-10 se desbloquee).
 */

export async function upsertBrandByUrl(url: string): Promise<string> {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO brands (url, host) VALUES ($1, $2)
     ON CONFLICT (host) DO UPDATE SET url = brands.url
     RETURNING id`,
    [url, host],
  );
  return rows[0].id;
}

export async function createRun(input: {
  brandId: string;
  consultantId: string | null;
}): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO brand_extractions (brand_id, triggered_by_consultant_id)
     VALUES ($1, $2) RETURNING id`,
    [input.brandId, input.consultantId],
  );
  return rows[0].id;
}

export async function storeRawContent(extractionId: string, scrape: ScrapeResult): Promise<void> {
  await db().query(
    `UPDATE brand_extractions
       SET raw_content = $2::jsonb, scrape_urls = $3
     WHERE id = $1`,
    [
      extractionId,
      JSON.stringify({
        pages: scrape.pages.map((p) => ({
          url: p.finalUrl,
          title: p.title,
          metaDescription: p.metaDescription,
          headings: p.headings,
          text: p.text,
        })),
        logo_data_uri: scrape.logoDataUri,
        franchise_dev_url: scrape.franchiseDevUrl,
        truncated: scrape.truncated,
      }),
      scrape.scrapedUrls,
    ],
  );
}

export interface PersistPayloadInput {
  extractionId: string;
  output: Agent02Output;
  perFieldStatus: Record<string, string>;
  degraded: boolean;
  logoDataUri: string | null;
}

/** Persiste el payload (AC-BEX-005.8: solo tokens que pasaron; FDD solo 'explicit'). */
export async function persistPayload(input: PersistPayloadInput): Promise<void> {
  const { output, perFieldStatus } = input;

  const identityTokens = {
    logo_url: input.logoDataUri,
    primary_color_hex:
      perFieldStatus.primary_color === "pass" ? output.identity.primary_color_hex : null,
    secondary_palette:
      perFieldStatus.secondary_palette === "pass" ? output.identity.secondary_palette : null,
    typography_classification:
      perFieldStatus.typography === "pass" ? output.identity.typography_classification : null,
    header_style: output.identity.header_style,
  };

  // FDD (AC-BEX-008.5): solo 'explicit' entra al payload; 'inferred' queda en
  // per_field_status.fdd_review para visibilidad de ops sin contaminar datos.
  const explicitFdd: Record<string, unknown> = {};
  const inferredForReview: string[] = [];
  for (const [field, data] of Object.entries(output.fdd)) {
    if (data.confidence === "explicit" && data.value !== null) {
      explicitFdd[field] = { value: data.value, source_url: data.source_url };
    } else if (data.confidence === "inferred") {
      inferredForReview.push(field);
    }
  }

  const lowConfidence = output.vertical.confidence === "low";
  await db().query(
    `UPDATE brand_extractions SET
       status = $2,
       degradation_flag = $3,
       identity_tokens = $4::jsonb,
       content_signals = $5::jsonb,
       vertical_category = $6,
       vertical_confidence = $7,
       vertical_low_confidence_guess = $8,
       fdd_financial_data = $9::jsonb,
       brand_testimonials = $10::jsonb,
       brand_accolades = $11::jsonb,
       intake_protocol_coverage = $12::jsonb,
       per_field_status = $13::jsonb,
       same_as_urls = $14::jsonb,
       failure_class = $15,
       extracted_at = now()
     WHERE id = $1`,
    [
      input.extractionId,
      input.degraded ? "degraded" : "completed",
      input.degraded,
      JSON.stringify(identityTokens),
      JSON.stringify(output.content),
      // AC-BEX-007.3: low confidence se publica como 'other'; el intento queda aparte.
      lowConfidence ? "other" : output.vertical.category,
      output.vertical.confidence,
      lowConfidence ? output.vertical.category : null,
      Object.keys(explicitFdd).length ? JSON.stringify(explicitFdd) : null,
      output.brand_testimonials.length ? JSON.stringify(output.brand_testimonials) : null,
      output.brand_accolades.length
        ? JSON.stringify({ accolades: output.brand_accolades })
        : null,
      JSON.stringify({
        coverage: output.intake_protocol_coverage,
        ai_scope_guardrails_pending_review: output.ai_scope_guardrails,
        additional_relevant_content: output.additional_relevant_content,
      }),
      JSON.stringify({ ...input.perFieldStatus, fdd_inferred_excluded: inferredForReview }),
      output.same_as_urls ? JSON.stringify(output.same_as_urls) : null,
      input.degraded ? "quality_degradation" : null,
    ],
  );
}

export async function markFailed(extractionId: string, failureClass: FailureClass): Promise<void> {
  await db().query(
    `UPDATE brand_extractions SET status = 'failed', failure_class = $2 WHERE id = $1`,
    [extractionId, failureClass],
  );
}

/**
 * Health record de la cola de admin (un ACTIVO por brand): si ya existe uno
 * sin resolver se le anexa el intento (url_attempts) y se actualiza la clase.
 */
export async function upsertHealthRecord(input: {
  extractionId: string;
  brandId: string;
  failureClass: FailureClass;
  consultantId: string | null;
  attemptedUrl: string;
}): Promise<void> {
  await db().query(
    `INSERT INTO brand_extraction_health_records
       (brand_extraction_id, brand_id, failure_class, affected_consultant_ids, url_attempts)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (brand_id) WHERE resolved_at IS NULL
     DO UPDATE SET
       brand_extraction_id = EXCLUDED.brand_extraction_id,
       failure_class = EXCLUDED.failure_class,
       url_attempts = brand_extraction_health_records.url_attempts || EXCLUDED.url_attempts,
       affected_consultant_ids = (
         SELECT ARRAY(SELECT DISTINCT unnest(
           brand_extraction_health_records.affected_consultant_ids || EXCLUDED.affected_consultant_ids))
       )`,
    [
      input.extractionId,
      input.brandId,
      input.failureClass,
      input.consultantId ? [input.consultantId] : [],
      JSON.stringify([
        { url: input.attemptedUrl, attempted_at: new Date().toISOString(), outcome: input.failureClass },
      ]),
    ],
  );
}

/** Resuelve el health record activo del brand (corrida posterior exitosa). */
export async function resolveHealthRecord(brandId: string, path: string): Promise<void> {
  await db().query(
    `UPDATE brand_extraction_health_records
       SET resolved_at = now(), resolution_path = $2
     WHERE brand_id = $1 AND resolved_at IS NULL`,
    [brandId, path],
  );
}

export interface ActiveExtraction {
  id: string;
  identityTokens: unknown;
  contentSignals: unknown;
  verticalCategory: string | null;
  degradationFlag: boolean;
  perFieldStatus: unknown;
}

/** La extracción ACTIVA del brand: la más reciente completada sin degradar. */
export async function getActiveExtraction(brandId: string): Promise<ActiveExtraction | null> {
  const { rows } = await db().query<ActiveExtraction>(
    `SELECT id, identity_tokens AS "identityTokens", content_signals AS "contentSignals",
            vertical_category AS "verticalCategory", degradation_flag AS "degradationFlag",
            per_field_status AS "perFieldStatus"
     FROM brand_extractions
     WHERE brand_id = $1 AND status = 'completed'
     ORDER BY extracted_at DESC LIMIT 1`,
    [brandId],
  );
  return rows[0] ?? null;
}

export async function getRawContent(extractionId: string): Promise<{
  scrape: ScrapeResult | null;
  brandId: string;
  consultantId: string | null;
} | null> {
  const { rows } = await db().query<{
    raw: {
      pages: Array<{ url: string; title: string; metaDescription: string | null; headings: string[]; text: string }>;
      logo_data_uri: string | null;
      franchise_dev_url: string | null;
      truncated: boolean;
    } | null;
    brandId: string;
    consultantId: string | null;
    scrapeUrls: string[];
  }>(
    `SELECT raw_content AS raw, brand_id AS "brandId",
            triggered_by_consultant_id AS "consultantId", scrape_urls AS "scrapeUrls"
     FROM brand_extractions WHERE id = $1`,
    [extractionId],
  );
  if (!rows[0]) return null;
  const { raw, brandId, consultantId, scrapeUrls } = rows[0];
  if (!raw) return { scrape: null, brandId, consultantId };
  return {
    brandId,
    consultantId,
    scrape: {
      pages: raw.pages.map((p) => ({
        url: p.url,
        finalUrl: p.url,
        title: p.title,
        metaDescription: p.metaDescription,
        ogImage: null,
        headings: p.headings,
        text: p.text,
        links: [],
        hasPasswordInput: false,
        scriptCount: 0,
        logoCandidate: null,
      })),
      scrapedUrls: scrapeUrls,
      logoDataUri: raw.logo_data_uri,
      franchiseDevUrl: raw.franchise_dev_url,
      truncated: raw.truncated,
    },
  };
}
