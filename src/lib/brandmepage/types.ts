import { z } from "zod";

/**
 * Agente 04 — BrandMePage Generation (WO-15, blueprint a8518d73). Composición
 * de 3 capas (ADR-001): brand layer (Agente 02 o BrandTemplate) + copy LLM +
 * overlay del consultant. El LLM genera SOLO COPY (JSON); la página es
 * composición React determinista estilizada por los identity tokens.
 */

export type PageState =
  | "draft"
  | "pending_approval"
  | "published"
  | "stale"
  | "regenerating"
  | "offline"
  | "archived"
  | "gone";

/** Copy generado por el pass LLM del Agente 04 (validado con zod). */
export const generatedCopySchema = z.object({
  hero_headline: z.string().min(8).max(160),
  brand_overview: z.string().min(80),
  value_proposition: z.array(z.string().min(4)).min(3).max(6),
  faqs: z
    .array(z.object({ question: z.string().min(8), answer: z.string().min(20) }))
    .min(4)
    .max(6),
  // AC-BPG-010.2: meta description 140-155 chars con el keyword primario.
  meta_description: z.string().min(120).max(170),
});

export type GeneratedCopy = z.infer<typeof generatedCopySchema>;

export interface IdentityTokens {
  logo_url: string | null;
  primary_color_hex: string | null;
  secondary_palette: string[] | null;
  typography_classification: string | null;
  header_style: string;
}

export interface ContentSignals {
  brand_voice_keywords: string[];
  faq_topic_areas: string[];
  brand_voice_descriptor: { tone_attributes: string[]; communication_style: string[] };
  avoid_list: string[];
  markets_and_services: {
    customer_segments: string[];
    geographic_markets: string[];
    offerings: string[];
  };
  google_keyword_signals: string[];
}

/** Brand layer resuelto (extracción dinámica o template admin). */
export interface BrandLayer {
  source: "agent04_dynamic" | "brand_template";
  brandTemplateId: string | null;
  identityTokens: IdentityTokens;
  contentSignals: ContentSignals;
  fddFinancialData: unknown | null;
  sameAsUrls: string[] | null;
  /** Contenido crudo scrapeado (para el gate de compliance verbatim). */
  rawSourceText: string;
}

/** Overlay del consultant (capa 3). Los campos ausentes omiten su bloque. */
export interface ConsultantOverlay {
  name: string;
  headshotUrl: string | null;
  bio: string | null;
  socialLinks: Record<string, string>;
  loomUrl: string | null;
  credentials: string[];
}

export interface GenerationResult {
  pageId: string;
  configId: string;
  state: PageState;
  consultantSlug: string;
  brandSlug: string;
  previewToken: string;
}

/** Cola del ReRenderScheduler (ADR-002): 3 niveles, FIFO dentro de cada uno. */
export type RerenderTier = "consultant" | "admin" | "batch";
