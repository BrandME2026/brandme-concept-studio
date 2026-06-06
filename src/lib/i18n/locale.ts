/** Idiomas soportados por la app. Alineado con el `Language` del LLM (ai/prompts.ts). */
export type Locale = "es" | "en";

export const LOCALES: readonly Locale[] = ["es", "en"];
export const DEFAULT_LOCALE: Locale = "es";

/** Cookie de preferencia de idioma. NO httpOnly: el cliente la reescribe al cambiar. */
export const LOCALE_COOKIE = "bmc_locale";

export function isLocale(value: string | undefined): value is Locale {
  return value === "es" || value === "en";
}

/**
 * Resuelve el idioma inicial en el servidor: la cookie manda; si no hay, se mira
 * el Accept-Language del navegador (es-* → es, resto → en). Fallback a DEFAULT_LOCALE.
 */
export function resolveInitialLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  const al = (acceptLanguage ?? "").trim().toLowerCase();
  if (al.startsWith("es")) return "es";
  if (al) return "en";
  return DEFAULT_LOCALE;
}
