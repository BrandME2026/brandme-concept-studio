import type { MetadataRoute } from "next";

// Dinámico: lee la URL en runtime (la env de Railway puede no estar en build-time).
export const dynamic = "force-dynamic";

/**
 * CrawlerPolicyHandler (WO-11, REQ-PF-011): política de acceso de AI crawlers.
 * - ALLOW a los crawlers de AI-SEARCH (retrieval): son los que ponen las
 *   BrandMePages delante de prospectos en ChatGPT/Perplexity/Claude/Copilot.
 *   Bingbot JAMÁS va en la disallow list: alimenta el índice de Bing que
 *   groundea SearchGPT y Copilot — bloquearlo borra ambas superficies
 *   (AC-PF-011.1, decisión explícita del requirement).
 * - DISALLOW a los crawlers de AI-TRAINING (AC-PF-011.2).
 * - Directiva Sitemap → SitemapService (AC-PF-011.3).
 * AC-PF-011.4 (verificar user-agents contra las listas publicadas de cada
 * vendor en staging) es gate humano del kickoff de Build 4.
 */

const AI_SEARCH_CRAWLERS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-User",
  "Claude-SearchBot",
  "Applebot",
  "Bingbot",
];

const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Meta-ExternalAgent",
  "Bytespider",
];

// Conversaciones, historial, leads y embeds son privados/funcionales; no indexar.
const PRIVATE_PATHS = ["/c/", "/historial", "/leads", "/embed/", "/api/"];

export default function robots(): MetadataRoute.Robots {
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    rules: [
      { userAgent: AI_SEARCH_CRAWLERS, allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: AI_TRAINING_CRAWLERS, disallow: "/" },
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
