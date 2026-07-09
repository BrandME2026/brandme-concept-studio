import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { resetAndMigrate, createTenant, asTenant, type TenantFixture } from "./harness";
import { withMigrator } from "./db-util";
import type { AIModelProvider } from "../../src/lib/ai/model-provider";
import { invalidateConfigCache } from "../../src/lib/config/config-store";
import { withSystemContext } from "../../src/lib/db/tenant-context";
import { generateBrandMePage } from "../../src/lib/brandmepage/generation-pipeline";
import {
  applyApprovalFlagDisable,
  approvePage,
  requestChanges,
} from "../../src/lib/brandmepage/lifecycle";
import {
  approveFlaggedOverride,
  restoreOriginal,
  saveContentOverride,
} from "../../src/lib/brandmepage/overrides";
import { drainRerenders, enqueueRerender } from "../../src/lib/brandmepage/rerender-scheduler";
import { getRenderableBySlugs } from "../../src/lib/brandmepage/store";
import { registerBrandMePageSubscribers } from "../../src/lib/brandmepage/subscribe";
import { runBrandExtraction } from "../../src/lib/extraction/pipeline";
import type { ScrapedPage, ScrapeProvider } from "../../src/lib/extraction/types";

/**
 * WO-15 / COV_BMP_001 (nivel integración): el pipeline REAL del Agente 04
 * contra la DB REAL con LLM fake (EP-05). Lifecycle single-writer, approval
 * gate configurable, overrides + quality filter, re-render, compliance,
 * template resolver, RLS y el wiring de eventos con el Agente 02 REAL.
 */

process.env.CONFIG_CACHE_TTL_MS = "150";

const GOOD_COPY = {
  hero_headline: "Construye tu negocio con una marca probada",
  brand_overview:
    "Una marca con historia y soporte real para quienes quieren emprender con respaldo. Su modelo operativo está documentado y acompañado en cada etapa del camino.",
  value_proposition: ["Modelo probado", "Acompañamiento integral", "Mercados en crecimiento"],
  faqs: [
    { question: "¿Cuál es la inversión inicial?", answer: "Depende de la divulgación oficial de la marca y tu mercado." },
    { question: "¿Necesito experiencia previa?", answer: "No es requisito: el entrenamiento cubre la operación completa." },
    { question: "¿Cuánto tarda abrir?", answer: "El calendario varía según local y permisos municipales." },
    { question: "¿Qué soporte continuo hay?", answer: "Campo, tecnología y marketing según el plan de la marca." },
  ],
  meta_description:
    "Conoce esta oportunidad de franquicia con un consultor experto: inversión, soporte y territorios explicados de forma clara y sin letra chica.",
};

function fakeLlm(responses: string[], calls = { count: 0 }): AIModelProvider {
  return {
    name: "fake-llm-04",
    languageModel() {
      return new MockLanguageModelV3({
        doGenerate: async () => {
          const text = responses[Math.min(calls.count, responses.length - 1)];
          calls.count++;
          return {
            finishReason: { unified: "stop" as const, raw: undefined },
            usage: {
              inputTokens: { total: 500, noCache: 400, cacheRead: 100, cacheWrite: 0 },
              outputTokens: { total: 300, text: 300, reasoning: 0 },
            },
            content: [{ type: "text" as const, text }],
            warnings: [],
          };
        },
      });
    },
  };
}

const RAW_SOURCE_TEXT =
  "Nuestra franquicia insignia ofrece el mejor programa de soporte continuo del sector con entrenadores certificados en cada región del país.";

