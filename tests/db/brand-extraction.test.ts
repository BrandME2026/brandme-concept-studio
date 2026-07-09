import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { resetAndMigrate, createTenant, asTenant } from "./harness";
import { withMigrator } from "./db-util";
import type { AIModelProvider } from "../../src/lib/ai/model-provider";
import { runBrandExtraction, reextractFromStored } from "../../src/lib/extraction/pipeline";
import { getActiveExtraction } from "../../src/lib/extraction/store";
import { withSystemContext } from "../../src/lib/db/tenant-context";
import {
  ScrapeTerminalError,
  type ScrapedPage,
  type ScrapeProvider,
} from "../../src/lib/extraction/types";

/**
 * WO-13 / COV_BEX_001 (nivel integración): el pipeline REAL del Agente 02
 * contra la DB REAL con transportes fake — scrape provider en memoria y
 * MockLanguageModelV3 vía EP-05 (cero red, cero tokens). Verifica persistencia
 * del payload, degradación, health records, re-extracción sin re-scrape,
 * corridas concurrentes independientes y RLS.
 */

process.env.CONFIG_CACHE_TTL_MS = "150";

function fixturePage(url: string, overrides: Partial<ScrapedPage> = {}): ScrapedPage {
  return {
    url,
    finalUrl: url,
    title: "Tacos La Marca — Franquicias",
    metaDescription: "La franquicia de tacos líder",
    ogImage: null,
    headings: ["Nuestra historia", "Preguntas frecuentes"],
    text: "Tacos La Marca ofrece franquicias con soporte integral, inversión inicial desde $250,000 USD y regalías del 6%. Preguntas frecuentes sobre inversión, soporte y territorios.",
    links: [
      { href: `${new URL(url).origin}/franquicias`, text: "Own a Franchise" },
      { href: `${new URL(url).origin}/faq`, text: "FAQ" },
    ],
    hasPasswordInput: false,
    scriptCount: 2,
    logoCandidate: { kind: "img", dataUri: "data:image/png;base64,iVBORw0KGgo=" },
    ...overrides,
  };
}

/** Provider fake: sirve fixtures por URL y registra las llamadas. */
function makeScrapeProvider(pages: Record<string, ScrapedPage | Error>, calls: string[] = []) {
  const provider: ScrapeProvider & { calls: string[] } = {
    name: "fake-scrape",
    calls,
    async scrapePage(url) {
      calls.push(url);
      const found = pages[url];
      if (!found) throw new ScrapeTerminalError("js_spa_no_content", `sin fixture para ${url}`);
      if (found instanceof Error) throw found;
      return found;
    },
  };
  return provider;
}

const GOOD_OUTPUT = {
  identity: {
    primary_color_hex: "#c8102e",
    secondary_palette: ["#ffffff", "#1a1a1a"],
    typography_classification: "geometric sans-serif",
    header_style: "full-width-hero",
  },
  content: {
    brand_voice_keywords: ["tacos", "familia", "sabor", "auténtico", "soporte", "líder", "calidad", "tradición", "crecimiento", "inversión"],
    faq_topic_areas: ["inversión inicial", "soporte al franquiciatario", "territorios"],
    brand_voice_descriptor: { tone_attributes: ["cercano", "confiable"], communication_style: ["directo"] },
    avoid_list: [],
    markets_and_services: { customer_segments: ["familias"], geographic_markets: ["México"], offerings: ["comida rápida mexicana"] },
    google_keyword_signals: ["franquicia tacos", "abrir franquicia", "inversión franquicia", "tacos méxico", "franquicia rentable", "negocio comida", "franquicia qsr", "tacos la marca", "cuánto cuesta franquicia", "franquicias mexicanas"],
  },
  vertical: { category: "qsr_food_beverage", confidence: "high", signals: ["menú de tacos", "restaurante"] },
  fdd: {
    investment_range_min: { value: 250000, source_url: "https://marca-e2e.test/franquicias", confidence: "explicit" },
    investment_range_max: { value: null, source_url: null, confidence: "absent" },
    avg_unit_volume: { value: 900000, source_url: null, confidence: "inferred" },
    royalty_rate: { value: "6%", source_url: "https://marca-e2e.test/franquicias", confidence: "explicit" },
    total_unit_count: { value: null, source_url: null, confidence: "absent" },
  },
  intake_protocol_coverage: {
    investment_breakdown: "present", ideal_franchisee_profile: "partial", opening_timeline: "absent",
    unit_economics: "partial", support_model: "present", franchisee_health: "absent",
    territory_growth: "partial", success_failure_patterns: "absent",
    competitive_differentiation: "present", ai_scope_boundaries: "absent",
  },
  ai_scope_guardrails: ["No prometer retornos garantizados"],
  brand_testimonials: [{ quote: "La mejor decisión de mi vida", attribution: "Juan P., CDMX", source_url: "https://marca-e2e.test/franquicias" }],
  brand_accolades: ["Franchise 500 2026"],
  same_as_urls: ["https://es.wikipedia.org/wiki/Tacos_La_Marca"],
  additional_relevant_content: [],
};

