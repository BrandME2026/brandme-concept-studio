import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { APP_DB_URL, MIGRATIONS_DB_URL } from "../../db-urls";

/**
 * COV_BEX_001: Brand Extraction — @extraction @ai (P0)
 *
 * Nivel de integración (mismo criterio que llm-wrapper.spec.ts): se ejercita el
 * PIPELINE REAL del Agente 02 contra la base REAL (rol de app, RLS, telemetría
 * LLM incluida) con transportes fake vía las interfaces de diseño —
 * ScrapeProvider (ADR-001: transporte) y AIModelProvider (EP-05). El caso .2
 * usa el LocalScrapeProvider REAL contra un host inalcanzable. No existe
 * superficie HTTP del agente todavía: el trigger real llega con WO-12 (Stage 1)
 * y el admin re-extract con Build 6 — documentado en el WO.
 */

process.env.DATABASE_URL = APP_DB_URL;

import { MockLanguageModelV3 } from "ai/test";
import type { AIModelProvider } from "../../../src/lib/ai/model-provider";
import { runBrandExtraction } from "../../../src/lib/extraction/pipeline";
import type { ScrapedPage, ScrapeProvider } from "../../../src/lib/extraction/types";

const FULL_OUTPUT = {
  identity: {
    primary_color_hex: "#0055a5",
    secondary_palette: ["#ffffff", "#222222"],
    typography_classification: "humanist sans-serif",
    header_style: "centered-hero",
  },
  content: {
    brand_voice_keywords: ["fitness", "comunidad", "energía", "resultados", "bienestar", "entrenadores", "membresía", "salud", "constancia", "equipo"],
    faq_topic_areas: ["inversión y regalías", "soporte de apertura", "territorios disponibles"],
    brand_voice_descriptor: { tone_attributes: ["motivador", "cercano"], communication_style: ["directo"] },
    avoid_list: [],
    markets_and_services: { customer_segments: ["adultos activos"], geographic_markets: ["México"], offerings: ["gimnasios boutique"] },
    google_keyword_signals: ["franquicia gimnasio", "abrir gimnasio", "fitness franquicia", "inversión gimnasio", "gimnasio boutique", "negocio fitness", "franquicia deporte", "cuánto cuesta gimnasio", "gimnasio rentable", "franquicias salud"],
  },
  vertical: { category: "fitness_wellness", confidence: "high", signals: ["gimnasio", "entrenamiento"] },
  fdd: {
    investment_range_min: { value: 180000, source_url: "https://e2e-brand.test/franchise", confidence: "explicit" },
    investment_range_max: { value: null, source_url: null, confidence: "absent" },
    avg_unit_volume: { value: null, source_url: null, confidence: "absent" },
    royalty_rate: { value: null, source_url: null, confidence: "absent" },
    total_unit_count: { value: 120, source_url: "https://e2e-brand.test/franchise", confidence: "explicit" },
  },
  intake_protocol_coverage: {
    investment_breakdown: "present", ideal_franchisee_profile: "absent", opening_timeline: "partial",
    unit_economics: "absent", support_model: "present", franchisee_health: "absent",
    territory_growth: "present", success_failure_patterns: "absent",
    competitive_differentiation: "partial", ai_scope_boundaries: "absent",
  },
  ai_scope_guardrails: [],
  brand_testimonials: [],
  brand_accolades: ["Entrepreneur Franchise 500"],
  same_as_urls: null,
  additional_relevant_content: [],
};

function fakeLlm(json: string): AIModelProvider {
  return {
    name: "fake-e2e-llm",
    languageModel() {
      return new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: "stop" as const, raw: undefined },
          usage: {
            inputTokens: { total: 900, noCache: 700, cacheRead: 200, cacheWrite: 0 },
            outputTokens: { total: 350, text: 350, reasoning: 0 },
          },
          content: [{ type: "text" as const, text: json }],
          warnings: [],
        }),
      });
    },
  };
}

function fixturePage(url: string): ScrapedPage {
  return {
    url,
    finalUrl: url,
    title: "PowerFit — Franquicias de gimnasios boutique",
    metaDescription: "Abre tu gimnasio PowerFit",
    ogImage: null,
    headings: ["Por qué PowerFit", "Preguntas frecuentes", "Own a Franchise"],
    text: "PowerFit es la franquicia de gimnasios boutique con inversión inicial desde $180,000 USD y 120 unidades operando. Soporte integral de apertura y territorios disponibles en todo México.",
    links: [{ href: `${new URL(url).origin}/franchise`, text: "Own a Franchise" }],
    hasPasswordInput: false,
    scriptCount: 1,
    logoCandidate: { kind: "img", dataUri: "data:image/png;base64,iVBORw0KGgo=" },
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

test("@COV_BEX_001.1 @extraction @ai — una URL de marca válida produce el payload completo y se almacena", async () => {
  const url = `https://e2e-${randomUUID().slice(0, 8)}.brand.test/`;
  const scrape: ScrapeProvider = {
    name: "fake-e2e-scrape",
    async scrapePage(u) {
      return fixturePage(u);
    },
  };

  const result = await runBrandExtraction({
    url,
    scrapeProvider: scrape,
    llmProvider: fakeLlm(JSON.stringify(FULL_OUTPUT)),
    scrapeOverrides: { retries: 0, retryBaseMs: 1 },
  });

  expect(result.status).toBe("completed");
  expect(result.degradationFlag).toBe(false);

  const { rows } = await withMigrator((c) =>
    c.query(
      `SELECT identity_tokens, content_signals, vertical_category, per_field_status,
              raw_content, extracted_at
       FROM brand_extractions WHERE id = $1`,
      [result.extractionId],
    ),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].identity_tokens.primary_color_hex).toBe("#0055a5");
  expect(rows[0].content_signals.faq_topic_areas).toHaveLength(3);
  expect(rows[0].vertical_category).toBe("fitness_wellness");
  expect(rows[0].per_field_status.primary_color).toBe("pass");
  expect(rows[0].raw_content.pages.length, "contenido crudo almacenado").toBeGreaterThan(0);
  expect(rows[0].extracted_at).not.toBeNull();
});

test("@COV_BEX_001.2 @extraction @ai — un sitio inalcanzable degrada con gracia (sin crash) y deja el aviso", async () => {
  // Scraper REAL (LocalScrapeProvider por default): el host no resuelve →
  // reintentos → clase persistent_transient_error → health record. Sin throw.
  const url = `https://unreachable-${randomUUID().slice(0, 8)}.invalid/`;
  const result = await runBrandExtraction({
    url,
    llmProvider: fakeLlm(JSON.stringify(FULL_OUTPUT)),
    scrapeOverrides: { retries: 1, retryBaseMs: 1, pageTimeoutMs: 5000 },
  });

  expect(result.status).toBe("failed");
  expect(result.degradationFlag).toBe(true);
  expect(result.failureClass).toBe("persistent_transient_error");

  const { rows } = await withMigrator((c) =>
    c.query(
      `SELECT failure_class, url_attempts, resolved_at
       FROM brand_extraction_health_records WHERE brand_id = $1`,
      [result.brandId],
    ),
  );
  expect(rows, "el aviso de degradación queda en la cola de admin").toHaveLength(1);
  expect(rows[0].failure_class).toBe("persistent_transient_error");
  expect(rows[0].url_attempts[0].url).toBe(url);
  expect(rows[0].resolved_at).toBeNull();
});
