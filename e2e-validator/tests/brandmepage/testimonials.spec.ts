import { randomUUID } from "node:crypto";
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import { APP_DB_URL, MIGRATIONS_DB_URL } from "../../db-urls";

/**
 * COV_TST_001: Testimonials — @brandmepage (P2)
 *
 * La librería REAL de testimonials in-process + verificación contra la página
 * pública REAL: un testimonial limpio se renderiza; uno con términos vetados
 * queda retenido y JAMÁS aparece (AC-TES-004.1).
 */

process.env.DATABASE_URL = APP_DB_URL;

import { addTestimonial } from "../../../src/lib/brandmepage/testimonials";
import { drainRerenders } from "../../../src/lib/brandmepage/rerender-scheduler";

const COPY = {
  hero_headline: "Tu franquicia FitZone con acompañamiento experto",
  brand_overview:
    "FitZone lleva una década construyendo gimnasios boutique rentables con un modelo operativo documentado y soporte real para cada franquiciatario en su mercado.",
  value_proposition: ["Modelo probado", "Soporte integral", "Territorios abiertos"],
  faqs: [
    { question: "¿Cuánto debo invertir?", answer: "Según la divulgación oficial de la marca y tu mercado." },
    { question: "¿Necesito experiencia?", answer: "No: el entrenamiento cubre la operación completa." },
    { question: "¿Cuánto tarda abrir?", answer: "Depende del local y los permisos de tu ciudad." },
    { question: "¿Qué soporte hay?", answer: "Acompañamiento de campo, tecnología y marketing." },
  ],
  meta_description:
    "Explora la franquicia FitZone con un consultor experto: inversión, soporte de apertura y territorios disponibles explicados con claridad total.",
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

/** Página publicada sembrada directo (el pipeline completo ya lo cubre generation.spec). */
async function seedPublishedPage() {
  return withMigrator(async (c) => {
    const consultant = await c.query<{ id: string }>(
      `INSERT INTO consultants (firebase_uid) VALUES (NULL) RETURNING id`,
    );
    const host = `tst-${randomUUID().slice(0, 6)}.test`;
    const brand = await c.query<{ id: string }>(
      `INSERT INTO brands (url, host, name) VALUES ($1, $2, 'FitZone') RETURNING id`,
      [`https://${host}/`, host],
    );
    const config = await c.query<{ id: string }>(
      `INSERT INTO brandme_page_configs
         (brand_id, consultant_id, identity_tokens, content_signals, generated_copy, compliance_verified_at)
       VALUES ($1, $2, $3::jsonb, '{}'::jsonb, $4::jsonb, now()) RETURNING id`,
      [
        brand.rows[0].id,
        consultant.rows[0].id,
        JSON.stringify({ logo_url: null, primary_color_hex: "#0a7d4f", secondary_palette: null, typography_classification: null, header_style: "minimal-nav" }),
        JSON.stringify(COPY),
      ],
    );
    await c.query(`SELECT set_config('app.bmp_state_writer', 'page-lifecycle', false)`);
    const cSlug = `tst-${randomUUID().slice(0, 8)}`;
    await c.query(
      `INSERT INTO brandme_pages (consultant_id, brand_id, consultant_slug, brand_slug, state, config_id, published_at)
       VALUES ($1, $2, $3, 'fitzone', 'published', $4, now())`,
      [consultant.rows[0].id, brand.rows[0].id, cSlug, config.rows[0].id],
    );
    return { consultantId: consultant.rows[0].id, path: `/${cSlug}/fitzone` };
  });
}

let ctx: APIRequestContext;

test.beforeAll(async ({}, testInfo) => {
  ctx = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL! });
});

test.afterAll(async () => {
  await ctx?.dispose();
});

test("@COV_TST_001.1 @brandmepage — el testimonial filtrado se retiene; el limpio se renderiza", async () => {
  const { consultantId, path } = await seedPublishedPage();

  // 1) Testimonial con término vetado → pending_review, JAMÁS en la página.
  const flagged = await addTestimonial(consultantId, {
    quote: "Con esta franquicia tienes dinero garantizado desde el primer mes de operación.",
    displayName: "Pedro L.",
  });
  expect(flagged.status).toBe("pending_review");

  // 2) Testimonial limpio → live y visible en el HTML público.
  const clean = await addTestimonial(consultantId, {
    quote: "El acompañamiento de este consultor hizo toda la diferencia en mi decisión final.",
    displayName: "Laura G.",
    roleContext: "Franquiciataria, Guadalajara",
  });
  expect(clean.status).toBe("live");
  await drainRerenders();

  const res = await ctx.get(path);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("Laura G.");
  expect(html).toContain("hizo toda la diferencia");
  expect(html, "el retenido no aparece").not.toContain("dinero garantizado");
  expect(html).toContain('data-block="testimonials"');
});
