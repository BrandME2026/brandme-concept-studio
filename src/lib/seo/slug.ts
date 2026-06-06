/**
 * Clave de comparación de marca/ciudad para detectar duplicados: minúsculas, sin
 * acentos y SIN ningún carácter no alfanumérico. Así "McDonald's", "McDonalds" y
 * "mcdonald s" colapsan a "mcdonalds" → se tratan como la misma marca.
 */
export function normalizeKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Convierte texto a slug URL-safe: "Burger King" + "Dallas" → "burger-king-dallas". */
export function slugify(...parts: (string | null | undefined)[]): string {
  const base = parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quitar diacríticos (acentos)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "pagina";
}
