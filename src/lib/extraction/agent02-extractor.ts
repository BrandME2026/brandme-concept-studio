import { invokeLLM } from "@/lib/ai/llm-wrapper";
import type { AIModelProvider } from "@/lib/ai/model-provider";
import { getConfigNumber } from "@/lib/config/config-store";
import { captureError } from "@/lib/observability/observability";
import { agent02Limiter } from "./concurrency-limiter";
import { isEmptyExtraction } from "./quality-gate";
import {
  agent02OutputSchema,
  type Agent02Output,
  type LlmFailureClass,
  type ScrapeResult,
} from "./types";

/**
 * Agent02LLMExtractor (WO-13, ADR-002): UN solo pass LLM (alias `large`, modo
 * batch → cache TTL 1h) deriva todas las señales. Reintenta hasta
 * `extraction.llm_retries` veces sobre el MISMO contenido (jamás re-scrape,
 * ADR-004) ante respuesta malformada/vacía; clasifica el fallo terminal en los
 * 4 sub-tipos de AC-BEX-013.2. Gated por Agent02ConcurrencyLimiter.
 */

export const AGENT_ID = "agent-02-brand-extraction";

// System prompt ESTÁTICO (contrato del LLMWrapper AC-PF-016.5): todo el
// contenido variable (páginas scrapeadas) viaja en el prompt de usuario.
const SYSTEM_PROMPT = `Eres el Agente 02 (Brand Extraction) de la plataforma BrandMe.
Recibes el contenido scrapeado del sitio público de una marca de franquicias y
devuelves EXCLUSIVAMENTE un objeto JSON (sin markdown, sin comentarios) con esta forma:

{
  "identity": {
    "primary_color_hex": "#rrggbb o null si no es inferible del contenido",
    "secondary_palette": ["#rrggbb", ...] o null,
    "typography_classification": "clasificación tipográfica (p.ej. 'geometric sans-serif') o null",
    "header_style": "full-width-hero" | "centered-hero" | "split-layout" | "minimal-nav" | "unknown"
  },
  "content": {
    "brand_voice_keywords": ["≥10 keywords de voz de marca presentes o derivadas del contenido"],
    "faq_topic_areas": ["≥3 áreas temáticas de FAQ relevantes a franquicias"],
    "brand_voice_descriptor": { "tone_attributes": ["≥2 atributos de tono"], "communication_style": ["≥1 atributo de estilo"] },
    "avoid_list": ["temas/afirmaciones que la marca evita"],
    "markets_and_services": { "customer_segments": [...], "geographic_markets": [...], "offerings": [...] },
    "google_keyword_signals": ["≥10 términos de búsqueda derivados de títulos, headings, metadata y FAQs"]
  },
  "vertical": { "category": "qsr_food_beverage|fitness_wellness|home_services|business_services_staffing|education_tutoring|health_beauty|senior_care|childrens_services|pet_services|auto_services|retail|other", "confidence": "high|medium|low", "signals": ["señales que sustentan la clasificación"] },
  "fdd": { "investment_range_min": F, "investment_range_max": F, "avg_unit_volume": F, "royalty_rate": F, "total_unit_count": F },
  "intake_protocol_coverage": { "investment_breakdown": S, "ideal_franchisee_profile": S, "opening_timeline": S, "unit_economics": S, "support_model": S, "franchisee_health": S, "territory_growth": S, "success_failure_patterns": S, "competitive_differentiation": S, "ai_scope_boundaries": S },
  "ai_scope_guardrails": ["declaraciones explícitas de límites de scope AI encontradas en el sitio"],
  "brand_testimonials": [{ "quote": "cita textual", "attribution": "autoría tal como aparece o null", "source_url": "url de la página fuente" }],
  "brand_accolades": ["premios, rankings, acreditaciones"],
  "same_as_urls": ["URLs externas autoritativas (Wikipedia, Wikidata, Google Business Profile)"] o null,
  "additional_relevant_content": ["contenido relevante fuera de las 10 áreas del intake protocol"]
}

Donde F = { "value": número o string o null, "source_url": "url donde aparece EXPLÍCITO o null", "confidence": "explicit" | "inferred" | "absent" }
y S = "present" | "partial" | "absent".

Reglas duras:
- Datos financieros (fdd): SOLO marca "explicit" lo que aparece textualmente en el contenido con su URL fuente. Lo derivado o calculado es "inferred". JAMÁS inventes valores.
- Los testimonials se copian textuales con su atribución tal como aparece.
- Si una señal no es derivable del contenido, usa null / arrays vacíos / "absent" — no rellenes por complacer el schema.
- Responde SOLO el JSON.`;

