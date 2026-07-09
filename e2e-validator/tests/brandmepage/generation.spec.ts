import { randomUUID } from "node:crypto";
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import { APP_DB_URL, MIGRATIONS_DB_URL } from "../../db-urls";

/**
 * COV_BMP_001: BrandMePage Generation — @brandmepage @ai (P0)
 *
 * La generación corre in-process (pipeline REAL del Agente 04, LLM fake vía
 * EP-05 — patrón llm-wrapper.spec.ts) y la VERIFICACIÓN va contra la
 * superficie HTTP REAL: la página publicada en /[consultant]/[brand] con
 * JSON-LD en el HTML crudo (ADR-003), llms.txt, 404 en draft, preview link y
 * lead capture funcional (AC-BPG-001.4).
 */

process.env.DATABASE_URL = APP_DB_URL;

import { MockLanguageModelV3 } from "ai/test";
import type { AIModelProvider } from "../../../src/lib/ai/model-provider";
import { generateBrandMePage } from "../../../src/lib/brandmepage/generation-pipeline";
import { approvePage } from "../../../src/lib/brandmepage/lifecycle";

const COPY = {
  hero_headline: "Emprende con la franquicia FitZone hoy",
  brand_overview:
    "FitZone lleva una década construyendo gimnasios boutique rentables con un modelo operativo documentado y soporte real para cada franquiciatario en su mercado local.",
  value_proposition: ["Modelo probado", "Soporte integral", "Territorios abiertos"],
  faqs: [
    { question: "¿Cuánto debo invertir?", answer: "Según la divulgación oficial de la marca y tu mercado objetivo." },
    { question: "¿Necesito experiencia en fitness?", answer: "No: el entrenamiento inicial cubre la operación completa." },
    { question: "¿Cuánto tarda la apertura?", answer: "Depende del local y los permisos de tu ciudad." },
    { question: "¿Qué soporte continuo existe?", answer: "Acompañamiento de campo, tecnología y marketing." },
  ],
  meta_description:
    "Explora la franquicia de gimnasios FitZone con un consultor experto: inversión, soporte de apertura y territorios disponibles explicados con claridad.",
};

function fakeLlm(): AIModelProvider {
  return {
    name: "fake-e2e-04",
    languageModel() {
      return new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: "stop" as const, raw: undefined },
          usage: {
            inputTokens: { total: 500, noCache: 400, cacheRead: 100, cacheWrite: 0 },
            outputTokens: { total: 300, text: 300, reasoning: 0 },
          },
          content: [{ type: "text" as const, text: JSON.stringify(COPY) }],
          warnings: [],
        }),
      });
    },
  };
}

async function withMigrator<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: MIGRATIONS_DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function seedConsultantAndBrand(label: string) {
  return withMigrator(async (c) => {
    const consultant = await c.query<{ id: string }>(
      `INSERT INTO consultants (firebase_uid) VALUES (NULL) RETURNING id`,
    );
    const host = `${label}-${randomUUID().slice(0, 6)}.e2e.test`;
    const brand = await c.query<{ id: string }>(
      `INSERT INTO brands (url, host, name) VALUES ($1, $2, 'FitZone') RETURNING id`,
      [`https://${host}/`, host],
    );
    await c.query(
      `INSERT INTO brand_extractions
         (brand_id, triggered_by_consultant_id, status, identity_tokens, content_signals, same_as_urls, extracted_at)
       VALUES ($1, $2, 'completed', $3::jsonb, $4::jsonb, $5::jsonb, now())`,
      [
        brand.rows[0].id,
        consultant.rows[0].id,
        JSON.stringify({ logo_url: null, primary_color_hex: "#0a7d4f", secondary_palette: ["#f8fafc"], typography_classification: "sans", header_style: "centered-hero" }),
        JSON.stringify({ brand_voice_keywords: ["fitness"], faq_topic_areas: ["inversión"], brand_voice_descriptor: { tone_attributes: ["motivador"], communication_style: ["directo"] }, avoid_list: [], markets_and_services: { customer_segments: [], geographic_markets: [], offerings: ["gimnasios"] }, google_keyword_signals: ["franquicia gimnasio"] }),
        JSON.stringify(["https://es.wikipedia.org/wiki/FitZone"]),
      ],
    );
    return { consultantId: consultant.rows[0].id, brandId: brand.rows[0].id };
  });
}

let ctx: APIRequestContext;

test.beforeAll(async ({}, testInfo) => {
  ctx = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL! });
});

test.afterAll(async () => {
  await ctx?.dispose();
});

test("@COV_BMP_001.1 @brandmepage @ai — un brand config produce página publicada con copy AI y tokens", async () => {
  const { consultantId, brandId } = await seedConsultantAndBrand("pub");

  // Generación + publicación (gate default ON → pending_approval → approve).
  const result = await generateBrandMePage({
    consultantId,
    brandId,
    publish: true,
    llmProvider: fakeLlm(),
    retryBaseMs: 1,
  });
  expect(result.state).toBe("pending_approval");
  expect(await approvePage(result.pageId)).toBe(true);

  const path = `/${result.consultantSlug}/${result.brandSlug}`;

  // La página pública REAL: copy AI + tokens + JSON-LD en el HTML crudo.
  const res = await ctx.get(path);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(COPY.hero_headline);
  expect(html).toContain("#0a7d4f"); // token de color de la marca aplicado
  expect(html).toContain('type="application/ld+json"');
  expect(html).toContain("ProfessionalService");
  expect(html).toContain("BreadcrumbList");
  expect(html).toContain("es.wikipedia.org"); // sameAs del Agente 02

  // llms.txt por página (AC-BPG-010.4).
  const llms = await ctx.get(`${path}/llms.txt`);
  expect(llms.status()).toBe(200);
  expect(await llms.text()).toContain("FitZone Franchise Opportunity");

  // Lead capture funcional con el slug compuesto (AC-BPG-001.4).
  const lead = await ctx.post("/api/leads", {
    data: {
      slug: `${result.consultantSlug}/${result.brandSlug}`,
      name: "Prospecto E2E",
      email: `lead-${randomUUID().slice(0, 6)}@e2e.test`,
      source: "form",
    },
  });
  expect(lead.status()).toBe(200);
  const saved = await withMigrator((c) =>
    c.query(`SELECT name FROM leads WHERE slug = $1`, [
      `${result.consultantSlug}/${result.brandSlug}`,
    ]),
  );
  expect(saved.rows).toHaveLength(1);
});

test("@COV_BMP_001.2 @brandmepage — draft: 404 público, preview accesible, llms.txt 404", async () => {
  const { consultantId, brandId } = await seedConsultantAndBrand("draft");
  const result = await generateBrandMePage({
    consultantId,
    brandId,
    llmProvider: fakeLlm(),
    retryBaseMs: 1,
  });
  expect(result.state).toBe("draft");

  const path = `/${result.consultantSlug}/${result.brandSlug}`;
  expect((await ctx.get(path)).status(), "draft no es pública").toBe(404);
  expect((await ctx.get(`${path}/llms.txt`)).status(), "llms.txt 404 en draft").toBe(404);

  // Preview link (REQ-BPG-011): accesible en draft, con noindex.
  const preview = await ctx.get(`/preview/${result.previewToken}`);
  expect(preview.status()).toBe(200);
  const previewHtml = await preview.text();
  expect(previewHtml).toContain(COPY.hero_headline);
  expect(previewHtml.toLowerCase()).toContain("noindex");
});
