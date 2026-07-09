import type { RenderablePage } from "./store";
import type { ConsultantOverlay, GeneratedCopy } from "./types";

/**
 * Composición determinista de la página (WO-15, AC-BPG-001.2): resuelve el
 * copy efectivo (overrides live sobre el copy del Agente 04) y qué bloques
 * condicionales se activan. Puro y testeable — el componente React solo pinta
 * este modelo. Un bloque sin condición cumplida se OMITE (sin placeholder),
 * salvo Territory que renderiza en estado pending (AC-BPG-008.4).
 */

export interface EffectiveCopy extends GeneratedCopy {
  overriddenFields: string[];
}

export function applyOverrides(
  copy: GeneratedCopy,
  overrides: Record<string, string>,
): EffectiveCopy {
  const effective: EffectiveCopy = { ...copy, faqs: [...copy.faqs], overriddenFields: [] };
  if (overrides.hero_headline) {
    effective.hero_headline = overrides.hero_headline;
    effective.overriddenFields.push("hero_headline");
  }
  if (overrides.brand_overview) {
    effective.brand_overview = overrides.brand_overview;
    effective.overriddenFields.push("brand_overview");
  }
  if (overrides.value_proposition) {
    effective.value_proposition = overrides.value_proposition.split("\n").filter(Boolean);
    effective.overriddenFields.push("value_proposition");
  }
  for (const [key, value] of Object.entries(overrides)) {
    const faq = /^faq_(question|answer)_(\d+)$/.exec(key);
    if (!faq) continue;
    const idx = Number(faq[2]) - 1;
    if (!effective.faqs[idx]) continue;
    effective.faqs[idx] = {
      ...effective.faqs[idx],
      [faq[1] === "question" ? "question" : "answer"]: value,
    };
    effective.overriddenFields.push(key);
  }
  return effective;
}

const LOOM_RE = /^https:\/\/(www\.)?loom\.com\/(share|embed)\/[\w-]+/;

export interface PortfolioCard {
  brandName: string;
  href: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

export interface RenderModel {
  copy: EffectiveCopy;
  brandName: string;
  identityTokens: RenderablePage["identityTokens"];
  overlay: ConsultantOverlay;
  blocks: {
    loomVideo: boolean; // sección 5, bajo el bio
    credentials: boolean; // sección 5, bajo los social icons
    roiCalculator: boolean; // mid-page: FDD explícito disponible
    territoryPending: boolean; // mid-page: SIEMPRE pending hasta WO-18 (AC-BPG-008.4)
    comparisonCard: boolean; // sección 8: ≥1 otra página publicada
    testimonials: boolean; // sección 9: WO hijo — sin datos aún
    portfolioNav: boolean; // sección 10: ≥1 otra página publicada
  };
  portfolio: PortfolioCard[];
  leadSlug: string; // slug compuesto para leads (AC-BPG-001.4)
}

export function assembleRenderModel(
  page: RenderablePage,
  overlay: ConsultantOverlay,
  portfolio: PortfolioCard[],
): RenderModel {
  const fdd = page.fddFinancialData as Record<string, unknown> | null;
  return {
    copy: applyOverrides(page.generatedCopy, page.overrides),
    brandName: page.brandName,
    identityTokens: page.identityTokens,
    overlay,
    blocks: {
      loomVideo: overlay.loomUrl !== null && LOOM_RE.test(overlay.loomUrl),
      credentials: overlay.credentials.length > 0,
      roiCalculator: fdd !== null && Object.keys(fdd).length > 0,
      territoryPending: true,
      comparisonCard: portfolio.length > 0,
      testimonials: false,
      portfolioNav: portfolio.length > 0,
    },
    portfolio: portfolio.slice(0, 9),
    leadSlug: `${page.consultantSlug}/${page.brandSlug}`,
  };
}
