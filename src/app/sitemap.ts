import type { MetadataRoute } from "next";
import { isDbConfigured } from "@/lib/db/client";
import { listAllGenerations } from "@/lib/db/history";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Sitemap: la home + cada página generada pública (/p/[id]). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
  ];

  if (isDbConfigured()) {
    try {
      const pages = await listAllGenerations(200);
      for (const p of pages) {
        entries.push({
          url: `${SITE_URL}/p/${p.id}`,
          lastModified: new Date(p.createdAt),
          changeFrequency: "monthly",
          priority: 0.6,
        });
      }
    } catch {
      // Sin DB o fallo: solo la home. El sitemap nunca rompe el build.
    }
  }

  return entries;
}
