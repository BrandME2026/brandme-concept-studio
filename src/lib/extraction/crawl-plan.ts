import type { ScrapedLink, ScrapedPage } from "./types";

/**
 * Planificación pura del crawl (WO-13): scoring/priorización de links internos
 * (AC-BEX-001.1 About/FAQ/Locations/Investor; AC-BEX-014.1 franchise-intent
 * como página prioritaria) y truncado del contenido al límite configurado
 * (AC-BEX-001.4: se CONSERVA en orden de prioridad franchise-dev → homepage →
 * resto; lo que excede el límite se corta del final).
 */

const FRANCHISE_SIGNALS = [
  "franchise",
  "franchising",
  "franchise opportunity",
  "own a franchise",
  "become an owner",
  "franquicia",
  "franquicias",
];

const PRIORITY_SECTIONS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /about|nosotros|quienes/i, score: 40 },
  { pattern: /faq|preguntas|frequently/i, score: 40 },
  { pattern: /location|ubicacion|sucursal/i, score: 30 },
  { pattern: /invest|investor/i, score: 35 },
];

function isInternal(href: string, origin: string): boolean {
  try {
    const url = new URL(href, origin);
    return url.origin === origin && !/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function franchiseScore(link: ScrapedLink, path: string): number {
  const haystack = `${link.text} ${path}`.toLowerCase();
  return FRANCHISE_SIGNALS.some((s) => haystack.includes(s)) ? 100 : 0;
}

export interface CrawlPlan {
  /** URLs internas a visitar además de la homepage, ya priorizadas. */
  additionalUrls: string[];
  /** URL de franchise development detectada (AC-BEX-014.1) o null. */
  franchiseDevUrl: string | null;
}

/**
 * Elige hasta `maxPages - 1` páginas internas adicionales desde los links de
 * la homepage. Franchise-intent gana siempre; luego About/FAQ/Locations/
 * Investor; los empates conservan el orden del documento. Dedup por URL
 * normalizada (sin hash) y nunca re-incluye la homepage.
 */
export function planCrawl(homepage: ScrapedPage, maxPages: number): CrawlPlan {
  const origin = new URL(homepage.finalUrl).origin;
  const homePath = new URL(homepage.finalUrl).pathname;

  const seen = new Set<string>([homePath]);
  const scored: Array<{ url: string; score: number; order: number }> = [];
  let franchiseDevUrl: string | null = null;

  homepage.links.forEach((link, order) => {
    if (!isInternal(link.href, origin)) return;
    const url = new URL(link.href, origin);
    url.hash = "";
    const key = url.pathname + url.search;
    if (seen.has(key)) return;
    seen.add(key);

    const fScore = franchiseScore(link, url.pathname);
    const sScore = PRIORITY_SECTIONS.reduce(
      (acc, { pattern, score }) =>
        pattern.test(`${link.text} ${url.pathname}`) ? Math.max(acc, score) : acc,
      0,
    );
    const score = Math.max(fScore, sScore);
    if (fScore > 0 && !franchiseDevUrl) franchiseDevUrl = url.toString();
    if (score > 0 || scored.length < 50) scored.push({ url: url.toString(), score, order });
  });

  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return {
    additionalUrls: scored.slice(0, Math.max(0, maxPages - 1)).map((s) => s.url),
    franchiseDevUrl,
  };
}

/**
 * Trunca el contenido total al límite: se conserva primero la página de
 * franchise development, luego la homepage, luego el resto en orden de scrape;
 * la página que excede el presupuesto se recorta y las siguientes se
 * descartan. Devuelve las páginas en su ORDEN ORIGINAL con el texto recortado.
 */
export function truncateToBudget(
  pages: ScrapedPage[],
  franchiseDevUrl: string | null,
  maxBytes: number,
): { pages: ScrapedPage[]; truncated: boolean } {
  const priority = [...pages].sort((a, b) => rank(a) - rank(b));
  function rank(p: ScrapedPage): number {
    if (franchiseDevUrl && p.url === franchiseDevUrl) return 0;
    return p === pages[0] ? 1 : 2 + pages.indexOf(p);
  }

  let budget = maxBytes;
  let truncated = false;
  const keptText = new Map<ScrapedPage, string>();
  for (const page of priority) {
    const size = Buffer.byteLength(page.text, "utf8");
    if (size <= budget) {
      keptText.set(page, page.text);
      budget -= size;
    } else if (budget > 0) {
      keptText.set(page, Buffer.from(page.text, "utf8").subarray(0, budget).toString("utf8"));
      budget = 0;
      truncated = true;
    } else {
      truncated = true;
    }
  }

  return {
    pages: pages
      .filter((p) => keptText.has(p))
      .map((p) => ({ ...p, text: keptText.get(p)! })),
    truncated,
  };
}
