import { withSystemContext } from "@/lib/db/tenant-context";
import { isDbConfigured } from "@/lib/db/client";
import { getRenderableBySlugs, loadConsultantOverlay } from "@/lib/brandmepage/store";
import { buildLlmsTxt } from "@/lib/brandmepage/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * llms.txt por página (WO-15, AC-BPG-010.4): retenido por B2A. 404 salvo que
 * la página esté PUBLICADA. Se regenera en cada request (equivale a
 * "regenerado en cada re-render": lee el config activo).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ consultantSlug: string; brandSlug: string }> },
) {
  const { consultantSlug, brandSlug } = await ctx.params;
  if (!isDbConfigured()) return new Response("Not Found", { status: 404 });

  const body = await withSystemContext("bmp-render", async () => {
    const page = await getRenderableBySlugs(consultantSlug, brandSlug);
    if (!page || page.state !== "published") return null;
    const overlay = await loadConsultantOverlay(page.consultantId);
    return buildLlmsTxt(page, overlay);
  });
  if (!body) return new Response("Not Found", { status: 404 });
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
