import { getPublicGenerationBySlug } from "@/lib/db/history";
import { isDbConfigured } from "@/lib/db/client";
import { isStripeConfigured } from "@/lib/stripe/client";
import { buildLlmsMd } from "@/lib/seo/build-llms-md";
import type { PublicDocMeta } from "@/lib/seo/build-public-doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const textResponse = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=300",
    },
  });

/**
 * `llms.txt` por página (markdown) para que los buscadores generativos lean el
 * contenido en texto limpio. Respeta el MISMO gate de publicación que la página
 * pública: con Stripe activo, solo páginas de dueño con suscripción; sin Stripe,
 * cualquier página publicada. No expone borradores.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isDbConfigured()) return textResponse("Not found", 404);

  const enforce = isStripeConfigured();
  try {
    const g = await getPublicGenerationBySlug(slug, enforce);
    if (!g) return textResponse("Not found", 404);

    const rec = g as Partial<{
      whatsapp: string | null;
      keywords: string[] | null;
      faq: { q: string; a: string }[] | null;
    }>;
    const meta: PublicDocMeta = {
      slug: g.slug,
      name: g.name,
      brand: g.brand,
      city: g.city,
      metaTitle: g.metaTitle,
      metaDescription: g.metaDescription,
      screenshot: g.screenshot,
      whatsapp: rec.whatsapp ?? null,
      keywords: rec.keywords ?? null,
      faq: rec.faq ?? null,
    };
    return textResponse(buildLlmsMd(meta));
  } catch {
    return textResponse("Not found", 404);
  }
}
