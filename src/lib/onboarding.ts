/**
 * Onboarding conversacional (wizard determinista, sin LLM). Define los pasos, las
 * opciones y la serialización del brief que se inyecta en el studio. El único uso de
 * IA del flujo es /api/resolve (marca → URL oficial), invocado desde onboarding-chat.
 */

import type { TranslationKey } from "@/lib/i18n/es";

export const BRANDS = [
  "Burger King",
  "Anytime Fitness",
  "Great Clips",
  "Jersey Mike's",
  "Orangetheory",
  "Domino's",
] as const;

/**
 * Perfiles de inversor. `value` es el valor canónico (en inglés) que viaja al brief del
 * LLM; `labelKey` es la clave i18n que se muestra traducida en la UI.
 */
export const INVESTOR_PROFILES = [
  { value: "First-time owner", labelKey: "investor.firstTime" },
  { value: "Multi-unit operator", labelKey: "investor.multiUnit" },
  { value: "Family-business successor", labelKey: "investor.successor" },
  { value: "Mix of all three", labelKey: "investor.mix" },
] as const;

export interface OnboardingAnswers {
  nameAndFirm: string;
  brands: string[];
  /** Marca a lanzar primero = la web que se clona en el studio. */
  firstBrand: string;
  markets: string;
  investorProfile: string;
  positioning: string;
}

export type StepKey =
  | "name"
  | "brand"
  | "first"
  | "markets"
  | "investor"
  | "positioning"
  | "confirm";

/**
 * Cada paso lleva CLAVES i18n (no texto). El componente las traduce con t(). El paso
 * "first" es condicional: solo se muestra si se eligió más de una marca.
 */
export type Step =
  | {
      key: StepKey;
      kind: "text";
      questionKey: TranslationKey;
      placeholderKey: TranslationKey;
      minLength?: number;
    }
  | { key: StepKey; kind: "single"; questionKey: TranslationKey }
  | { key: StepKey; kind: "multi"; questionKey: TranslationKey; options: readonly string[] }
  | { key: "confirm"; kind: "confirm"; questionKey: TranslationKey };

export const STEPS: Step[] = [
  {
    key: "name",
    kind: "text",
    questionKey: "onboarding.step.name",
    placeholderKey: "onboarding.step.name.placeholder",
  },
  {
    key: "brand",
    kind: "multi",
    questionKey: "onboarding.step.brand",
    options: BRANDS,
  },
  {
    key: "first",
    kind: "single",
    questionKey: "onboarding.step.first",
  },
  {
    key: "markets",
    kind: "text",
    questionKey: "onboarding.step.markets",
    placeholderKey: "onboarding.step.markets.placeholder",
  },
  {
    key: "investor",
    kind: "single",
    questionKey: "onboarding.step.investor",
  },
  {
    key: "positioning",
    kind: "text",
    questionKey: "onboarding.step.positioning",
    placeholderKey: "onboarding.step.positioning.placeholder",
    minLength: 20,
  },
  {
    key: "confirm",
    kind: "confirm",
    questionKey: "onboarding.step.confirm",
  },
];

/** Acciones prometidas tras "Yes, ship it", como claves i18n (en orden de visualización). */
export const CONFIRM_ACTION_KEYS: TranslationKey[] = [
  "onboarding.confirm.fdd",
  "onboarding.confirm.page",
  "onboarding.confirm.seo",
  "onboarding.confirm.ama",
  "onboarding.confirm.cockpit",
];

/** Clave de sessionStorage para pasar el brief al studio sin exponer datos en la URL. */
export const BRIEF_STORAGE_KEY = "brandme:onboarding-brief";

/**
 * Serializa las respuestas a un brief en lenguaje natural. Es contexto para el LLM de
 * generación, por eso va en inglés (consistente con las preguntas).
 */
export function buildBrief(a: OnboardingAnswers): string {
  const otherBrands = a.brands.filter((b) => b !== a.firstBrand);
  const lines = [
    "Client onboarding:",
    `- Name & firm: ${a.nameAndFirm}`,
    `- Brand to launch first: ${a.firstBrand}`,
    otherBrands.length ? `- Other brands in their portfolio: ${otherBrands.join(", ")}` : "",
    `- Target markets: ${a.markets}`,
    `- Ideal investor profile: ${a.investorProfile}`,
    `- Differentiated positioning: ${a.positioning}`,
  ];
  return lines.filter(Boolean).join("\n");
}
