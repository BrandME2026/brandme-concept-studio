import { invokeLLM } from "@/lib/ai/llm-wrapper";
import type { AIModelProvider } from "@/lib/ai/model-provider";
import { captureError } from "@/lib/observability/observability";
import { findVerbatimViolations } from "@/lib/extraction/compliance";
import { generatedCopySchema, type BrandLayer, type GeneratedCopy } from "./types";

/**
 * Copy del Agente 04 (WO-15): un pass LLM (alias `large`) genera hero headline,
 * brand overview, value proposition, FAQs y meta description. Los behavioral
 * constraints del requirement son parte del system prompt ESTÁTICO; el gate de
 * compliance (AC-BEX-004: sin ≥6 palabras verbatim del sitio fuente) se
 * verifica en CÓDIGO con findVerbatimViolations — una violación reintenta el
 * copy. Retries: 3 con backoff 2s/4s/8s (AC-BPG-006.3).
 */

export const AGENT_ID = "agent-04-brandmepage";

// Constraints no-configurables del requirement ("Agent 04 behavioral constraints").
const SYSTEM_PROMPT = `Eres el Agente 04 (BrandMePage Copy) de la plataforma BrandMe.
Recibes las señales de contenido de una marca de franquicias y el nombre del consultor
que la representa, y devuelves EXCLUSIVAMENTE un objeto JSON (sin markdown):

{
  "hero_headline": "titular del hero (8-160 chars)",
  "brand_overview": "resumen de la marca (2-4 párrafos breves)",
  "value_proposition": ["3-6 bullets de propuesta de valor"],
  "faqs": [{ "question": "...", "answer": "..." }],  // 4-6 FAQs que manejan objeciones
  "meta_description": "resumen para buscadores de 140-155 caracteres que INCLUYE el keyword primario"
}

Reglas duras (no negociables):
- JAMÁS afirmes ganancias garantizadas ni ROI específico; todo framing financiero usa lenguaje calificado ("según cifras divulgadas por la marca").
- NO reproduzcas más de 5 palabras consecutivas del contenido fuente de la marca: todo el copy es trabajo original.
- Nivel de lectura Flesch-Kincaid grado 8-10.
- El tono sigue el brand voice descriptor provisto; si está ausente usa "profesional, directo y enfocado en beneficios".
- La narrativa del consultor se mantiene tonal y visualmente distinta del brand overview.
- Responde SOLO el JSON.`;

function buildPrompt(brand: BrandLayer, consultantName: string): string {
  const c = brand.contentSignals;
  return [
    `CONSULTOR: ${consultantName}`,
    `KEYWORDS DE VOZ: ${c.brand_voice_keywords.join(", ")}`,
    `KEYWORD PRIMARIO (para la meta description): ${c.google_keyword_signals[0] ?? c.brand_voice_keywords[0] ?? ""}`,
    `ÁREAS FAQ: ${c.faq_topic_areas.join(" | ")}`,
    `VOICE DESCRIPTOR: tono=${c.brand_voice_descriptor.tone_attributes.join("/") || "(ausente)"} · estilo=${c.brand_voice_descriptor.communication_style.join("/") || "(ausente)"}`,
    `MERCADOS Y SERVICIOS: ${c.markets_and_services.offerings.join(", ")} — segmentos: ${c.markets_and_services.customer_segments.join(", ")} — geografía: ${c.markets_and_services.geographic_markets.join(", ")}`,
    c.avoid_list.length ? `EVITAR: ${c.avoid_list.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export class CopyGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopyGenerationError";
  }
}

function parseCopy(text: string): GeneratedCopy | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  try {
    const result = generatedCopySchema.safeParse(JSON.parse(cleaned));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Genera el copy con 3 retries (backoff 2s/4s/8s) ante fallo transitorio,
 * respuesta no parseable o violación de compliance. Lanza CopyGenerationError
 * al agotar los intentos (el caller transiciona a fallo terminal).
 */
export async function generateCopy(
  brand: BrandLayer,
  consultantName: string,
  opts: {
    consultantId?: string;
    provider?: AIModelProvider;
    retryBaseMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<{ copy: GeneratedCopy; complianceVerified: boolean }> {
  const sleep = opts.sleep ?? defaultSleep;
  const baseMs = opts.retryBaseMs ?? 2000;
  const prompt = buildPrompt(brand, consultantName);

  let lastReason = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(baseMs * 2 ** (attempt - 1)); // 2s, 4s, 8s
    let text: string;
    try {
      const result = await invokeLLM({
        alias: "large",
        mode: "batch",
        system: SYSTEM_PROMPT,
        prompt,
        agentId: AGENT_ID,
        consultantId: opts.consultantId,
        provider: opts.provider,
      });
      text = result.text;
    } catch (err) {
      lastReason = "fallo transitorio del LLM";
      captureError(err, `[agent-04] intento ${attempt + 1} de copy falló`);
      continue;
    }

    const copy = parseCopy(text);
    if (!copy) {
      lastReason = "respuesta no parseable";
      captureError(new Error(`[agent-04] copy no parseable en intento ${attempt + 1}`));
      continue;
    }

    // Gate de compliance (AC-BEX-004.2/.3): ≥6 palabras verbatim del fuente.
    // Cubre TODOS los campos generados — incluida meta_description, donde el
    // requisito del keyword primario empuja al LLM hacia frases del fuente
    // (hallazgo de review R1).
    const generatedText = [
      copy.hero_headline,
      copy.brand_overview,
      ...copy.value_proposition,
      ...copy.faqs.flatMap((f) => [f.question, f.answer]),
      copy.meta_description,
    ].join("\n");
    const violations = brand.rawSourceText
      ? findVerbatimViolations(generatedText, brand.rawSourceText)
      : [];
    if (violations.length > 0) {
      lastReason = `compliance: ${violations.length} secuencias verbatim`;
      captureError(
        new Error(
          `[agent-04] compliance verbatim en intento ${attempt + 1}: "${violations[0].phrase}"`,
        ),
      );
      continue;
    }
    return { copy, complianceVerified: true };
  }
  throw new CopyGenerationError(`copy agotó 4 intentos (${lastReason})`);
}
