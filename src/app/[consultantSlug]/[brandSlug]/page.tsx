import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withSystemContext } from "@/lib/db/tenant-context";
import { isDbConfigured } from "@/lib/db/client";
import {
  getPortfolioPages,
  getRenderableBySlugs,
  loadConsultantOverlay,
  type RenderablePage,
} from "@/lib/brandmepage/store";
import { assembleRenderModel, type RenderModel } from "@/lib/brandmepage/render-data";
import { buildJsonLd, pageTitle, pageUrl } from "@/lib/brandmepage/seo";
import type { ConsultantOverlay } from "@/lib/brandmepage/types";
import { BrandMePageView } from "@/components/brandmepage/page-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PageRenderService (WO-15): la BrandMePage pública en
 * /[consultantSlug]/[brandSlug]. SSR completo: secciones en orden canónico
 * (AC-BPG-001.2), metadata + JSON-LD en el HTML crudo (ADR-003). Draft/
 * pending/offline → 404 para el público (el preview va por /preview/[token]).
 */

interface Params {
  params: Promise<{ consultantSlug: string; brandSlug: string }>;
}

async function loadPublished(
  consultantSlug: string,
  brandSlug: string,
): Promise<{ page: RenderablePage; overlay: ConsultantOverlay; model: RenderModel } | null> {
  if (!isDbConfigured()) return null;
  return withSystemContext("bmp-render", async () => {
    const page = await getRenderableBySlugs(consultantSlug, brandSlug);
    if (!page || page.state !== "published") return null;
    const overlay = await loadConsultantOverlay(page.consultantId);
    const portfolio = (await getPortfolioPages(page.consultantId, page.id)).map((p) => ({
      brandName: p.brandName,
      href: `/${p.consultantSlug}/${p.brandSlug}`,
      logoUrl: p.logoUrl,
      primaryColor: p.primaryColor,
    }));
    return { page, overlay, model: assembleRenderModel(page, overlay, portfolio) };
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { consultantSlug, brandSlug } = await params;
  const data = await loadPublished(consultantSlug, brandSlug);
  if (!data) return {};
  const title = pageTitle(data.page.brandName, data.overlay.name);
  const description = data.model.copy.meta_description;
  const url = pageUrl(data.page);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      ...(data.overlay.headshotUrl ? { images: [data.overlay.headshotUrl] } : {}),
    },
    alternates: { canonical: url },
  };
}

export default async function BrandMePage({ params }: Params) {
  const { consultantSlug, brandSlug } = await params;
  const data = await loadPublished(consultantSlug, brandSlug);
  if (!data) notFound();

  const jsonLd = buildJsonLd(data.page, data.overlay);
  return (
    <>
      {/* JSON-LD server-side (ADR-003): presente en el HTML crudo. El escape
          de "<" impide que un string con "</script>" rompa el tag (XSS). */}
      {jsonLd.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block).replaceAll("<", "\\u003c") }}
        />
      ))}
      <BrandMePageView model={data.model} />
    </>
  );
}