function buildUserPrompt(scrape: ScrapeResult): string {
  const pages = scrape.pages
    .map(
      (p) =>
        `<page url="${p.finalUrl}" title="${p.title.replaceAll('"', "'")}">\n` +
        (p.metaDescription ? `META: ${p.metaDescription}\n` : "") +
        (p.headings.length ? `HEADINGS: ${p.headings.join(" | ")}\n` : "") +
        `${p.text}\n</page>`,
    )
    .join("\n\n");
  const franchise = scrape.franchiseDevUrl
    ? `\nPÁGINA DE FRANCHISE DEVELOPMENT DETECTADA: ${scrape.franchiseDevUrl}`
    : "";
  return `CONTENIDO SCRAPEADO DEL SITIO DE LA MARCA:${franchise}\n\n${pages}`;
}

export class LlmExtractionError extends Error {
  constructor(
    public readonly failureClass: LlmFailureClass,
    message: string,
  ) {
    super(message);
    this.name = "LlmExtractionError";
  }
}

function parseOutput(text: string): Agent02Output | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  try {
    const parsed: unknown = JSON.parse(cleaned);
    const result = agent02OutputSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Corre el pass de extracción con retries sobre el mismo contenido. Lanza
 * LlmExtractionError con el sub-tipo terminal; el pipeline lo traduce a
 * degradación + health record.
 */
export async function runExtractionPass(
  scrape: ScrapeResult,
  opts: { consultantId?: string; provider?: AIModelProvider },
): Promise<Agent02Output> {
  const retries = await getConfigNumber("extraction", "llm_retries", 2);
  const timeoutMs = await getConfigNumber("extraction", "llm_pass_timeout_ms", 120_000);
  const prompt = buildUserPrompt(scrape);

  const release = await agent02Limiter.acquire();
  try {
    let lastClass: LlmFailureClass = "llm_malformed_response";
    for (let attempt = 0; attempt <= retries; attempt++) {
      let text: string;
      try {
        const invocation = invokeLLM({
          alias: "large",
          mode: "batch",
          system: SYSTEM_PROMPT,
          prompt,
          agentId: AGENT_ID,
          consultantId: opts.consultantId,
          provider: opts.provider,
        });
        const result = await Promise.race([
          invocation,
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new LlmExtractionError("llm_timeout", "pass LLM excedió el timeout")),
              timeoutMs,
            ).unref?.(),
          ),
        ]);
        text = result.text;
      } catch (err) {
        lastClass = err instanceof LlmExtractionError ? err.failureClass : "llm_api_error";
        captureError(err, `[agent-02] intento ${attempt + 1} falló (${lastClass})`);
        // Timeout es TERMINAL (hallazgo de review R1): invokeLLM no es
        // cancelable (EP-05 sin AbortSignal), así que la invocación que
        // excedió el timeout sigue en vuelo y escribirá su telemetría al
        // terminar. Reintentar aquí duplicaría el costo real con dos llamadas
        // concurrentes — se corta el loop y el admin re-extrae si procede.
        if (lastClass === "llm_timeout") break;
        continue;
      }

      const parsed = parseOutput(text);
      if (!parsed) {
        lastClass = "llm_malformed_response";
        captureError(
          new Error(`[agent-02] respuesta no parseable en intento ${attempt + 1}`),
        );
        continue;
      }
      if (isEmptyExtraction(parsed)) {
        lastClass = "llm_empty_extraction";
        captureError(
          new Error(`[agent-02] extracción vacía (<2 señales) en intento ${attempt + 1}`),
        );
        continue;
      }
      return parsed;
    }
    throw new LlmExtractionError(lastClass, `pass LLM agotó ${retries + 1} intentos`);
  } finally {
    release();
  }
}
