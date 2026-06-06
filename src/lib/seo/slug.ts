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
