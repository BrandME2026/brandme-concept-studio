import { randomUUID } from "node:crypto";
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import { MIGRATIONS_DB_URL } from "../../db-urls";

/**
 * COV_MBC_001: Comparison Card — @brandmepage (P2)
 *
 * Contra la página pública REAL: el entry point y los datos de comparación
 * (SSR) aparecen para un consultant multi-marca y NUNCA para uno mono-marca;
 * las marcas de otros consultants jamás se filtran (tenant-scoped).
 */

const COPY = {
  hero_headline: "Compara oportunidades reales con un experto",
  brand_overview:
    "Un portafolio multimarcas te permite evaluar opciones lado a lado con datos divulgados por cada marca y el acompañamiento de un consultor certificado.",
  value_proposition: ["Datos divulgados", "Comparación honesta", "Sin presión"],
  faqs: [
    { question: "¿Puedo comparar marcas?", answer: "Sí: hasta tres marcas del portafolio lado a lado." },
    { question: "¿Los datos son reales?", answer: "Provienen de la divulgación pública de cada marca." },
    { question: "¿Hay recomendación?", answer: "No: la plataforma muestra datos, tú decides." },
    { question: "¿Cuesta algo?", answer: "La comparación es parte de la página, sin costo." },
  ],
  meta_description:
    "Compara franquicias del portafolio de tu consultor lado a lado: inversión inicial, regalías y territorio con datos divulgados por cada marca.",
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

async function seedConsultant(): Promise<string> {
  return withMigrator(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO consultants (firebase_uid) VALUES (NULL) RETURNING id`,
    );
    return rows[0].id;
  });
}

async function seedPublishedPage(
  consultantId: string,
  brandName: string,
  fdd: object | null,
): Promise<string> {
  return withMigrator(async (c) => {
    const host = `${brandName.toLowerCase()}-${randomUUID().slice(0, 6)}.test`;
    const brand = await c.query<{ id: string }>(
      `INSERT INTO brands (url, host, name) VALUES ($1, $2, $3) RETURNING id`,
      [`https://${host}/`, host, brandName],
    );
    await c.query(
      `INSERT INTO brand_extractions (brand_id, status, fdd_financial_data, extracted_at)
       VALUES ($1, 'completed', $2::jsonb, now())`,
      [brand.rows[0].id, fdd ? JSON.stringify(fdd) : null],
    );
    const config = await c.query<{ id: string }>(
      `INSERT INTO brandme_page_configs
         (brand_id, consultant_id, identity_tokens, content_signals, generated_copy, compliance_verified_at)
       VALUES ($1, $2, $3::jsonb, '{}'::jsonb, $4::jsonb, now()) RETURNING id`,
      [
        brand.rows[0].id,
        consultantId,
        JSON.stringify({ logo_url: null, primary_color_hex: "#334155", secondary_palette: null, typography_classification: null, header_style: "minimal-nav" }),
        JSON.stringify(COPY),
      ],
    );
    await c.query(`SELECT set_config('app.bmp_state_writer', 'page-lifecycle', false)`);
    const cSlug = `mbc-${randomUUID().slice(0, 8)}`;
    await c.query(
      `INSERT INTO brandme_pages (consultant_id, brand_id, consultant_slug, brand_slug, state, config_id, published_at)
       VALUES ($1, $2, $3, $4, 'published', $5, now())`,
      [consultantId, brand.rows[0].id, cSlug, brandName.toLowerCase(), config.rows[0].id],
    );
    return `/${cSlug}/${brandName.toLowerCase()}`;
  });
}

let ctx: APIRequestContext;

test.beforeAll(async ({}, testInfo) => {
  ctx = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL! });
});

test.afterAll(async () => {
  await ctx?.dispose();
});

test("@COV_MBC_001.1 @brandmepage — multi-marca: entry point + datos de las marcas propias, tenant-scoped", async () => {
  const consultant = await seedConsultant();
  const currentPath = await seedPublishedPage(consultant, "AlphaGym", {
    investment_range_min: { value: 180000 },
    royalty_rate: { value: "7%" },
  });
  await seedPublishedPage(consultant, "BetaTacos", {
    investment_range_min: { value: 250000 },
    investment_range_max: { value: 400000 },
  });

  // Marca de OTRO consultant: jamás debe aparecer.
  const stranger = await seedConsultant();
  await seedPublishedPage(stranger, "AjenaBrand", null);

  const res = await ctx.get(currentPath);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("Compara esta marca con otras que represento");
  expect(html).toContain("BetaTacos"); // datos SSR de la marca comparable propia
  expect(html, "cero marcas ajenas (tenant-scoped)").not.toContain("AjenaBrand");
});

test("@COV_MBC_001.2 @brandmepage — mono-marca: el entry point NO se renderiza (AC-MBC-001.2)", async () => {
  const consultant = await seedConsultant();
  const path = await seedPublishedPage(consultant, "Solitaria", null);
  const res = await ctx.get(path);
  expect(res.status()).toBe(200);
  expect(await res.text()).not.toContain("Compara esta marca con otras que represento");
});
