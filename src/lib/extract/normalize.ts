/**
 * Utilidades puras de normalización de valores CSS computados.
 * El extractor del navegador produce strings crudos (rgb(), px, font-family);
 * aquí los llevamos a una forma canónica para el ranking de tokens.
 */

/** Convierte un color CSS (rgb/rgba/hex) a hex #rrggbb en minúsculas. null si no parseable. */
export function rgbToHex(color: string): string | null {
  const c = color.trim();
  if (!c || c === "transparent") return null;

  // Hex existente (#fff o #aabbcc)
  if (c.startsWith("#")) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      return "#" + hex.split("").map((ch) => ch + ch).join("").toLowerCase();
    }
    if (hex.length === 6) return ("#" + hex).toLowerCase();
    return null;
  }

  const match = c.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;

  const parts = match[1].split(",").map((p) => parseFloat(p.trim()));
  const [r, g, b] = parts;
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;

  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return ("#" + toHex(r) + toHex(g) + toHex(b)).toLowerCase();
}

/** ¿El color es visible (no transparente ni alfa 0)? */
export function isVisibleColor(color: string): boolean {
  const c = color.trim();
  if (!c || c === "transparent") return false;
  const match = c.match(/rgba?\(([^)]+)\)/);
  if (match) {
    const parts = match[1].split(",").map((p) => parseFloat(p.trim()));
    if (parts.length === 4 && parts[3] === 0) return false;
  }
  return true;
}

/** Extrae el número de un valor en px. null si la unidad no es px. */
export function parsePx(value: string): number | null {
  const m = value.trim().match(/^(-?\d*\.?\d+)px$/);
  return m ? parseFloat(m[1]) : null;
}

/** Primera familia de una font-family list, sin comillas. */
export function normalizeFamily(fontFamily: string): string {
  const first = fontFamily.split(",")[0].trim();
  return first.replace(/^["']|["']$/g, "");
}