const DEGRADED_OUTPUT = {
  ...GOOD_OUTPUT,
  identity: { primary_color_hex: null, secondary_palette: null, typography_classification: null, header_style: "unknown" },
  content: { ...GOOD_OUTPUT.content, brand_voice_keywords: ["tacos", "familia", "sabor", "auténtico", "soporte"], faq_topic_areas: ["inversión"] },
};

/** Provider LLM fake (EP-05): responde el JSON dado; registra invocaciones. */
function makeLlmProvider(responses: string[], calls: { count: number } = { count: 0 }): AIModelProvider {
  return {
    name: "fake-llm",
    languageModel() {
      return new MockLanguageModelV3({
        doGenerate: async () => {
          const text = responses[Math.min(calls.count, responses.length - 1)];
          calls.count++;
          return {
            finishReason: { unified: "stop" as const, raw: undefined },
            usage: {
              inputTokens: { total: 1000, noCache: 800, cacheRead: 200, cacheWrite: 0 },
              outputTokens: { total: 400, text: 400, reasoning: 0 },
            },
            content: [{ type: "text" as const, text }],
            warnings: [],
          };
        },
      });
    },
  };
}

async function extractionRow(id: string) {
  const { rows } = await withMigrator((c) =>
    c.query(
      `SELECT status, degradation_flag, identity_tokens, content_signals, vertical_category,
              vertical_confidence, vertical_low_confidence_guess, fdd_financial_data,
              per_field_status, failure_class, raw_content, scrape_urls
       FROM brand_extractions WHERE id = $1`,
      [id],
    ),
  );
  return rows[0];
}

async function healthRecords(brandId: string) {
  const { rows } = await withMigrator((c) =>
    c.query(
      `SELECT failure_class, url_attempts, resolved_at, affected_consultant_ids
       FROM brand_extraction_health_records WHERE brand_id = $1`,
      [brandId],
    ),
  );
  return rows;
}

const BASE_OPTS = { scrapeOverrides: { retries: 0, retryBaseMs: 1 } };

beforeAll(async () => {
  await resetAndMigrate();
});

