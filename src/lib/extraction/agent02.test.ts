import { describe, expect, it } from "vitest";
import { evaluateQuality, isEmptyExtraction } from "./quality-gate";
import { findVerbatimViolations } from "./compliance";
import { planCrawl, truncateToBudget } from "./crawl-plan";
import { isDisallowedByRobots } from "./scraper";
import { agent02Limiter } from "./concurrency-limiter";
import { agent02OutputSchema, type Agent02Output, type ScrapedPage } from "./types";

/**
 * WO-13: núcleo puro del Agente 02 — quality gate (AC-BEX-005.1/.8),
 * compliance verbatim (AC-BEX-004.2), plan de crawl (AC-BEX-001.1/014.1),
 * truncado con prioridad (AC-BEX-001.4), robots y limiter (AC-BEX-012).
 */

function fullOutput(overrides: Partial<Agent02Output["identity"]> = {}, content: Partial<Agent02Output["content"]> = {}): Agent02Output {
  return {
    identity: {
      primary_color_hex: "#c8102e",
      secondary_palette: ["#ffffff", "#1a1a1a"],
      typography_classification: "geometric sans-serif",
      header_style: "full-width-hero",
      ...overrides,
    },
    content: {
      brand_voice_keywords: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      faq_topic_areas: ["inversión", "soporte", "territorios"],
      brand_voice_descriptor: {
        tone_attributes: ["cercano", "profesional"],
        communication_style: ["directo"],
      },
      avoid_list: [],
      markets_and_services: {
        customer_segments: ["familias"],
        geographic_markets: ["MX"],
        offerings: ["comida rápida"],
      },
      google_keyword_signals: ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9", "k10"],
      ...content,
    },
    vertical: { category: "qsr_food_beverage", confidence: "high", signals: ["menú", "restaurante"] },
    fdd: {
      investment_range_min: { value: 250000, source_url: "https://x/franchise", confidence: "explicit" },
      investment_range_max: { value: null, source_url: null, confidence: "absent" },
      avg_unit_volume: { value: 900000, source_url: null, confidence: "inferred" },
      royalty_rate: { value: null, source_url: null, confidence: "absent" },
      total_unit_count: { value: null, source_url: null, confidence: "absent" },
    },
    intake_protocol_coverage: {
      investment_breakdown: "present",
      ideal_franchisee_profile: "partial",
      opening_timeline: "absent",
      unit_economics: "partial",
      support_model: "present",
      franchisee_health: "absent",
      territory_growth: "absent",
      success_failure_patterns: "absent",
      competitive_differentiation: "present",
      ai_scope_boundaries: "absent",
    },
    ai_scope_guardrails: [],
    brand_testimonials: [],
    brand_accolades: [],
    same_as_urls: null,
    additional_relevant_content: [],
  };
}

describe("quality gate (AC-BEX-005.1)", () => {
  it("payload completo: 5/5 señales primarias, sin degradación", () => {
    const r = evaluateQuality(fullOutput(), { logoExtracted: true });
    expect(r.passingPrimarySignals).toBe(5);
    expect(r.degraded).toBe(false);
    expect(r.perFieldStatus.primary_color).toBe("pass");
  });

  it("exactamente 3 señales pasan → parcial SIN degradación (AC-BEX-005.8)", () => {
    const r = evaluateQuality(
      fullOutput({ primary_color_hex: null, secondary_palette: null }),
      { logoExtracted: false },
    );
    expect(r.passingPrimarySignals).toBe(3);
    expect(r.degraded).toBe(false);
    expect(r.perFieldStatus.primary_color).toBe("fail");
  });

  it("menos de 3 señales → degradación", () => {
    const r = evaluateQuality(
      fullOutput(
        { primary_color_hex: null, secondary_palette: null, typography_classification: null },
        {},
      ),
      { logoExtracted: true },
    );
    expect(r.passingPrimarySignals).toBe(2);
    expect(r.degraded).toBe(true);
  });

  it("el logo NO cuenta para el umbral (AC-BEX-002.5)", () => {
    const withLogo = evaluateQuality(
      fullOutput(
        { primary_color_hex: null, secondary_palette: null, typography_classification: null },
        {},
      ),
      { logoExtracted: true },
    );
    const withoutLogo = evaluateQuality(
      fullOutput(
        { primary_color_hex: null, secondary_palette: null, typography_classification: null },
        {},
      ),
      { logoExtracted: false },
    );
    expect(withLogo.degraded).toBe(true);
    expect(withoutLogo.degraded).toBe(true);
    expect(withLogo.perFieldStatus.logo).toBe("pass");
    expect(withoutLogo.perFieldStatus.logo).toBe("fail");
  });

  it("keywords: 5 pasan el umbral de degradación, 4 no", () => {
    const five = evaluateQuality(
      fullOutput({}, { brand_voice_keywords: ["a", "b", "c", "d", "e"] }),
      { logoExtracted: false },
    );
    const four = evaluateQuality(
      fullOutput({}, { brand_voice_keywords: ["a", "b", "c", "d"] }),
      { logoExtracted: false },
    );
    expect(five.perFieldStatus.brand_voice_keywords).toBe("pass");
    expect(four.perFieldStatus.brand_voice_keywords).toBe("fail");
  });

  it("empty_extraction: <2 señales pobladas (AC-BEX-013.2b)", () => {
    const empty = fullOutput(
      { primary_color_hex: null, secondary_palette: null, typography_classification: null },
      { brand_voice_keywords: [], faq_topic_areas: [], google_keyword_signals: [] },
    );
    expect(isEmptyExtraction(empty)).toBe(true);
    expect(isEmptyExtraction(fullOutput())).toBe(false);
  });
});

