import type { RenderablePage } from "./store";
import type { ConsultantOverlay } from "./types";

/**
 * Builders SEO puros del Agente 04 (WO-15, REQ-BPG-010): title formula,
 * meta/OG, JSON-LD server-side (ProfessionalService + sameAs, BreadcrumbList,
 * Person con byline — AC-BPG-010.5) y llms.txt por página. Todo se emite en el
 * HTML crudo del server (ADR-003) — jamás client-injected.
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://getbrandme.ai";

export function pageUrl(page: Pick<RenderablePage, "consultantSlug" | "brandSlug">): string {
  return `${BASE_URL}/${page.consultantSlug}/${page.brandSlug}`;
}

/** AC-BPG-010.1: '[Brand] Franchise Opportunity — [Consultant] | BrandMe'. */
export function pageTitle(brandName: string, consultantName: string): string {
  return `${brandName} Franchise Opportunity — ${consultantName} | BrandMe`;
}

export function buildJsonLd(
  page: RenderablePage,
  overlay: ConsultantOverlay,
): Array<Record<string, unknown>> {
  const url = pageUrl(page);
  const sameAs = page.sameAsUrls ?? [];
  const professionalService: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: pageTitle(page.brandName, overlay.name),
    url,
    ...(sameAs.length ? { sameAs } : {}),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: overlay.name,
        item: `${BASE_URL}/${page.consultantSlug}`,
      },
      { "@type": "ListItem", position: 2, name: page.brandName, item: url },
    ],
  };
  // Person + autoría (AC-BPG-010.5): YMYL — autor nombrado con credenciales.
  const person: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: overlay.name,
    jobTitle: "Franchise Consultant",
    ...(overlay.credentials.length ? { hasCredential: overlay.credentials } : {}),
    ...(overlay.socialLinks.linkedin ? { sameAs: [overlay.socialLinks.linkedin] } : {}),
  };
  professionalService.author = { "@type": "Person", name: overlay.name };
  return [professionalService, breadcrumb, person];
}

/** AC-BPG-010.4: llms.txt por página (retenido por B2A; prioridad mínima). */
export function buildLlmsTxt(page: RenderablePage, overlay: ConsultantOverlay): string {
  const url = pageUrl(page);
  const lines = [
    `# ${page.brandName} Franchise Opportunity — ${overlay.name}`,
    "",
    `> ${page.generatedCopy.meta_description}`,
    "",
    "## Enlaces",
    "",
    `- [BrandMePage](${url})`,
    `- [Plataforma BrandMe](${BASE_URL}/llms.txt)`,
  ];
  for (const sameAs of page.sameAsUrls ?? []) {
    lines.push(`- [Referencia de la marca](${sameAs})`);
  }
  return lines.join("\n") + "\n";
}