describe("corrida completa (COV_BEX_001.1)", () => {
  it("persiste el payload completo y queda como extracción activa", async () => {
    const t = await createTenant("bex-full");
    const url = `https://full-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    const scrape = makeScrapeProvider({
      [url]: fixturePage(url),
      [`${new URL(url).origin}/franquicias`]: fixturePage(`${new URL(url).origin}/franquicias`),
      [`${new URL(url).origin}/faq`]: fixturePage(`${new URL(url).origin}/faq`),
    });

    const result = await runBrandExtraction({
      url,
      consultantId: t.consultantId,
      scrapeProvider: scrape,
      llmProvider: makeLlmProvider([JSON.stringify(GOOD_OUTPUT)]),
      ...BASE_OPTS,
    });

    expect(result.status).toBe("completed");
    expect(result.degradationFlag).toBe(false);

    const row = await extractionRow(result.extractionId);
    expect(row.status).toBe("completed");
    expect(row.identity_tokens.primary_color_hex).toBe("#c8102e");
    expect(row.identity_tokens.logo_url).toContain("data:image/png");
    expect(row.content_signals.brand_voice_keywords).toHaveLength(10);
    expect(row.vertical_category).toBe("qsr_food_beverage");
    expect(row.scrape_urls.length).toBeGreaterThanOrEqual(2);
    expect(row.raw_content.pages.length).toBeGreaterThanOrEqual(2);

    // FDD (AC-BEX-008.5): explicit entra con fuente; inferred queda fuera y flaggeado.
    expect(row.fdd_financial_data.investment_range_min.value).toBe(250000);
    expect(row.fdd_financial_data.avg_unit_volume).toBeUndefined();
    expect(row.per_field_status.fdd_inferred_excluded).toContain("avg_unit_volume");

    const active = await withSystemContext("test-active", () =>
      getActiveExtraction(result.brandId),
    );
    expect(active?.id).toBe(result.extractionId);

    expect(await healthRecords(result.brandId)).toHaveLength(0);
  });

  it("vertical con confianza low se publica como 'other' y el intento queda aparte (AC-BEX-007.3)", async () => {
    const url = `https://low-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    const output = { ...GOOD_OUTPUT, vertical: { category: "retail", confidence: "low", signals: [] } };
    const result = await runBrandExtraction({
      url,
      scrapeProvider: makeScrapeProvider({ [url]: fixturePage(url, { links: [] }) }),
      llmProvider: makeLlmProvider([JSON.stringify(output)]),
      ...BASE_OPTS,
    });
    const row = await extractionRow(result.extractionId);
    expect(row.vertical_category).toBe("other");
    expect(row.vertical_confidence).toBe("low");
    expect(row.vertical_low_confidence_guess).toBe("retail");
  });
});

describe("degradación (COV_BEX_001.2 / AC-BEX-005.1)", () => {
  it("<3 señales → degraded + health record; NO es la extracción activa", async () => {
    const t = await createTenant("bex-deg");
    const url = `https://deg-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    const result = await runBrandExtraction({
      url,
      consultantId: t.consultantId,
      scrapeProvider: makeScrapeProvider({ [url]: fixturePage(url, { links: [], logoCandidate: null }) }),
      llmProvider: makeLlmProvider([JSON.stringify(DEGRADED_OUTPUT)]),
      ...BASE_OPTS,
    });

    expect(result.status).toBe("degraded");
    const row = await extractionRow(result.extractionId);
    expect(row.degradation_flag).toBe(true);
    expect(row.failure_class).toBe("quality_degradation");
    // Payload parcial: los tokens fallidos van null, keywords sobreviven (AC-BEX-005.8).
    expect(row.identity_tokens.primary_color_hex).toBeNull();
    expect(row.content_signals.brand_voice_keywords).toHaveLength(5);

    const records = await healthRecords(result.brandId);
    expect(records).toHaveLength(1);
    expect(records[0].failure_class).toBe("quality_degradation");
    expect(records[0].affected_consultant_ids).toContain(t.consultantId);
    expect(records[0].resolved_at).toBeNull();

    const active = await withSystemContext("test-active", () =>
      getActiveExtraction(result.brandId),
    );
    expect(active).toBeNull();
  });

  it("una corrida posterior exitosa RESUELVE el health record activo", async () => {
    const url = `https://rec-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    const scrape = makeScrapeProvider({ [url]: fixturePage(url, { links: [] }) });
    const degraded = await runBrandExtraction({
      url,
      scrapeProvider: scrape,
      llmProvider: makeLlmProvider([JSON.stringify(DEGRADED_OUTPUT)]),
      ...BASE_OPTS,
    });
    expect(degraded.status).toBe("degraded");

    const ok = await runBrandExtraction({
      url,
      scrapeProvider: scrape,
      llmProvider: makeLlmProvider([JSON.stringify(GOOD_OUTPUT)]),
      ...BASE_OPTS,
    });
    expect(ok.status).toBe("completed");
    const records = await healthRecords(ok.brandId);
    expect(records).toHaveLength(1);
    expect(records[0].resolved_at).not.toBeNull();
  });
});

