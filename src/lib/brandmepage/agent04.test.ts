import { describe, expect, it } from "vitest";
import { toSlug } from "./slug-service";
import { scanForDisallowedTerms } from "./quality-filter";
import { applyOverrides, assembleRenderModel } from "./render-data";
import { buildJsonLd, buildLlmsTxt, pageTitle } from "./seo";
import { agent04Limiter } from "./agent04-limiter";
import { generatedCopySchema, type GeneratedCopy } from "./types";
import type { RenderablePage } from "./store";

/**
 * WO-15: núcleo puro del Agente 04 — slugs (REQ-BPG-012), quality filter
 * (AC-BPG-016.1), composición/overrides (AC-BPG-001.2/014), SEO builders
 * (REQ-BPG-010) y limiter con prioridad (AC-BPG-017).
 */

describe("toSlug (AC-BPG-012.1)", () => {
  it("minúsculas, guiones y transliteración ASCII", () => {
    expect(toSlug("María José Núñez")).toBe("maria-jose-nunez");
    expect(toSlug("  Jane   Smith  ")).toBe("jane-smith");
    expect(toSlug("Café & Té, S.A.")).toBe("cafe-te-s-a");
  });

  it("vacío o solo símbolos → fallback", () => {
    expect(toSlug("!!!")).toBe("consultant");
  });
});

describe("scanForDisallowedTerms (AC-BPG-016.1)", () => {
  const terms = ["sucks", "bad*", "dinero garantizado"];

  it("palabra completa, case-insensitive; sin falsos positivos por substring", () => {
    expect(scanForDisallowedTerms("This SUCKS a lot", terms)).toEqual(["sucks"]);
    expect(scanForDisallowedTerms("what a sucker", terms)).toEqual([]);
  });

  it("wildcard de prefijo: bad* matchea bad/badly/badness", () => {
    expect(scanForDisallowedTerms("badly done", terms)).toEqual(["bad*"]);
    expect(scanForDisallowedTerms("badness everywhere", terms)).toEqual(["bad*"]);
    expect(scanForDisallowedTerms("the abadía", terms)).toEqual([]);
  });

  it("términos multi-palabra matchean como frase", () => {
    expect(scanForDisallowedTerms("te ofrezco DINERO GARANTIZADO ya", terms)).toEqual([
      "dinero garantizado",
    ]);
    expect(scanForDisallowedTerms("dinero muy garantizado", terms)).toEqual([]);
  });
});

const COPY: GeneratedCopy = {
  hero_headline: "Tu futuro con PowerFit empieza hoy",
  brand_overview:
    "PowerFit es una marca de gimnasios boutique con más de una década ayudando a emprendedores a construir negocios de bienestar rentables en sus comunidades.",
  value_proposition: ["Modelo probado", "Soporte integral", "Territorios disponibles"],
  faqs: [
    { question: "¿Cuánto necesito invertir?", answer: "La inversión varía según divulgación de la marca." },
    { question: "¿Necesito experiencia?", answer: "No: el soporte cubre la curva de aprendizaje completa." },
    { question: "¿Cuánto tarda la apertura?", answer: "Los tiempos dependen del local y los permisos." },
    { question: "¿Qué soporte recibo?", answer: "Entrenamiento inicial y acompañamiento continuo." },
  ],
  meta_description:
    "Descubre la franquicia de gimnasios PowerFit con un consultor experto: inversión, soporte y territorios disponibles explicados sin letra chica.",
};

function page(overrides: Record<string, string> = {}): RenderablePage {
  return {
    id: "p1",
    consultantId: "c1",
    brandId: "b1",
    consultantSlug: "jane-smith",
    brandSlug: "powerfit",
    state: "published",
    identityTokens: {
      logo_url: null,
      primary_color_hex: "#0055a5",
      secondary_palette: ["#ffffff"],
      typography_classification: "sans",
      header_style: "centered-hero",
    },
    contentSignals: {
      brand_voice_keywords: [],
      faq_topic_areas: [],
      brand_voice_descriptor: { tone_attributes: [], communication_style: [] },
      avoid_list: [],
      markets_and_services: { customer_segments: [], geographic_markets: [], offerings: [] },
      google_keyword_signals: [],
    },
    generatedCopy: COPY,
    fddFinancialData: null,
    sameAsUrls: ["https://es.wikipedia.org/wiki/PowerFit"],
    brandName: "PowerFit",
    overrides,
  };
}

const OVERLAY = {
  name: "Jane Smith",
  headshotUrl: null,
  bio: null,
  socialLinks: {},
  loomUrl: null,
  credentials: [],
};

describe("applyOverrides (REQ-BPG-014)", () => {
  it("el override live pisa el copy del agente y se registra el campo", () => {
    const effective = applyOverrides(COPY, {
      hero_headline: "Mi titular editado",
      faq_answer_2: "Respuesta editada",
    });
    expect(effective.hero_headline).toBe("Mi titular editado");
    expect(effective.faqs[1].answer).toBe("Respuesta editada");
    expect(effective.faqs[0].answer).toBe(COPY.faqs[0].answer);
    expect(effective.overriddenFields.sort()).toEqual(["faq_answer_2", "hero_headline"]);
  });
});