/** Siembra brand + extracción COMPLETED (base del Agente 04) vía SQL. */
async function seedExtractedBrand(consultantId: string | null = null): Promise<string> {
  return withMigrator(async (c) => {
    const host = `brand-${randomUUID().slice(0, 8)}.test`;
    const brand = await c.query<{ id: string }>(
      `INSERT INTO brands (url, host, name) VALUES ($1, $2, $3) RETURNING id`,
      [`https://${host}/`, host, `Marca ${host.slice(6, 10)}`],
    );
    await c.query(
      `INSERT INTO brand_extractions
         (brand_id, triggered_by_consultant_id, status, identity_tokens, content_signals,
          vertical_category, same_as_urls, raw_content, extracted_at)
       VALUES ($1, $2, 'completed', $3::jsonb, $4::jsonb, 'fitness_wellness', $5::jsonb, $6::jsonb, now())`,
      [
        brand.rows[0].id,
        consultantId,
        JSON.stringify({
          logo_url: "data:image/png;base64,iVBORw0KGgo=",
          primary_color_hex: "#0055a5",
          secondary_palette: ["#ffffff"],
          typography_classification: "sans",
          header_style: "centered-hero",
        }),
        JSON.stringify({
          brand_voice_keywords: ["fitness", "comunidad", "energía"],
          faq_topic_areas: ["inversión", "soporte", "territorios"],
          brand_voice_descriptor: { tone_attributes: ["motivador"], communication_style: ["directo"] },
          avoid_list: [],
          markets_and_services: { customer_segments: ["adultos"], geographic_markets: ["MX"], offerings: ["gimnasios"] },
          google_keyword_signals: ["franquicia gimnasio"],
        }),
        JSON.stringify(["https://es.wikipedia.org/wiki/Marca"]),
        JSON.stringify({ pages: [{ url: "x", title: "t", metaDescription: null, headings: [], text: RAW_SOURCE_TEXT }], logo_data_uri: null, franchise_dev_url: null, truncated: false }),
      ],
    );
    return brand.rows[0].id;
  });
}

async function pageRow(pageId: string) {
  const { rows } = await withMigrator((c) =>
    c.query(
      `SELECT p.state, p.published_at, p.consultant_slug, p.brand_slug,
              c.compliance_verified_at, c.source, c.generated_copy
       FROM brandme_pages p LEFT JOIN brandme_page_configs c ON c.id = p.config_id
       WHERE p.id = $1`,
      [pageId],
    ),
  );
  return rows[0];
}

async function setFlag(value: string | null) {
  await withMigrator((c) =>
    c.query(
      `UPDATE platform_config SET current_value = $1::jsonb
       WHERE feature_area = 'brandmepage' AND config_key = 'approval_required'`,
      [value],
    ),
  );
  invalidateConfigCache();
}

let tenant: TenantFixture;

beforeAll(async () => {
  await resetAndMigrate();
});

beforeEach(async () => {
  tenant = await createTenant("bmp");
  await setFlag(null); // default: true (gate activo)
});