describe("compliance verbatim (AC-BEX-004.2)", () => {
  const source = "Nuestra franquicia líder ofrece el mejor soporte integral del mercado mexicano desde 1990.";

  it("6+ palabras consecutivas del fuente = violación", () => {
    const copy = "Descubre por qué nuestra franquicia líder ofrece el mejor soporte integral para ti.";
    const v = findVerbatimViolations(copy, source);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].phrase).toContain("franquicia líder ofrece el mejor");
  });

  it("5 palabras consecutivas NO es violación", () => {
    const copy = "franquicia líder ofrece el mejor equipo humano de la región.";
    expect(findVerbatimViolations(copy, source)).toHaveLength(0);
  });

  it("bloques aprobados por Brand Content Hub quedan exentos", () => {
    const approved = "nuestra franquicia líder ofrece el mejor soporte integral del mercado";
    const copy = `Como dicen ellos: ${approved}.`;
    expect(findVerbatimViolations(copy, source, [approved])).toHaveLength(0);
  });

  it("normaliza puntuación y mayúsculas", () => {
    const copy = "¡NUESTRA franquicia, líder... OFRECE el MEJOR soporte!";
    expect(findVerbatimViolations(copy, source).length).toBeGreaterThan(0);
  });
});

function page(url: string, links: Array<{ href: string; text: string }>, text = "contenido"): ScrapedPage {
  return {
    url,
    finalUrl: url,
    title: "t",
    metaDescription: null,
    ogImage: null,
    headings: [],
    text,
    links,
    hasPasswordInput: false,
    scriptCount: 0,
    logoCandidate: null,
  };
}

describe("plan de crawl (AC-BEX-001.1 / 014.1)", () => {
  it("franchise-intent gana la prioridad y se detecta como franchise dev URL", () => {
    const home = page("https://marca.mx/", [
      { href: "https://marca.mx/blog", text: "Blog" },
      { href: "https://marca.mx/nosotros", text: "Nosotros" },
      { href: "https://marca.mx/franquicias", text: "Own a Franchise" },
      { href: "https://marca.mx/faq", text: "Preguntas frecuentes" },
      { href: "https://otro-sitio.com/x", text: "Externo" },
    ]);
    const plan = planCrawl(home, 3);
    expect(plan.franchiseDevUrl).toBe("https://marca.mx/franquicias");
    expect(plan.additionalUrls[0]).toBe("https://marca.mx/franquicias");
    expect(plan.additionalUrls).toHaveLength(2);
    expect(plan.additionalUrls).not.toContain("https://otro-sitio.com/x");
  });

  it("About/FAQ priorizados sobre links genéricos; dedup y sin homepage", () => {
    const home = page("https://marca.mx/", [
      { href: "https://marca.mx/", text: "Home" },
      { href: "https://marca.mx/promo-1", text: "Promo" },
      { href: "https://marca.mx/about#team", text: "About us" },
      { href: "https://marca.mx/about", text: "About" },
      { href: "https://marca.mx/faq", text: "FAQ" },
    ]);
    const plan = planCrawl(home, 5);
    expect(plan.additionalUrls.slice(0, 2)).toEqual([
      "https://marca.mx/about",
      "https://marca.mx/faq",
    ]);
    expect(plan.additionalUrls.filter((u) => u.startsWith("https://marca.mx/about"))).toHaveLength(1);
    expect(plan.additionalUrls).not.toContain("https://marca.mx/");
  });

  it("respeta max_pages", () => {
    const home = page(
      "https://marca.mx/",
      Array.from({ length: 20 }, (_, i) => ({ href: `https://marca.mx/p${i}`, text: `P${i}` })),
    );
    expect(planCrawl(home, 5).additionalUrls).toHaveLength(4);
  });
});