describe("fallos de scrape (AC-BEX-001.3/.6)", () => {
  it("fallo terminal de homepage → failed con clase + health record", async () => {
    const t = await createTenant("bex-fail");
    const url = `https://fail-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    const result = await runBrandExtraction({
      url,
      consultantId: t.consultantId,
      scrapeProvider: makeScrapeProvider({
        [url]: new ScrapeTerminalError("paywall_or_login_wall", "login wall"),
      }),
      llmProvider: makeLlmProvider([JSON.stringify(GOOD_OUTPUT)]),
      ...BASE_OPTS,
    });
    expect(result.status).toBe("failed");
    expect(result.failureClass).toBe("paywall_or_login_wall");
    const records = await healthRecords(result.brandId);
    expect(records).toHaveLength(1);
    expect(records[0].url_attempts[0].url).toBe(url);
  });

  it("backup URL se intenta automáticamente antes de degradar (AC-BEX-001.6)", async () => {
    const primary = `https://prim-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    const backup = `https://back-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    const scrape = makeScrapeProvider({
      [primary]: new ScrapeTerminalError("js_spa_no_content", "spa vacía"),
      [backup]: fixturePage(backup, { links: [] }),
    });
    const result = await runBrandExtraction({
      url: primary,
      backupUrl: backup,
      scrapeProvider: scrape,
      llmProvider: makeLlmProvider([JSON.stringify(GOOD_OUTPUT)]),
      ...BASE_OPTS,
    });
    expect(result.status).toBe("completed");
    expect(scrape.calls).toEqual([primary, backup]);
  });

  it("errores transitorios reintentan con backoff y luego triunfan (AC-BEX-001.2)", async () => {
    const url = `https://retry-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    let attempts = 0;
    const delays: number[] = [];
    const provider: ScrapeProvider = {
      name: "flaky",
      async scrapePage(u) {
        attempts++;
        if (attempts <= 2) throw Object.assign(new Error("timeout navegando"), { transient: true });
        return fixturePage(u, { links: [] });
      },
    };
    const result = await runBrandExtraction({
      url,
      scrapeProvider: provider,
      llmProvider: makeLlmProvider([JSON.stringify(GOOD_OUTPUT)]),
      scrapeOverrides: {
        retries: 3,
        retryBaseMs: 100,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    });
    expect(result.status).toBe("completed");
    expect(attempts).toBe(3);
    expect(delays).toEqual([100, 200]); // base × 2^n
  });
});

describe("pass LLM (AC-BEX-013)", () => {
  it("respuesta malformada reintenta sobre el MISMO contenido y luego triunfa", async () => {
    const url = `https://mal-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    const calls = { count: 0 };
    const scrape = makeScrapeProvider({ [url]: fixturePage(url, { links: [] }) });
    const result = await runBrandExtraction({
      url,
      scrapeProvider: scrape,
      llmProvider: makeLlmProvider(["esto no es JSON {", JSON.stringify(GOOD_OUTPUT)], calls),
      ...BASE_OPTS,
    });
    expect(result.status).toBe("completed");
    expect(calls.count).toBe(2);
    expect(scrape.calls).toHaveLength(1); // JAMÁS re-scrape por fallo LLM (ADR-004)
  });

  it("retries agotados → failed llm_malformed_response + health record", async () => {
    const url = `https://llmfail-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    const result = await runBrandExtraction({
      url,
      scrapeProvider: makeScrapeProvider({ [url]: fixturePage(url, { links: [] }) }),
      llmProvider: makeLlmProvider(["basura", "basura", "basura"]),
      ...BASE_OPTS,
    });
    expect(result.status).toBe("failed");
    expect(result.failureClass).toBe("llm_malformed_response");
    expect((await healthRecords(result.brandId))[0].failure_class).toBe("llm_malformed_response");
  });

  it("re-extracción de admin reusa raw_content SIN invocar el scrape provider (AC-BEX-013.3)", async () => {
    const url = `https://reex-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    const scrape = makeScrapeProvider({ [url]: fixturePage(url, { links: [] }) });
    const failed = await runBrandExtraction({
      url,
      scrapeProvider: scrape,
      llmProvider: makeLlmProvider(["basura"]),
      scrapeOverrides: BASE_OPTS.scrapeOverrides,
    });
    expect(failed.status).toBe("failed");
    const scrapeCallsBefore = scrape.calls.length;

    const retried = await reextractFromStored(failed.extractionId, {
      llmProvider: makeLlmProvider([JSON.stringify(GOOD_OUTPUT)]),
    });
    expect(retried.status).toBe("completed");
    expect(retried.extractionId).not.toBe(failed.extractionId); // corrida nueva, la previa se conserva (AC-BEX-006.1)
    expect(scrape.calls.length).toBe(scrapeCallsBefore);

    const prior = await extractionRow(failed.extractionId);
    expect(prior.status).toBe("failed"); // el registro anterior queda para auditoría
  });
});

