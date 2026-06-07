import { getPublicGenerationBySlug, getPublicGeneration } from "@/lib/db/history";
import { getPublicConversationBySlug, getPublicConversationPage } from "@/lib/db/conversations";
import { isDbConfigured } from "@/lib/db/client";
import { buildPublicDoc, type PublicDocMeta } from "@/lib/seo/build-public-doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CSP: el HTML lo genera un LLM (no es de confianza) y se sirve en el origen de la app.
// `sandbox allow-scripts` fuerza un ORIGEN OPACO: los scripts del HTML SÍ corren (animaciones
// GSAP/AOS) pero NO pueden leer cookies/localStorage/DOM de la app — aísla el XSS aunque sea
// el mismo dominio. allow-popups para que los CTAs/enlaces puedan abrir. Sin allow-same-origin
// (a propósito): es lo que neutraliza el robo de sesión.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https://cdn.tailwindcss.com",
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox",
].join("; ");

const htmlResponse = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "cache-control": "public, max-age=300",
    },
  });

const notFound = () =>
  htmlResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>404</title></head><body style="font-family:sans-serif;padding:4rem;text-align:center"><h1>Página no encontrada</h1><p><a href="/">Volver a Francast.ai</a></p></body></html>`,
    404,
  );

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Sirve la página generada como documento HTML indexable e independiente. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isDbConfigured()) return notFound();

  try {
    // 1) Buscar por slug (en generations y conversations).
    const bySlug =
      (await getPublicGenerationBySlug(slug)) ?? (await getPublicConversationBySlug(slug));
    if (bySlug) {
      const g = bySlug as Partial<{
        whatsapp: string | null;
        keywords: string[] | null;
        faq: { q: string; a: string }[] | null;
        css: string | null;
      }>;
      const meta: PublicDocMeta = {
        slug: bySlug.slug,
        name: bySlug.name,
        brand: bySlug.brand,
        city: bySlug.city,
        metaTitle: bySlug.metaTitle,
        metaDescription: bySlug.metaDescription,
        screenshot: bySlug.screenshot,
        whatsapp: g.whatsapp ?? null,
        keywords: g.keywords ?? null,
        faq: g.faq ?? null,
        css: g.css ?? null,
      };
      return htmlResponse(buildPublicDoc(bySlug.html, meta));
    }

    // 2) Fallback: entró por UUID viejo. Redirigir al slug si existe, o servir directo.
    if (isUuid(slug)) {
      const gen = await getPublicGeneration(slug);
      if (gen?.slug) {
        return Response.redirect(
          `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/p/${gen.slug}`,
          301,
        );
      }
      const rec = gen ?? (await getPublicConversationPage(slug));
      if (rec) {
        return htmlResponse(
          buildPublicDoc(rec.html, {
            slug: null,
            name: rec.name,
            brand: null,
            city: null,
            metaTitle: null,
            metaDescription: null,
            screenshot: null,
          }),
        );
      }
    }

    return notFound();
  } catch (err) {
    console.error("[p/slug] fallo sirviendo página", err);
    return notFound();
  }
}
