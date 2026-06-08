/**
 * Genera el `llms.txt` por página (markdown) para /p/[slug]/llms.txt. Pensado para que
 * los buscadores generativos (Perplexity, ChatGPT, Claude) lean el contenido de la web
 * en texto limpio en vez de parsear el HTML. Determinista: deriva de los datos en DB
 * (nombre, marca, ciudad, descripción, FAQ, contacto), sin coste de LLM.
 *
 * Reusa el mismo shape `PublicDocMeta` que build-public-doc para no duplicar tipos.
 */
import type { PublicDocMeta } from "./build-public-doc";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function buildLlmsMd(meta: PublicDocMeta): string {
  const name = meta.name?.trim() || meta.brand?.trim() || "BrandME.ai";
  const desc =
    meta.metaDescription?.trim() ||
    (meta.brand ? `${meta.brand}${meta.city ? ` en ${meta.city}` : ""}` : name);
  const canonical = meta.slug ? `${SITE_URL}/p/${meta.slug}` : SITE_URL;

  const lines: string[] = [];
  lines.push(`# ${name}`);
  lines.push("");
  lines.push(`> ${desc}`);
  lines.push("");

  // Datos clave (omite los que no existen).
  const facts: string[] = [];
  if (meta.brand) facts.push(`- Marca: ${meta.brand}`);
  if (meta.city) facts.push(`- Mercado: ${meta.city}`);
  const contact: string[] = [];
  if (meta.whatsapp) contact.push(`WhatsApp ${meta.whatsapp}`);
  if (contact.length) facts.push(`- Contacto: ${contact.join(", ")}`);
  if (meta.keywords?.length) {
    facts.push(`- Palabras clave: ${meta.keywords.filter(Boolean).join(", ")}`);
  }
  if (facts.length) {
    lines.push(...facts);
    lines.push("");
  }

  // FAQ (la señal más útil para GEO/RAG).
  const faq = (meta.faq ?? []).filter((f) => f?.q && f?.a);
  if (faq.length) {
    lines.push("## Preguntas frecuentes");
    lines.push("");
    for (const f of faq) {
      lines.push(`### ${f.q.trim()}`);
      lines.push(f.a.trim());
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(`Página: ${canonical}`);
  lines.push("");

  return lines.join("\n");
}
