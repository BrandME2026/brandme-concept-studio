import { z } from "zod";

/**
 * Agente 02 — Brand Extraction (WO-13, blueprint 1b5a8f04). Tipos del pipeline
 * scrape → LLM single-pass → quality gate → payload. `src/lib/extraction/` es
 * el agente de MARCA (multi-página, texto+identidad); no confundir con
 * `src/lib/extract/` (extractor visual single-page del Concept Studio).
 */

// ── Scraping ────────────────────────────────────────────────────────────────

export interface ScrapedLink {
  href: string;
  text: string;
}

export interface ScrapedPage {
  url: string;
  finalUrl: string;
  title: string;
  metaDescription: string | null;
  ogImage: string | null;
  headings: string[];
  /** Texto visible normalizado (whitespace colapsado). */
  text: string;
  links: ScrapedLink[];
  /** Señales para clasificar login-wall / SPA sin contenido. */
  hasPasswordInput: boolean;
  scriptCount: number;
  /** Candidato a logo detectado en el DOM (header/nav img → og → favicon). */
  logoCandidate: { kind: "img" | "svg" | "icon" | "og"; dataUri: string } | null;
}

/** Frontera de transporte del scraping (ADR-001: Firecrawl es transporte, no
 * lógica de negocio). Hoy: LocalScrapeProvider (Playwright + SSRF guard). El
 * adapter Firecrawl se implementa cuando exista FIRECRAWL_API_KEY para
 * verificarlo — no se sube transporte no probado. */
export interface ScrapeProvider {
  name: string;
  scrapePage(url: string, opts: { timeoutMs: number }): Promise<ScrapedPage>;
}

export type ScrapeFailureClass =
  | "robots_txt_disallow"
  | "paywall_or_login_wall"
  | "js_spa_no_content"
  | "persistent_transient_error";

export type LlmFailureClass =
  | "llm_malformed_response"
  | "llm_empty_extraction"
  | "llm_api_error"
  | "llm_timeout";

export type FailureClass = ScrapeFailureClass | LlmFailureClass | "quality_degradation";

export interface ScrapeResult {
  pages: ScrapedPage[];
  scrapedUrls: string[];
  /** data URI del logo (prioridad AC-BEX-002.5) o null — nunca bloquea. */
  logoDataUri: string | null;
  franchiseDevUrl: string | null;
  truncated: boolean;
}

export class ScrapeTerminalError extends Error {
  constructor(
    public readonly failureClass: ScrapeFailureClass,
    message: string,
  ) {
    super(message);
    this.name = "ScrapeTerminalError";
  }
}

// ── Salida del pass LLM (zod: el parse fallido = malformed_response) ────────

export const VERTICALS = [
  "qsr_food_beverage",
  "fitness_wellness",
  "home_services",
  "business_services_staffing",
  "education_tutoring",
  "health_beauty",
  "senior_care",
  "childrens_services",
  "pet_services",
  "auto_services",
  "retail",
  "other",
] as const;

export const INTAKE_AREAS = [
  "investment_breakdown",
  "ideal_franchisee_profile",
  "opening_timeline",
  "unit_economics",
  "support_model",
  "franchisee_health",
  "territory_growth",
  "success_failure_patterns",
  "competitive_differentiation",
  "ai_scope_boundaries",
] as const;

const coverageStatus = z.enum(["present", "partial", "absent"]);

/** Campo FDD con atribución (AC-BEX-008.2/.5): solo 'explicit' entra al payload. */
const fddField = z.object({
  value: z.union([z.number(), z.string()]).nullable(),
  source_url: z.string().nullable(),
  confidence: z.enum(["explicit", "inferred", "absent"]),
});

export const agent02OutputSchema = z.object({
  identity: z.object({
    primary_color_hex: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable(),
    secondary_palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).nullable(),
    typography_classification: z.string().nullable(),
    header_style: z.enum([
      "full-width-hero",
      "centered-hero",
      "split-layout",
      "minimal-nav",
      "unknown",
    ]),
  }),
  content: z.object({
    brand_voice_keywords: z.array(z.string()),
    faq_topic_areas: z.array(z.string()),
    brand_voice_descriptor: z.object({
      tone_attributes: z.array(z.string()),
      communication_style: z.array(z.string()),
    }),
    avoid_list: z.array(z.string()),
    markets_and_services: z.object({
      customer_segments: z.array(z.string()),
      geographic_markets: z.array(z.string()),
      offerings: z.array(z.string()),
    }),
    google_keyword_signals: z.array(z.string()),
  }),
  vertical: z.object({
    category: z.enum(VERTICALS),
    confidence: z.enum(["high", "medium", "low"]),
    signals: z.array(z.string()),
  }),
  fdd: z.object({
    investment_range_min: fddField,
    investment_range_max: fddField,
    avg_unit_volume: fddField,
    royalty_rate: fddField,
    total_unit_count: fddField,
  }),
  intake_protocol_coverage: z.record(z.enum(INTAKE_AREAS), coverageStatus),
  /** Guardrails de scope AI: SIEMPRE pending review, jamás auto-aplicados (AC-BEX-011.3). */
  ai_scope_guardrails: z.array(z.string()),
  brand_testimonials: z.array(
    z.object({
      quote: z.string(),
      attribution: z.string().nullable(),
      source_url: z.string(),
    }),
  ),
  brand_accolades: z.array(z.string()),
  same_as_urls: z.array(z.string()).nullable(),
  additional_relevant_content: z.array(z.string()),
});

export type Agent02Output = z.infer<typeof agent02OutputSchema>;

// ── Quality gate ────────────────────────────────────────────────────────────

export type SignalStatus = "pass" | "fail";

export interface QualityGateResult {
  degraded: boolean;
  /** pass/fail por señal (viaja SIEMPRE con el payload — AC-BEX-005.8). */
  perFieldStatus: Record<string, SignalStatus>;
  passingPrimarySignals: number;
}

// ── Corrida ─────────────────────────────────────────────────────────────────

export type ExtractionStatus = "running" | "completed" | "degraded" | "failed";

export interface ExtractionRunResult {
  extractionId: string;
  brandId: string;
  status: ExtractionStatus;
  degradationFlag: boolean;
  failureClass: FailureClass | null;
}
