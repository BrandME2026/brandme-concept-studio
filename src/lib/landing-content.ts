/**
 * Contenido de la landing de marketing (BrandME.ai). Arrays tipados: las claves i18n
 * (`*Key`) se traducen al renderizar; los literales (marcas, consultores, dominios,
 * números) son contenido de marketing del artifact y no se traducen. Mismo patrón que
 * INVESTOR_PROFILES en onboarding.ts.
 */

import type { TranslationKey } from "@/lib/i18n/es";

// ── Stats band ──────────────────────────────────────────────────────────────
export interface StatItem {
  /** Texto mostrado cuando NO se anima (ej. "<5 min", "24/7"). */
  display?: string;
  /** Valor final del contador (si animated). */
  value?: number;
  suffix?: string;
  labelKey: TranslationKey;
  animated: boolean;
}

export const STATS: StatItem[] = [
  { value: 64, labelKey: "ll.stats.seoPages", animated: true },
  { display: "<5 min", labelKey: "ll.stats.leadResponse", animated: false },
  { value: 96, labelKey: "ll.stats.brands", animated: true },
  { display: "24/7", labelKey: "ll.stats.coverage", animated: false },
];

// ── Comparativa ─────────────────────────────────────────────────────────────
export const COMPARISON_OLD: TranslationKey[] = [
  "ll.compare.old.1",
  "ll.compare.old.2",
  "ll.compare.old.3",
  "ll.compare.old.4",
  "ll.compare.old.5",
  "ll.compare.old.6",
];

export const COMPARISON_NEW: TranslationKey[] = [
  "ll.compare.new.1",
  "ll.compare.new.2",
  "ll.compare.new.3",
  "ll.compare.new.4",
  "ll.compare.new.5",
  "ll.compare.new.6",
];

// ── Agentes ─────────────────────────────────────────────────────────────────
export interface Agent {
  number: string; // "01"
  titleKey: TranslationKey;
  descKey: TranslationKey;
}

export const AGENTS: Agent[] = [
  { number: "01", titleKey: "ll.agents.1.title", descKey: "ll.agents.1.desc" },
  { number: "02", titleKey: "ll.agents.2.title", descKey: "ll.agents.2.desc" },
  { number: "03", titleKey: "ll.agents.3.title", descKey: "ll.agents.3.desc" },
  { number: "04", titleKey: "ll.agents.4.title", descKey: "ll.agents.4.desc" },
  { number: "05", titleKey: "ll.agents.5.title", descKey: "ll.agents.5.desc" },
  { number: "06", titleKey: "ll.agents.6.title", descKey: "ll.agents.6.desc" },
  { number: "07", titleKey: "ll.agents.7.title", descKey: "ll.agents.7.desc" },
];

export const AGENT_STEPS: TranslationKey[] = [
  "ll.agents.step1",
  "ll.agents.step2",
  "ll.agents.step3",
];

// ── Pricing (TODO cliente: precios reales) ──────────────────────────────────
export interface PricingTier {
  nameKey: TranslationKey;
  priceKey: TranslationKey;
  descKey: TranslationKey;
  ctaKey: TranslationKey;
  featureKeys: TranslationKey[];
  highlighted: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    nameKey: "ll.pricing.starter.name",
    priceKey: "ll.pricing.starter.price",
    descKey: "ll.pricing.starter.desc",
    ctaKey: "ll.pricing.starter.cta",
    featureKeys: ["ll.pricing.feat.seo", "ll.pricing.feat.ama", "ll.pricing.feat.leads"],
    highlighted: false,
  },
  {
    nameKey: "ll.pricing.growth.name",
    priceKey: "ll.pricing.growth.price",
    descKey: "ll.pricing.growth.desc",
    ctaKey: "ll.pricing.growth.cta",
    featureKeys: [
      "ll.pricing.feat.seo",
      "ll.pricing.feat.ama",
      "ll.pricing.feat.agents",
      "ll.pricing.feat.leads",
    ],
    highlighted: true,
  },
  {
    nameKey: "ll.pricing.portfolio.name",
    priceKey: "ll.pricing.portfolio.price",
    descKey: "ll.pricing.portfolio.desc",
    ctaKey: "ll.pricing.portfolio.cta",
    featureKeys: [
      "ll.pricing.feat.seo",
      "ll.pricing.feat.ama",
      "ll.pricing.feat.agents",
      "ll.pricing.feat.leads",
      "ll.pricing.feat.support",
    ],
    highlighted: false,
  },
];

// ── FAQ (TODO cliente: validar) ─────────────────────────────────────────────
export interface FaqItem {
  qKey: TranslationKey;
  aKey: TranslationKey;
}

export const FAQ_ITEMS: FaqItem[] = [
  { qKey: "ll.faq.q1", aKey: "ll.faq.a1" },
  { qKey: "ll.faq.q2", aKey: "ll.faq.a2" },
  { qKey: "ll.faq.q3", aKey: "ll.faq.a3" },
  { qKey: "ll.faq.q4", aKey: "ll.faq.a4" },
  { qKey: "ll.faq.q5", aKey: "ll.faq.a5" },
];
