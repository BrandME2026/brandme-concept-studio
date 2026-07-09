import { isDbConfigured } from "@/lib/db/client";
import { isStripeConfigured } from "@/lib/stripe/client";
import { listAllGenerations } from "@/lib/db/history";
import { withSystemContext } from "@/lib/db/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const MAX = 200;

/**
 * `llms.txt` global (https://llmstxt.org): guía para buscadores generativos. Lista las
 * páginas publicadas con enlace a su versión markdown (/p/slug/llms.txt). Respeta el
 * gate de publicación. Degrada a solo el encabezado si no hay DB.
 */
export async function GET() {
  const lines: string[] = [
    "# BrandME.ai",
    "",
    "> BrandME.ai genera una página web completa para cada marca de franquicia: SEO local, AMA y captación de leads. Las páginas publicadas se listan abajo.",
    "",
    `## Páginas`,
    "",
  ];

  if (isDbConfigured()) {
    try {
      const pages = await withSystemContext("llms-txt", () =>
        listAllGenerations(MAX, isStripeConfigured()),
      );
      for (const p of pages) {
        const slug = p.slug ?? p.id;
        const url = `${SITE_URL}/p/${slug}`;
        lines.push(`- [${p.name ?? slug}](${url}): ${url}/llms.txt`);
      }
      if (pages.length >= MAX) {
        lines.push("", `_(mostrando las ${MAX} más recientes)_`);
      }
    } catch {
      // Sin DB o fallo: solo el encabezado. Nunca rompe.
    }
  }

  lines.push("", "## Enlaces", "", `- [Inicio](${SITE_URL})`, `- [Galería](${SITE_URL}/webs)`, "");

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
