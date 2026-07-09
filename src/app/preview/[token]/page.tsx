import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { withSystemContext } from "@/lib/db/tenant-context";
import { isDbConfigured } from "@/lib/db/client";
import { getRenderableByPreviewToken, loadConsultantOverlay } from "@/lib/brandmepage/store";
import { assembleRenderModel } from "@/lib/brandmepage/render-data";
import { BrandMePageView } from "@/components/brandmepage/page-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AC-BPG-011.4: los previews JAMÁS se indexan.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * PreviewLinkService (WO-15, REQ-BPG-011): URL time-limited para Draft/
 * Pending_Approval. Expirado → redirect al claim flow (hoy "/": Stage 2 llega
 * con WO-12/Build 2) — nunca 404 para expirados.
 */
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isDbConfigured()) notFound();

  const data = await withSystemContext("bmp-preview", async () => {
    const { page, expired } = await getRenderableByPreviewToken(token);
    if (expired) return { expired: true as const };
    if (!page) return null;
    const overlay = await loadConsultantOverlay(page.consultantId);
    return { expired: false as const, model: assembleRenderModel(page, overlay, []) };
  });

  if (!data) notFound();
  if (data.expired) redirect("/");
  return <BrandMePageView model={data.model} />;
}
