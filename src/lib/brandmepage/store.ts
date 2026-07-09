import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/tenant-context";
import { getActiveExtraction } from "@/lib/extraction/store";
import type { BrandLayer, ConsultantOverlay, GeneratedCopy, PageState } from "./types";
import { resolveUniqueSlug } from "./slug-service";

/**
 * Persistencia del Agente 04 (WO-15). Funciones sobre el db() ambiental en
 * bloques cortos withSystemContext/withTenant del caller. Las transiciones de
 * estado usan el GUC single-writer (trigger enforce_bmp_state_writer) con
 * set_config atómico en el MISMO statement — patrón WO-5.
 */

const STATE_WRITER =
  `SELECT set_config('app.bmp_state_writer', 'page-lifecycle', true)`;

// ── Brand layer ─────────────────────────────────────────────────────────────

const NEUTRAL_TOKENS = {
  logo_url: null,
  primary_color_hex: null,
  secondary_palette: null,
  typography_classification: null,
  header_style: "minimal-nav",
};

/**
 * Resuelve la capa de marca (BrandTemplateResolver + fallthrough dinámico):
 * template ACTIVO del brand si existe; si no, la extracción activa del Agente
 * 02; si la extracción fue degradada, tokens neutrales (ADR-003: la página
 * degradada usa el template default y sigue siendo claimable).
 */
export async function resolveBrandLayer(brandId: string): Promise<BrandLayer | null> {
  const tpl = await db().query<{
    id: string;
    identity_tokens: BrandLayer["identityTokens"];
    content_signals: BrandLayer["contentSignals"];
  }>(
    `SELECT id, identity_tokens, content_signals
     FROM brand_templates WHERE brand_id = $1 AND is_active = true`,
    [brandId],
  );
  if (tpl.rows[0]) {
    return {
      source: "brand_template",
      brandTemplateId: tpl.rows[0].id,
      identityTokens: tpl.rows[0].identity_tokens,
      contentSignals: tpl.rows[0].content_signals,
      fddFinancialData: null,
      sameAsUrls: null,
      rawSourceText: await rawSourceTextForBrand(brandId),
    };
  }

  const active = await getActiveExtraction(brandId);
  if (active) {
    const extra = await db().query<{
      fdd: unknown;
      same_as: string[] | null;
    }>(
      `SELECT fdd_financial_data AS fdd, same_as_urls AS same_as
       FROM brand_extractions WHERE id = $1`,
      [active.id],
    );
    return {
      source: "agent04_dynamic",
      brandTemplateId: null,
      identityTokens: active.identityTokens as BrandLayer["identityTokens"],
      contentSignals: active.contentSignals as BrandLayer["contentSignals"],
      fddFinancialData: extra.rows[0]?.fdd ?? null,
      sameAsUrls: extra.rows[0]?.same_as ?? null,
      rawSourceText: await rawSourceTextForBrand(brandId),
    };
  }

  // Extracción degradada más reciente (sin completed): página con template
  // neutral — content signals parciales si existen.
  const degraded = await db().query<{
    content_signals: BrandLayer["contentSignals"] | null;
  }>(
    `SELECT content_signals FROM brand_extractions
     WHERE brand_id = $1 AND status = 'degraded'
     ORDER BY extracted_at DESC NULLS LAST LIMIT 1`,
    [brandId],
  );
  if (!degraded.rows[0]) return null;
  return {
    source: "agent04_dynamic",
    brandTemplateId: null,
    identityTokens: NEUTRAL_TOKENS,
    contentSignals:
      degraded.rows[0].content_signals ??
      ({
        brand_voice_keywords: [],
        faq_topic_areas: [],
        brand_voice_descriptor: { tone_attributes: [], communication_style: [] },
        avoid_list: [],
        markets_and_services: { customer_segments: [], geographic_markets: [], offerings: [] },
        google_keyword_signals: [],
      } as BrandLayer["contentSignals"]),
    fddFinancialData: null,
    sameAsUrls: null,
    rawSourceText: await rawSourceTextForBrand(brandId),
  };
}