describe("assembleRenderModel (AC-BPG-001.2 condicionales)", () => {
  it("sin datos condicionales: loom/credenciales/roi/comparison/portfolio omitidos; territory pending", () => {
    const model = assembleRenderModel(page(), OVERLAY, []);
    expect(model.blocks).toMatchObject({
      loomVideo: false,
      credentials: false,
      roiCalculator: false,
      territoryPending: true,
      comparisonCard: false,
      portfolioNav: false,
      testimonials: false,
    });
    expect(model.leadSlug).toBe("jane-smith/powerfit");
  });

  it("con FDD, loom válido, credenciales y portafolio: bloques activos", () => {
    const p = page();
    p.fddFinancialData = { investment_range_min: { value: 100 } };
    const model = assembleRenderModel(
      p,
      {
        ...OVERLAY,
        loomUrl: "https://www.loom.com/share/abc123",
        credentials: ["CFE"],
      },
      [{ brandName: "Otra", href: "/jane-smith/otra", logoUrl: null, primaryColor: null }],
    );
    expect(model.blocks).toMatchObject({
      loomVideo: true,
      credentials: true,
      roiCalculator: true,
      comparisonCard: true,
      portfolioNav: true,
    });
  });

  it("un loom inválido NO activa el bloque", () => {
    const model = assembleRenderModel(
      page(),
      { ...OVERLAY, loomUrl: "https://evil.test/share/x" },
      [],
    );
    expect(model.blocks.loomVideo).toBe(false);
  });

  it("el portafolio se recorta a 9 tarjetas (AC-BPG-013.2)", () => {
    const cards = Array.from({ length: 12 }, (_, i) => ({
      brandName: `B${i}`,
      href: `/x/b${i}`,
      logoUrl: null,
      primaryColor: null,
    }));
    expect(assembleRenderModel(page(), OVERLAY, cards).portfolio).toHaveLength(9);
  });
});

describe("SEO builders (REQ-BPG-010)", () => {
  it("title formula exacta (AC-BPG-010.1)", () => {
    expect(pageTitle("PowerFit", "Jane Smith")).toBe(
      "PowerFit Franchise Opportunity — Jane Smith | BrandMe",
    );
  });

  it("JSON-LD: ProfessionalService con sameAs + BreadcrumbList + Person autor (AC-BPG-010.3/.5)", () => {
    const blocks = buildJsonLd(page(), OVERLAY);
    const types = blocks.map((b) => b["@type"]);
    expect(types).toEqual(["ProfessionalService", "BreadcrumbList", "Person"]);
    expect(blocks[0].sameAs).toContain("https://es.wikipedia.org/wiki/PowerFit");
    expect(blocks[0].author).toMatchObject({ "@type": "Person", name: "Jane Smith" });
    expect(blocks[2]).toMatchObject({ name: "Jane Smith", jobTitle: "Franchise Consultant" });
  });

  it("llms.txt: título, descripción y links canónicos (AC-BPG-010.4)", () => {
    const txt = buildLlmsTxt(page(), OVERLAY);
    expect(txt).toContain("# PowerFit Franchise Opportunity — Jane Smith");
    expect(txt).toContain(COPY.meta_description);
    expect(txt).toContain("/jane-smith/powerfit");
    expect(txt).toContain("es.wikipedia.org");
  });
});

describe("generatedCopySchema", () => {
  it("acepta el copy válido y rechaza FAQs insuficientes", () => {
    expect(generatedCopySchema.safeParse(COPY).success).toBe(true);
    expect(
      generatedCopySchema.safeParse({ ...COPY, faqs: COPY.faqs.slice(0, 2) }).success,
    ).toBe(false);
  });
});

describe("Agent04ConcurrencyLimiter — prioridad 3-tier (AC-BPG-017.2)", () => {
  it("consultant > admin > batch al liberar slots; FIFO dentro del tier", async () => {
    agent04Limiter.__resetForTests();
    // Llenar el cap (fallback 10 sin DB).
    const held = await Promise.all(
      Array.from({ length: 10 }, () => agent04Limiter.acquire("batch")),
    );

    const order: string[] = [];
    const waiters = [
      agent04Limiter.acquire("batch").then((r) => (order.push("batch-1"), r)),
      agent04Limiter.acquire("admin").then((r) => (order.push("admin-1"), r)),
      agent04Limiter.acquire("consultant").then((r) => (order.push("consultant-1"), r)),
      agent04Limiter.acquire("consultant").then((r) => (order.push("consultant-2"), r)),
    ];
    await new Promise((r) => setTimeout(r, 10));
    expect(agent04Limiter.stats().queuedByTier).toEqual({ consultant: 2, admin: 1, batch: 1 });

    for (const release of held) release();
    const releases = await Promise.all(waiters);
    expect(order).toEqual(["consultant-1", "consultant-2", "admin-1", "batch-1"]);
    releases.forEach((r) => r());
    expect(agent04Limiter.stats()).toMatchObject({ active: 0, queued: 0 });
    agent04Limiter.__resetForTests();
  });
});