describe("concurrencia e aislamiento", () => {
  it("dos consultants extraen el MISMO brand simultáneamente: corridas independientes (AC-BEX-001.7)", async () => {
    const a = await createTenant("bex-conc-a");
    const b = await createTenant("bex-conc-b");
    const url = `https://conc-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    const scrape = () => makeScrapeProvider({ [url]: fixturePage(url, { links: [] }) });

    const [ra, rb] = await Promise.all([
      runBrandExtraction({
        url,
        consultantId: a.consultantId,
        scrapeProvider: scrape(),
        llmProvider: makeLlmProvider([JSON.stringify(GOOD_OUTPUT)]),
        ...BASE_OPTS,
      }),
      runBrandExtraction({
        url,
        consultantId: b.consultantId,
        scrapeProvider: scrape(),
        llmProvider: makeLlmProvider([JSON.stringify(GOOD_OUTPUT)]),
        ...BASE_OPTS,
      }),
    ]);

    expect(ra.status).toBe("completed");
    expect(rb.status).toBe("completed");
    expect(ra.brandId).toBe(rb.brandId); // mismo brand (host único)
    expect(ra.extractionId).not.toBe(rb.extractionId); // corridas propias
  });

  it("RLS: un tenant ve SOLO sus corridas", async () => {
    const a = await createTenant("bex-rls-a");
    const b = await createTenant("bex-rls-b");
    const urlA = `https://rlsa-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    const urlB = `https://rlsb-${randomUUID().slice(0, 6)}.marca-e2e.test/`;
    for (const [t, url] of [
      [a, urlA],
      [b, urlB],
    ] as const) {
      await runBrandExtraction({
        url,
        consultantId: t.consultantId,
        scrapeProvider: makeScrapeProvider({ [url]: fixturePage(url, { links: [] }) }),
        llmProvider: makeLlmProvider([JSON.stringify(GOOD_OUTPUT)]),
        ...BASE_OPTS,
      });
    }

    const seenByA = await asTenant(a, "pooled", (h) =>
      h.query<{ id: string }>(`SELECT id FROM brand_extractions`),
    );
    expect(seenByA.rows).toHaveLength(1);

    const healthSeenByA = await asTenant(a, "pooled", (h) =>
      h.query(`SELECT id FROM brand_extraction_health_records`),
    );
    expect(healthSeenByA.rows, "la cola de admin es solo system scope").toHaveLength(0);
  });
});