/** Texto fuente scrapeado del brand (para el gate de compliance del copy). */
async function rawSourceTextForBrand(brandId: string): Promise<string> {
  const { rows } = await db().query<{ raw: { pages?: Array<{ text: string }> } | null }>(
    `SELECT raw_content AS raw FROM brand_extractions
     WHERE brand_id = $1 AND raw_content IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [brandId],
  );
  return rows[0]?.raw?.pages?.map((p) => p.text).join("\n") ?? "";
}

// ── Overlay del consultant ──────────────────────────────────────────────────

/** Overlay (capa 3) desde el registro real: users vía firebase_uid. Los campos
 * de perfil que aún no existen (bio/social/loom/credenciales llegan con el
 * portal, Build 6) quedan vacíos → sus bloques se omiten per AC-BPG-002. */
export async function loadConsultantOverlay(consultantId: string): Promise<ConsultantOverlay> {
  const { rows } = await db().query<{ display_name: string | null; photo_url: string | null }>(
    `SELECT u.display_name, u.photo_url
     FROM consultants c LEFT JOIN users u ON u.id = c.firebase_uid
     WHERE c.id = $1`,
    [consultantId],
  );
  return {
    name: rows[0]?.display_name ?? "Consultor BrandMe",
    headshotUrl: rows[0]?.photo_url ?? null,
    bio: null,
    socialLinks: {},
    loomUrl: null,
    credentials: [],
  };
}

// ── Slugs ───────────────────────────────────────────────────────────────────

export async function ensureConsultantSlug(consultantId: string): Promise<string> {
  const existing = await db().query<{ slug: string | null }>(
    `SELECT slug FROM consultants WHERE id = $1`,
    [consultantId],
  );
  if (existing.rows[0]?.slug) return existing.rows[0].slug;

  const overlay = await loadConsultantOverlay(consultantId);
  const slug = await resolveUniqueSlug(overlay.name, async (candidate) => {
    const { rows } = await db().query(`SELECT 1 FROM consultants WHERE slug = $1`, [candidate]);
    return rows.length > 0;
  });
  await db().query(`UPDATE consultants SET slug = $2 WHERE id = $1 AND slug IS NULL`, [
    consultantId,
    slug,
  ]);
  const final = await db().query<{ slug: string }>(
    `SELECT slug FROM consultants WHERE id = $1`,
    [consultantId],
  );
  return final.rows[0].slug;
}

/** Brand-slug único DENTRO del portafolio del consultant (AC-BPG-012.2). */
export async function resolveBrandSlug(consultantId: string, brandId: string): Promise<string> {
  const { rows } = await db().query<{ name: string | null; host: string }>(
    `SELECT name, host FROM brands WHERE id = $1`,
    [brandId],
  );
  const base = rows[0]?.name ?? rows[0]?.host.split(".")[0] ?? "brand";
  return resolveUniqueSlug(base, async (candidate) => {
    const taken = await db().query(
      `SELECT 1 FROM brandme_pages
       WHERE consultant_id = $1 AND brand_slug = $2 AND brand_id <> $3`,
      [consultantId, candidate, brandId],
    );
    return taken.rows.length > 0;
  });
}

// ── Config + página ─────────────────────────────────────────────────────────

export async function insertConfig(input: {
  brandId: string;
  consultantId: string;
  brand: BrandLayer;
  copy: GeneratedCopy;
  complianceVerified: boolean;
}): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO brandme_page_configs
       (brand_id, consultant_id, source, brand_template_id, identity_tokens,
        content_signals, generated_copy, fdd_financial_data, same_as_urls,
        compliance_verified_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb,
             CASE WHEN $10 THEN now() ELSE NULL END)
     RETURNING id`,
    [
      input.brandId,
      input.consultantId,
      input.brand.source,
      input.brand.brandTemplateId,
      JSON.stringify(input.brand.identityTokens),
      JSON.stringify(input.brand.contentSignals),
      JSON.stringify(input.copy),
      input.brand.fddFinancialData ? JSON.stringify(input.brand.fddFinancialData) : null,
      input.brand.sameAsUrls ? JSON.stringify(input.brand.sameAsUrls) : null,
      input.complianceVerified,
    ],
  );
  return rows[0].id;
}

