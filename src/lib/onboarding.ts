/**
 * Onboarding conversacional (wizard determinista, sin LLM). Define los pasos, las
 * opciones y la serialización del brief que se inyecta en el studio. El único uso de
 * IA del flujo es /api/resolve (marca → URL oficial), invocado desde onboarding-chat.
 */

export const BRANDS = [
  "Burger King",
  "Anytime Fitness",
  "Great Clips",
  "Jersey Mike's",
  "Orangetheory",
  "Domino's",
] as const;

export const INVESTOR_PROFILES = [
  "First-time owner",
  "Multi-unit operator",
  "Family-business successor",
  "Mix of all three",
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

export type Step =
  | {
      key: StepKey;
      kind: "text";
      question: string;
      placeholder: string;
      minLength?: number;
    }
  | { key: StepKey; kind: "single"; question: string; options: readonly string[] }
  | { key: StepKey; kind: "multi"; question: string; options: readonly string[] }
  | { key: "confirm"; kind: "confirm"; question: string };

/**
 * Pasos del wizard (en inglés, literal según el cliente). El paso "first" es
 * condicional: solo se muestra si se eligió más de una marca (lo decide el componente).
 */
export const STEPS: Step[] = [
  {
    key: "name",
    kind: "text",
    question: "What's your name and firm?",
    placeholder: "e.g. Shawn Whitaker, Whitaker Franchise",
  },
  {
    key: "brand",
    kind: "multi",
    question: "Which franchise brand do you want to launch first?",
    options: BRANDS,
  },
  {
    key: "first",
    kind: "single",
    question: "Which one do we launch first?",
    options: [], // se rellena en runtime con las marcas seleccionadas
  },
  {
    key: "markets",
    kind: "text",
    question: "Which markets do you focus on for that brand?",
    placeholder: "e.g. Dallas, Plano, Frisco",
  },
  {
    key: "investor",
    kind: "single",
    question: "What kind of investor profile is your sweet spot?",
    options: INVESTOR_PROFILES,
  },
  {
    key: "positioning",
    kind: "text",
    question: "What's your positioning? What do you sell that nobody else does?",
    placeholder: "e.g. Texas-only, owner-operator-first, operations-led",
    minLength: 20,
  },
  {
    key: "confirm",
    kind: "confirm",
    question: "Here's what happens next:",
  },
];

/** Lo que el agente promete hacer tras "Yes, ship it" (mostrado en el paso de confirmación). */
export const CONFIRM_ACTIONS = [
  "Pull the FDD for the brand",
  "Generate your franchise landing page",
  "Spin up 100 SEO pages",
  "Train an AMA agent on your offer",
  "Set up your operations cockpit",
] as const;

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
