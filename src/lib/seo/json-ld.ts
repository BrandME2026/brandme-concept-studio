/**
 * Serializa un objeto a JSON-LD seguro para incrustar en <script type="application/ld+json">.
 * Neutraliza los caracteres que podrían cerrar el <script> o romper el parser (`<`, `>`, `&`,
 * U+2028/U+2029). Úsalo SIEMPRE que el JSON contenga datos no constantes (nombres de la DB, etc.).
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (c) =>
    "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