export async function upsertPage(input: {
  consultantId: string;
  brandId: string;
  consultantSlug: string;
  brandSlug: string;
  configId: string;
}): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO brandme_pages
       (consultant_id, brand_id, consultant_slug, brand_slug, config_id, generated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (consultant_id, brand_id) DO UPDATE
       SET config_id = EXCLUDED.config_id, generated_at = now()
     RETURNING id`,
    [input.consultantId, input.brandId, input.consultantSlug, input.brandSlug, input.configId],
  );
  return rows[0].id;
}

/** Transición CAS del lifecycle (single-writer). Devuelve true si aplicó. */
export async function transitionState(
  pageId: string,
  from: PageState[],
  to: PageState,
): Promise<boolean> {
  const updated = await db().query(
    `UPDATE brandme_pages SET state = $3,
        published_at = CASE WHEN $3 = 'published' AND published_at IS NULL THEN now() ELSE published_at END,
        archived_at  = CASE WHEN $3 = 'archived' THEN now() ELSE archived_at END
       FROM (${STATE_WRITER}) AS writer
      WHERE brandme_pages.id = $1 AND brandme_pages.state = ANY($2)`,
    [pageId, from, to],
  );
  return (updated.rowCount ?? 0) === 1;
}

export async function getPageState(pageId: string): Promise<PageState | null> {
  const { rows } = await db().query<{ state: PageState }>(
    `SELECT state FROM brandme_pages WHERE id = $1`,
    [pageId],
  );
  return rows[0]?.state ?? null;
}

// ── Preview links ───────────────────────────────────────────────────────────

export async function createPreviewLink(pageId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await db().query(
    `INSERT INTO preview_links (brandmepage_id, token, expires_at)
     VALUES ($1, $2, now() + interval '14 days')`,
    [pageId, token],
  );
  return token;
}

// ── Lectura para el render ──────────────────────────────────────────────────

export interface RenderablePage {
  id: string;
  consultantId: string;
  brandId: string;
  consultantSlug: string;
  brandSlug: string;
  state: PageState;
  identityTokens: BrandLayer["identityTokens"];
  contentSignals: BrandLayer["contentSignals"];
  generatedCopy: GeneratedCopy;
  fddFinancialData: unknown | null;
  sameAsUrls: string[] | null;
  brandName: string;
  overrides: Record<string, string>;
}

const RENDERABLE_SELECT = `
  SELECT p.id, p.consultant_id AS "consultantId", p.brand_id AS "brandId",
         p.consultant_slug AS "consultantSlug", p.brand_slug AS "brandSlug",
         p.state,
         c.identity_tokens AS "identityTokens", c.content_signals AS "contentSignals",
         c.generated_copy AS "generatedCopy", c.fdd_financial_data AS "fddFinancialData",
         c.same_as_urls AS "sameAsUrls",
         COALESCE(b.name, initcap(split_part(b.host, '.', 1))) AS "brandName"
  FROM brandme_pages p
  JOIN brandme_page_configs c ON c.id = p.config_id
  JOIN brands b ON b.id = p.brand_id`;

async function attachOverrides(page: RenderablePage): Promise<RenderablePage> {
  const { rows } = await db().query<{ field_key: string; current_value: string }>(
    `SELECT field_key, current_value FROM consultant_content_overrides
     WHERE brandmepage_id = $1 AND status = 'live'`,
    [page.id],
  );
  page.overrides = Object.fromEntries(rows.map((r) => [r.field_key, r.current_value]));
  return page;
}

export async function getRenderableBySlugs(
  consultantSlug: string,
  brandSlug: string,
): Promise<RenderablePage | null> {
  const { rows } = await db().query<RenderablePage>(
    `${RENDERABLE_SELECT} WHERE p.consultant_slug = $1 AND p.brand_slug = $2`,
    [consultantSlug, brandSlug],
  );
  return rows[0] ? attachOverrides(rows[0]) : null;
}

export async function getRenderableByPreviewToken(
  token: string,
): Promise<{ page: RenderablePage | null; expired: boolean }> {
  const { rows } = await db().query<RenderablePage & { expired: boolean }>(
    `${RENDERABLE_SELECT}
     JOIN preview_links pl ON pl.brandmepage_id = p.id
     WHERE pl.token = $1`.replace("SELECT p.id,", `SELECT pl.expires_at <= now() AS expired, p.id,`),
    [token],
  );
  if (!rows[0]) return { page: null, expired: false };
  if (rows[0].expired) return { page: null, expired: true };
  return { page: await attachOverrides(rows[0]), expired: false };
}

/** Otras páginas publicadas del consultant (portfolio nav, AC-BPG-013.2). */
export async function getPortfolioPages(
  consultantId: string,
  excludingPageId: string,
): Promise<Array<{ brandName: string; consultantSlug: string; brandSlug: string; logoUrl: string | null; primaryColor: string | null }>> {
  const { rows } = await db().query<{
    brandName: string;
    consultantSlug: string;
    brandSlug: string;
    logoUrl: string | null;
    primaryColor: string | null;
  }>(
    `SELECT COALESCE(b.name, initcap(split_part(b.host, '.', 1))) AS "brandName",
            p.consultant_slug AS "consultantSlug", p.brand_slug AS "brandSlug",
            c.identity_tokens->>'logo_url' AS "logoUrl",
            c.identity_tokens->>'primary_color_hex' AS "primaryColor"
     FROM brandme_pages p
     JOIN brands b ON b.id = p.brand_id
     LEFT JOIN brandme_page_configs c ON c.id = p.config_id
     WHERE p.consultant_id = $1 AND p.id <> $2 AND p.state = 'published'
     ORDER BY p.created_at ASC
     LIMIT 9`,
    [consultantId, excludingPageId],
  );
  return rows;
}