describe("truncado con prioridad (AC-BEX-001.4)", () => {
  it("franchise-dev sobrevive completo; el resto se corta del final", () => {
    const home = page("https://m.mx/", [], "H".repeat(600));
    const franchise = page("https://m.mx/franquicias", [], "F".repeat(500));
    const extra = page("https://m.mx/blog", [], "B".repeat(500));
    const { pages, truncated } = truncateToBudget(
      [home, franchise, extra],
      "https://m.mx/franquicias",
      1000,
    );
    expect(truncated).toBe(true);
    const byUrl = Object.fromEntries(pages.map((p) => [p.url, p.text]));
    expect(byUrl["https://m.mx/franquicias"]).toHaveLength(500); // intacta (prioridad 1)
    expect(byUrl["https://m.mx/"]).toHaveLength(500); // homepage recortada (prioridad 2)
    expect(byUrl["https://m.mx/blog"]).toBeUndefined(); // descartada
  });

  it("bajo el presupuesto no toca nada", () => {
    const { pages, truncated } = truncateToBudget(
      [page("https://m.mx/", [], "hola"), page("https://m.mx/faq", [], "faq")],
      null,
      10_000,
    );
    expect(truncated).toBe(false);
    expect(pages).toHaveLength(2);
  });
});

describe("SSRF en checkRobots (hallazgo review R1)", () => {
  it("una URL hacia red interna JAMÁS dispara el fetch de robots.txt", async () => {
    const { scrapeBrandSite } = await import("./scraper");
    const fetchCalls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      return new Response("User-agent: *\nDisallow:", { status: 200 });
    }) as typeof fetch;
    try {
      const provider = {
        name: "fake",
        async scrapePage(u: string) {
          return page(u, []);
        },
      };
      await scrapeBrandSite("http://169.254.169.254/", provider, {
        maxPages: 1,
        pageTimeoutMs: 1000,
        retries: 0,
        retryBaseMs: 1,
        maxContentBytes: 10_000,
      });
      expect(
        fetchCalls.filter((u) => u.includes("169.254.169.254")),
        "assertSafeUrl debe rechazar ANTES del fetch server-side",
      ).toHaveLength(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("robots.txt (AC-BEX-001.3a)", () => {
  it("Disallow: / del grupo * bloquea", () => {
    expect(isDisallowedByRobots("User-agent: *\nDisallow: /", "/")).toBe(true);
    expect(isDisallowedByRobots("User-agent: *\nDisallow: /admin", "/")).toBe(false);
    expect(isDisallowedByRobots("User-agent: *\nDisallow: /admin", "/admin/panel")).toBe(true);
  });

  it("grupos de otros agentes no aplican", () => {
    expect(isDisallowedByRobots("User-agent: GPTBot\nDisallow: /", "/")).toBe(false);
    expect(
      isDisallowedByRobots("User-agent: GPTBot\nUser-agent: *\nDisallow: /", "/"),
    ).toBe(true);
  });

  it("Disallow vacío o robots vacío = permitido", () => {
    expect(isDisallowedByRobots("User-agent: *\nDisallow:", "/")).toBe(false);
    expect(isDisallowedByRobots("", "/")).toBe(false);
  });
});

describe("Agent02ConcurrencyLimiter (AC-BEX-012, cap fallback 10 sin DB)", () => {
  it("cap alcanzado encola FIFO sin drops y los contadores lo reflejan", async () => {
    agent02Limiter.__resetForTests();
    const releases = await Promise.all(
      Array.from({ length: 10 }, () => agent02Limiter.acquire()),
    );
    expect(agent02Limiter.stats()).toEqual({ active: 10, queued: 0 });

    const order: number[] = [];
    const queued = [11, 12].map((n) =>
      agent02Limiter.acquire().then((release) => {
        order.push(n);
        return release;
      }),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(agent02Limiter.stats()).toEqual({ active: 10, queued: 2 });

    releases[0]();
    releases[1]();
    const late = await Promise.all(queued);
    expect(order).toEqual([11, 12]); // FIFO
    expect(agent02Limiter.stats()).toEqual({ active: 10, queued: 0 });

    [...releases.slice(2), ...late].forEach((r) => r());
    expect(agent02Limiter.stats()).toEqual({ active: 0, queued: 0 });
    agent02Limiter.__resetForTests();
  });

  it("release doble no libera dos slots", async () => {
    agent02Limiter.__resetForTests();
    const release = await agent02Limiter.acquire();
    release();
    release();
    expect(agent02Limiter.stats().active).toBe(0);
    agent02Limiter.__resetForTests();
  });
});

describe("schema del payload (AC-BEX-013.2)", () => {
  it("acepta el payload completo", () => {
    expect(agent02OutputSchema.safeParse(fullOutput()).success).toBe(true);
  });

  it("rechaza colores fuera de #rrggbb y verticales inventadas", () => {
    const bad1 = { ...fullOutput(), identity: { ...fullOutput().identity, primary_color_hex: "rojo" } };
    const bad2 = { ...fullOutput(), vertical: { category: "crypto", confidence: "high", signals: [] } };
    expect(agent02OutputSchema.safeParse(bad1).success).toBe(false);
    expect(agent02OutputSchema.safeParse(bad2).success).toBe(false);
  });
});
