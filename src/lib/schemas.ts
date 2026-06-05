import { z } from "zod";

/** Input de URL a extraer. Solo http/https. */
export const urlInputSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Introduce una URL válida")
    .refine(
      (u) => u.startsWith("http://") || u.startsWith("https://"),
      "La URL debe empezar por http:// o https://",
    ),
});

export type UrlInput = z.infer<typeof urlInputSchema>;

/**
 * Salida estructurada que el LLM debe producir (juicio del modelo).
 * La serialización a markdown DESIGN.md la hace código determinista (design-md.ts).
 */
export const designProposalSchema = z.object({
  name: z.string().describe("Nombre del sistema de diseño propuesto"),
  description: z.string().describe("Descripción en una frase de la estética"),
  colors: z.object({
    primary: z.string().describe("Color primario / CTA en hex"),
    canvas: z.string().describe("Fondo principal en hex"),
    ink: z.string().describe("Color de texto principal en hex"),
    accent: z.string().describe("Color de acento en hex"),
  }),
  typography: z.object({
    displayFamily: z.string().describe("Familia para titulares"),
    bodyFamily: z.string().describe("Familia para cuerpo de texto"),
    scale: z
      .array(
        z.object({
          level: z.string(),
          sizePx: z.number(),
          weight: z.number(),
        }),
      )
      .describe("Niveles de la escala tipográfica"),
  }),
  principles: z.array(z.string()).describe("3-5 principios de diseño (do's)"),
  html: z
    .string()
    .describe(
      "Contenido del body de una landing VIVA con Tailwind + animaciones (sin html/head/body). " +
        "Incluye atributos data-aos, animaciones GSAP y componentes interactivos dentro de window.__init__.",
    ),
  interactions: z
    .string()
    .describe(
      "Resumen breve en lenguaje natural de las animaciones e interacciones incluidas (ej: 'hero con fade GSAP, secciones con scroll-reveal, menú móvil y tabs funcionales').",
    ),
});

export type DesignProposal = z.infer<typeof designProposalSchema>;

/** Calidad de generación seleccionable en la UI. */
export const QUALITY_VALUES = ["rapido", "alta"] as const;

/**
 * Validación laxa de los DesignTokens entrantes en /api/generate.
 * Los produce nuestra propia extracción; solo verificamos la forma mínima usada.
 */
export const tokensSchema = z
  .object({
    meta: z.object({ url: z.string() }).loose(),
    colors: z.object({}).loose(),
    typography: z.object({}).loose(),
  })
  .loose();
