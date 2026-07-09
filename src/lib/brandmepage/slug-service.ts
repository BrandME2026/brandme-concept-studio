import { getConfigValue } from "@/lib/config/config-store";

/**
 * SlugService (WO-15, REQ-BPG-012): consultant-slug estable por consultant
 * (lowercase, guiones, transliterado) chequeado contra la lista RESERVADA de
 * ConfigStore y contra slugs existentes; brand-slug único por portafolio del
 * consultant (no global). Zone-slugs (AC-BPG-012.4) son scope de Agent 05/WO-17.
 */

export function toSlug(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacríticos → ASCII
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
  return base || "consultant";
}

export async function reservedSlugs(): Promise<Set<string>> {
  const list = await getConfigValue<string[]>("brandmepage", "reserved_slugs", []);
  return new Set(list.map((s) => s.toLowerCase()));
}

/**
 * Resuelve un slug único: si el candidato está reservado o tomado, añade
 * sufijo numérico (-2, -3, …) hasta encontrar uno libre (AC-BPG-004.2/012.1).
 */
export async function resolveUniqueSlug(
  name: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const reserved = await reservedSlugs();
  const base = toSlug(name);
  for (let n = 1; n <= 200; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (reserved.has(candidate)) continue;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Salida de emergencia determinista-suficiente (colisión masiva improbable).
  return `${base}-${Date.now().toString(36)}`;
}
