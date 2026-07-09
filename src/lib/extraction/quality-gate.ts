import type { Agent02Output, QualityGateResult } from "./types";

/**
 * ExtractionQualityGate (WO-13, AC-BEX-005.1/.8): evalúa las 5 señales
 * primarias — primary color, secondary palette, typography, ≥5 voice keywords,
 * ≥3 FAQ topic areas — y marca degradación cuando pasan MENOS de 3. El logo NO
 * cuenta para el umbral (AC-BEX-002.5). per_field_status viaja siempre con el
 * payload para que los consumidores sepan qué señales existen.
 *
 * Nota de umbral: los thresholds perceptuales del requirement (ΔE2000 ≤ 10 en
 * ≥80% de test brands, etc.) son criterios de VALIDACIÓN contra un test set —
 * en runtime la señal pasa si se extrajo con forma válida; el umbral contable
 * de degradación es el de AC-BEX-005.1 (≥5 keywords, ≥3 FAQ areas).
 */

const PRIMARY_SIGNALS = [
  "primary_color",
  "secondary_palette",
  "typography",
  "brand_voice_keywords",
  "faq_topic_areas",
] as const;

export function evaluateQuality(
  output: Agent02Output,
  opts: { logoExtracted: boolean },
): QualityGateResult {
  const perFieldStatus: QualityGateResult["perFieldStatus"] = {
    primary_color: output.identity.primary_color_hex ? "pass" : "fail",
    secondary_palette:
      output.identity.secondary_palette && output.identity.secondary_palette.length > 0
        ? "pass"
        : "fail",
    typography: output.identity.typography_classification ? "pass" : "fail",
    brand_voice_keywords: output.content.brand_voice_keywords.length >= 5 ? "pass" : "fail",
    faq_topic_areas: output.content.faq_topic_areas.length >= 3 ? "pass" : "fail",
    // Señales secundarias: informativas, no cuentan para el umbral.
    logo: opts.logoExtracted ? "pass" : "fail",
    header_style: output.identity.header_style !== "unknown" ? "pass" : "fail",
    brand_voice_descriptor:
      output.content.brand_voice_descriptor.tone_attributes.length >= 2 &&
      output.content.brand_voice_descriptor.communication_style.length >= 1
        ? "pass"
        : "fail",
    google_keyword_signals: output.content.google_keyword_signals.length >= 10 ? "pass" : "fail",
    markets_and_services:
      output.content.markets_and_services.offerings.length > 0 ? "pass" : "fail",
  };

  const passing = PRIMARY_SIGNALS.filter((s) => perFieldStatus[s] === "pass").length;
  return { degraded: passing < 3, perFieldStatus, passingPrimarySignals: passing };
}

/** Sub-tipo empty_extraction (AC-BEX-013.2b): válido estructuralmente pero <2 señales pobladas. */
export function isEmptyExtraction(output: Agent02Output): boolean {
  const populated = [
    output.identity.primary_color_hex !== null,
    (output.identity.secondary_palette?.length ?? 0) > 0,
    output.identity.typography_classification !== null,
    output.content.brand_voice_keywords.length > 0,
    output.content.faq_topic_areas.length > 0,
    output.content.google_keyword_signals.length > 0,
  ].filter(Boolean).length;
  return populated < 2;
}
