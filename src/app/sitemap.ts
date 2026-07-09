import type { MetadataRoute } from "next";
import { isDbConfigured } from "@/lib/db/client";
import { isStripeConfigured } from "@/lib/stripe/client";
import { listAllGenerations } from "@/lib/db/history";
import { withSystemContext } from "@/lib/db/tenant-context";

// Dinámico: lee la URL y la DB en runtime (no horneadas en build-time).
export const dynamic = "force-dynamic";

/** Sitemap: la home + cada página generada pública (/p/[id]). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/webs`, changeFrequency: "weekly", priority: 0.8 },
  ];

  if (isDbConfigured()) {
    try {
      // Mismo gate que /webs y llms.txt: con Stripe activo, no indexar webs impagas.
      const pages = await withSystemContext("sitemap", () =>
        listAllGenerations(200, isStripeConfigured()),
      );
      for (const p of pages) {
        // Image sitemap: solo screenshots servidos por http (Google ignora data-URIs).
        const img = p.screenshot && p.screenshot.startsWith("http") ? [p.screenshot] : undefined;
        entries.push({
          url: `${SITE_URL}/p/${p.slug ?? p.id}`,
          lastModified: new Date(p.createdAt),
          changeFrequency: "monthly",
          priority: 0.6,
          ...(img ? { images: img } : {}),
        });
      }
    } catch {
      // Sin DB o fallo: solo la home. El sitemap nunca rompe el build.
    }
  }

  return entries;
}