describe("generación (COV_BMP_001.1)", () => {
  it("produce draft con config inmutable, compliance verificado, slugs y preview", async () => {
    const brandId = await seedExtractedBrand(tenant.consultantId);
    const result = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });

    expect(result.state).toBe("draft");
    expect(result.previewToken).toBeTruthy();
    expect(result.consultantSlug).toMatch(/^[a-z0-9-]+$/);

    const row = await pageRow(result.pageId);
    expect(row.state).toBe("draft");
    expect(row.compliance_verified_at).not.toBeNull();
    expect(row.source).toBe("agent04_dynamic");
    expect(row.generated_copy.hero_headline).toBe(GOOD_COPY.hero_headline);
  });

  it("publish con gate activo → pending_approval; approve → published (AC-BPG-015.1/.3)", async () => {
    const brandId = await seedExtractedBrand(tenant.consultantId);
    const result = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId,
      publish: true,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    expect(result.state).toBe("pending_approval");

    expect(await approvePage(result.pageId)).toBe(true);
    const row = await pageRow(result.pageId);
    expect(row.state).toBe("published");
    expect(row.published_at).not.toBeNull();
  });

  it("gate desactivado → publica directo (AC-BPG-015.6a)", async () => {
    await setFlag("false");
    const brandId = await seedExtractedBrand(tenant.consultantId);
    const result = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId,
      publish: true,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    expect(result.state).toBe("published");
  });

  it("request changes devuelve a draft (AC-BPG-015.4)", async () => {
    const brandId = await seedExtractedBrand(tenant.consultantId);
    const { pageId } = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId,
      publish: true,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    expect(await requestChanges(pageId)).toBe(true);
    expect((await pageRow(pageId)).state).toBe("draft");
  });

  it("deshabilitar el flag auto-aprueba TODO lo pendiente (AC-BPG-015.6b)", async () => {
    const pending: string[] = [];
    for (let i = 0; i < 2; i++) {
      const t = await createTenant(`bmp-flag-${i}`);
      const brandId = await seedExtractedBrand(t.consultantId);
      const r = await generateBrandMePage({
        consultantId: t.consultantId,
        brandId,
        publish: true,
        llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
        retryBaseMs: 1,
      });
      expect(r.state).toBe("pending_approval");
      pending.push(r.pageId);
    }
    await setFlag("false");
    const published = await applyApprovalFlagDisable();
    expect(published).toBeGreaterThanOrEqual(2);
    for (const id of pending) expect((await pageRow(id)).state).toBe("published");
  });

  it("el compliance reintenta cuando el copy trae ≥6 palabras verbatim del fuente (AC-BEX-004.2)", async () => {
    const brandId = await seedExtractedBrand(tenant.consultantId);
    const plagiarized = {
      ...GOOD_COPY,
      brand_overview: `Como dicen ellos: nuestra franquicia insignia ofrece el mejor programa de soporte continuo que existe. ${GOOD_COPY.brand_overview}`,
    };
    const calls = { count: 0 };
    const result = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId,
      llmProvider: fakeLlm([JSON.stringify(plagiarized), JSON.stringify(GOOD_COPY)], calls),
      retryBaseMs: 1,
    });
    expect(calls.count).toBe(2);
    const row = await pageRow(result.pageId);
    expect(row.generated_copy.brand_overview).toBe(GOOD_COPY.brand_overview);
    expect(row.compliance_verified_at).not.toBeNull();
  });

  it("template admin ACTIVO pisa la extracción dinámica (AC-BPG-007.1)", async () => {
    const brandId = await seedExtractedBrand(tenant.consultantId);
    await withMigrator((c) =>
      c.query(
        `INSERT INTO brand_templates (brand_id, is_active, identity_tokens, content_signals, activated_at)
         VALUES ($1, true, $2::jsonb, $3::jsonb, now())`,
        [
          brandId,
          JSON.stringify({ logo_url: null, primary_color_hex: "#ff0000", secondary_palette: null, typography_classification: "serif", header_style: "minimal-nav" }),
          JSON.stringify({ brand_voice_keywords: ["template"], faq_topic_areas: ["a"], brand_voice_descriptor: { tone_attributes: ["formal"], communication_style: ["sobrio"] }, avoid_list: [], markets_and_services: { customer_segments: [], geographic_markets: [], offerings: [] }, google_keyword_signals: [] }),
        ],
      ),
    );
    const result = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    const row = await pageRow(result.pageId);
    expect(row.source).toBe("brand_template");
  });

  it("wiring real: el pipeline del Agente 02 dispara la generación (AC-BPG-001.1)", async () => {
    registerBrandMePageSubscribers({
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    const url = `https://wired-${randomUUID().slice(0, 6)}.test/`;
    const scrape: ScrapeProvider = {
      name: "fake",
      async scrapePage(u): Promise<ScrapedPage> {
        return {
          url: u, finalUrl: u, title: "t", metaDescription: null, ogImage: null,
          headings: [], text: RAW_SOURCE_TEXT, links: [], hasPasswordInput: false,
          scriptCount: 1, logoCandidate: null,
        };
      },
    };
    // El fake sirve AMBOS agentes: la extracción del 02 y el copy del 04.
    const A02_OUTPUT = {
      identity: { primary_color_hex: "#112233", secondary_palette: ["#ffffff"], typography_classification: "sans", header_style: "minimal-nav" },
      content: { brand_voice_keywords: ["a","b","c","d","e","f","g","h","i","j"], faq_topic_areas: ["x","y","z"], brand_voice_descriptor: { tone_attributes: ["t1","t2"], communication_style: ["c1"] }, avoid_list: [], markets_and_services: { customer_segments: ["s"], geographic_markets: ["g"], offerings: ["o"] }, google_keyword_signals: ["k1","k2","k3","k4","k5","k6","k7","k8","k9","k10"] },
      vertical: { category: "fitness_wellness", confidence: "high", signals: ["gym"] },
      fdd: { investment_range_min: { value: null, source_url: null, confidence: "absent" }, investment_range_max: { value: null, source_url: null, confidence: "absent" }, avg_unit_volume: { value: null, source_url: null, confidence: "absent" }, royalty_rate: { value: null, source_url: null, confidence: "absent" }, total_unit_count: { value: null, source_url: null, confidence: "absent" } },
      intake_protocol_coverage: { investment_breakdown: "absent", ideal_franchisee_profile: "absent", opening_timeline: "absent", unit_economics: "absent", support_model: "absent", franchisee_health: "absent", territory_growth: "absent", success_failure_patterns: "absent", competitive_differentiation: "absent", ai_scope_boundaries: "absent" },
      ai_scope_guardrails: [], brand_testimonials: [], brand_accolades: [], same_as_urls: null, additional_relevant_content: [],
    };
    const extraction = await runBrandExtraction({
      url,
      consultantId: tenant.consultantId,
      scrapeProvider: scrape,
      llmProvider: fakeLlm([JSON.stringify(A02_OUTPUT), JSON.stringify(GOOD_COPY)]),
      scrapeOverrides: { retries: 0, retryBaseMs: 1 },
    });
    expect(extraction.status).toBe("completed");

    // El suscriptor corre fire-and-forget: esperar a que la página exista.
    let found = 0;
    for (let i = 0; i < 50 && !found; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const { rows } = await withMigrator((c) =>
        c.query<{ n: string }>(
          `SELECT count(*) AS n FROM brandme_pages WHERE brand_id = $1`,
          [extraction.brandId],
        ),
      );
      found = Number(rows[0].n);
    }
    expect(found, "la extracción completada generó la página").toBe(1);
  });
});

