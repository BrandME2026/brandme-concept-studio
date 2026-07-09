import { getConfigValue } from "@/lib/config/config-store";

/**
 * ContentQualityFilter — núcleo de escaneo (WO-15, AC-BPG-016.1): case-
 * insensitive, palabra completa (con variantes de borde) y wildcards de
 * prefijo ("bad*" matchea "bad", "badly", "badness"). Los términos multi-
 * palabra matchean como frase. La lista vive en ConfigStore
 * (brandmepage.disallowed_terms) — editable sin deploy, invisible al consultant.
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termToRegex(term: string): RegExp {
  const trimmed = term.trim().toLowerCase();
  if (trimmed.endsWith("*")) {
    // Prefijo: borde de palabra al inicio, cualquier cola de letras.
    return new RegExp(`\\b${escapeRegex(trimmed.slice(0, -1))}[\\p{L}\\p{N}]*`, "iu");
  }
  return new RegExp(`\\b${escapeRegex(trimmed)}\\b`, "iu");
}

/** Términos de la lista presentes en el contenido (vacío = limpio). */
export function scanForDisallowedTerms(content: string, terms: string[]): string[] {
  return terms.filter((t) => t.trim() && termToRegex(t).test(content));
}

export async function disallowedTermsList(): Promise<string[]> {
  return getConfigValue<string[]>("brandmepage", "disallowed_terms", []);
}
