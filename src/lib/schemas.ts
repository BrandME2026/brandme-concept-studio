import { z } from "zod";

/** Input de URL a extraer. Solo http/https. */
export const urlInputSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2048)
    .url("Introduce una URL válida")
    .refine(
      (u) => u.startsWith("http://") || u.startsWith("https://"),
      "La URL debe empezar por http:// o https://",
    ),
});

export type UrlInput = z.infer<typeof urlInputSchema>;

/** Input del resolver: texto libre (nombre de cadena o URL). */
export const resolveInputSchema = z.object({
  query: z.string().trim().min(2, "Escribe al menos 2 caracteres").max(200),
});

export type ResolveInput = z.infer<typeof resolveInputSchema>;

/**
 * ¿El texto ya parece una URL/dominio? (http(s):// o "algo.tld").
 * Si lo es, saltamos la resolución por LLM y usamos el flujo de extracción directo.
 */
export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) return true;
  // dominio sin esquema: sin espacios y con un TLD de letras (ej. nike.com, sub.dominio.io)
  return /^[^\s/]+\.[a-z]{2,}([/?#].*)?$/i.test(s);
}

/**
 * Salida estructurada que el LLM produce al resolver una marca → dominio oficial.
 * Solo el host (sin esquema); nosotros construimos https://. confidence "low" => no resuelto.
 */
export const resolveResultSchema = z.object({
  brand: z.string().describe("Nombre canónico de la marca/cadena identificada"),
  domain: z
    .string()
    .describe("Dominio del sitio OFICIAL, solo host sin http (ej. www.starbucks.com)"),
  confidence: z
    .enum(["high", "low"])
    .describe("high si estás seguro del dominio oficial; low si no"),
});

export type ResolveResult = z.infer<typeof resolveResultSchema>;

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
  seo: z
    .object({
      metaTitle: z
        .string()
        .describe("Title SEO ≤60 chars con marca + ciudad, ej. 'Abre tu Burger King en Dallas'"),
      metaDescription: z
        .string()
        .describe("Meta description ≤155 chars, persuasiva, con marca + ciudad + beneficio"),
      keywords: z
        .array(z.string())
        .describe("5-8 keywords locales, ej. 'franquicia Burger King Dallas', 'abrir BK Texas'"),
    })
    .describe("Metadatos SEO para el <head> de la página pública"),
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
