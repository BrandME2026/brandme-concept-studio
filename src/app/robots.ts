import type { MetadataRoute } from "next";

// Dinámico: lee la URL en runtime (la env de Railway puede no estar en build-time).
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Conversaciones e historial son privados; no indexar.
      disallow: ["/c/", "/historial", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