describe("single-writer y RLS", () => {
  it("UPDATE directo de state → excepción del trigger", async () => {
    const brandId = await seedExtractedBrand(tenant.consultantId);
    const { pageId } = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    await expect(
      withMigrator((c) =>
        c.query(`UPDATE brandme_pages SET state = 'published' WHERE id = $1`, [pageId]),
      ),
    ).rejects.toThrow(/ApprovalGateway/);
  });

  it("un tenant NO puede escribir su propia página (solo system escribe — review R1)", async () => {
    const brandId = await seedExtractedBrand(tenant.consultantId);
    const { pageId } = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    const updated = await asTenant(tenant, "pooled", (h) =>
      h.query(`UPDATE brandme_pages SET brand_slug = 'hackeado' WHERE id = $1`, [pageId]),
    );
    expect(updated.rowCount, "RLS sin policy de UPDATE tenant: 0 filas").toBe(0);
    expect((await pageRow(pageId)).brand_slug).not.toBe("hackeado");
  });

  it("un tenant ve SOLO sus páginas", async () => {
    const other = await createTenant("bmp-rls-b");
    for (const t of [tenant, other]) {
      const brandId = await seedExtractedBrand(t.consultantId);
      await generateBrandMePage({
        consultantId: t.consultantId,
        brandId,
        llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
        retryBaseMs: 1,
      });
    }
    const seen = await asTenant(tenant, "pooled", (h) =>
      h.query(`SELECT id FROM brandme_pages`),
    );
    expect(seen.rows).toHaveLength(1);
  });
});

describe("overrides + quality filter (REQ-BPG-014/016)", () => {
  async function publishedPage() {
    await setFlag("false");
    const brandId = await seedExtractedBrand(tenant.consultantId);
    const result = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId,
      publish: true,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    return result;
  }

  it("edit limpio → live, re-render, y el render lo aplica", async () => {
    const page = await publishedPage();
    const saved = await saveContentOverride({
      consultantId: tenant.consultantId,
      pageId: page.pageId,
      fieldKey: "hero_headline",
      value: "Mi titular personalizado",
    });
    expect(saved.status).toBe("live");
    await drainRerenders();
    expect((await pageRow(page.pageId)).state).toBe("published");

    const renderable = await withSystemContext("test-render", () =>
      getRenderableBySlugs(page.consultantSlug, page.brandSlug),
    );
    expect(renderable?.overrides.hero_headline).toBe("Mi titular personalizado");
  });

  it("edit con término vetado → pending_review y la página viva NO cambia (AC-BPG-016.3)", async () => {
    const page = await publishedPage();
    const saved = await saveContentOverride({
      consultantId: tenant.consultantId,
      pageId: page.pageId,
      fieldKey: "brand_overview",
      value: "Esto es dinero garantizado sin riesgo alguno",
    });
    expect(saved.status).toBe("pending_review");
    expect(saved.status === "pending_review" && saved.flaggedTerms.length).toBeGreaterThan(0);

    const renderable = await withSystemContext("test-render", () =>
      getRenderableBySlugs(page.consultantSlug, page.brandSlug),
    );
    expect(renderable?.overrides.brand_overview, "el edit retenido no está live").toBeUndefined();
  });

  it("aprobación admin del edit retenido → live (AC-BPG-016.4a)", async () => {
    const page = await publishedPage();
    await saveContentOverride({
      consultantId: tenant.consultantId,
      pageId: page.pageId,
      fieldKey: "brand_overview",
      value: "Contenido con estafa mencionada", // vetado
    });
    const { rows } = await withMigrator((c) =>
      c.query<{ id: string }>(
        `SELECT id FROM consultant_content_overrides
         WHERE brandmepage_id = $1 AND status = 'pending_review'`,
        [page.pageId],
      ),
    );
    await approveFlaggedOverride(rows[0].id);
    await drainRerenders();
    const renderable = await withSystemContext("test-render", () =>
      getRenderableBySlugs(page.consultantSlug, page.brandSlug),
    );
    expect(renderable?.overrides.brand_overview).toContain("estafa");
  });

  it("restore original elimina el override y write-once protege el original (AC-BPG-014.3)", async () => {
    const page = await publishedPage();
    await saveContentOverride({
      consultantId: tenant.consultantId,
      pageId: page.pageId,
      fieldKey: "hero_headline",
      value: "Editado",
    });
    await expect(
      withMigrator((c) =>
        c.query(
          `UPDATE consultant_content_overrides SET original_agent_value = 'hackeado'
           WHERE brandmepage_id = $1`,
          [page.pageId],
        ),
      ),
    ).rejects.toThrow(/write-once/);

    await restoreOriginal({
      consultantId: tenant.consultantId,
      pageId: page.pageId,
      fieldKey: "hero_headline",
    });
    await drainRerenders();
    const renderable = await withSystemContext("test-render", () =>
      getRenderableBySlugs(page.consultantSlug, page.brandSlug),
    );
    expect(renderable?.overrides.hero_headline).toBeUndefined();
  });
});

describe("re-render (ADR-002 / contratos)", () => {
  it("fallo terminal preserva la versión publicada (page-at-same-URL)", async () => {
    await setFlag("false");
    const brandId = await seedExtractedBrand(tenant.consultantId);
    const page = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId,
      publish: true,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    await enqueueRerender({
      pageId: page.pageId,
      tier: "consultant",
      regenerate: async () => {
        throw new Error("regeneración rota");
      },
    });
    await drainRerenders();
    const row = await pageRow(page.pageId);
    expect(row.state).toBe("published");
    expect(row.generated_copy.hero_headline, "config previo intacto").toBe(
      GOOD_COPY.hero_headline,
    );
  });

  it("solo páginas publicadas entran al ciclo de re-render", async () => {
    const brandId = await seedExtractedBrand(tenant.consultantId);
    const page = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    await enqueueRerender({ pageId: page.pageId, tier: "consultant" });
    await drainRerenders();
    expect((await pageRow(page.pageId)).state).toBe("draft");
  });
});

describe("slugs (REQ-BPG-004/012)", () => {
  it("los slugs reservados jamás se asignan (AC-BPG-004.2)", async () => {
    // Consultant con nombre "Admin" (slug candidato reservado).
    const t = await createTenant("bmp-reserved");
    await withMigrator(async (c) => {
      const uid = `uid-${randomUUID().slice(0, 8)}`;
      await c.query(`INSERT INTO users (id, display_name) VALUES ($1, 'Admin')`, [uid]);
      await c.query(`UPDATE consultants SET firebase_uid = $1 WHERE id = $2`, [
        uid,
        t.consultantId,
      ]);
    });
    const brandId = await seedExtractedBrand(t.consultantId);
    const result = await generateBrandMePage({
      consultantId: t.consultantId,
      brandId,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    expect(result.consultantSlug).not.toBe("admin");
    expect(result.consultantSlug).toMatch(/^admin-\d+$/);
  });

  it("el consultant slug es estable entre generaciones", async () => {
    const brandA = await seedExtractedBrand(tenant.consultantId);
    const brandB = await seedExtractedBrand(tenant.consultantId);
    const a = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId: brandA,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    const b = await generateBrandMePage({
      consultantId: tenant.consultantId,
      brandId: brandB,
      llmProvider: fakeLlm([JSON.stringify(GOOD_COPY)]),
      retryBaseMs: 1,
    });
    expect(a.consultantSlug).toBe(b.consultantSlug);
    expect(a.brandSlug).not.toBe(b.brandSlug);
  });
});
