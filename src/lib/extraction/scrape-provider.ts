import { chromium, type Browser } from "playwright";
import { isBlockedHost, assertSafeUrl } from "@/lib/extract/ssrf-guard";
import { fetchImageDataUri } from "@/lib/extract/extract-design";
import { scrapeFromDom } from "./scrape-script";
import type { ScrapedPage, ScrapeProvider } from "./types";

/**
 * LocalScrapeProvider (WO-13): transporte de scraping propio con Playwright,
 * mismo endurecimiento SSRF que el extractor visual (assertSafeUrl con DNS +
 * route-abort de hosts internos en sub-requests). ADR-001 define Firecrawl
 * como transporte objetivo — se adopta detrás de esta MISMA interfaz cuando
 * exista FIRECRAWL_API_KEY para implementarlo y verificarlo honestamente.
 */
export class LocalScrapeProvider implements ScrapeProvider {
  readonly name = "local-playwright";

  async scrapePage(url: string, opts: { timeoutMs: number }): Promise<ScrapedPage> {
    await assertSafeUrl(url);
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.route("**/*", (route) => {
        try {
          if (isBlockedHost(new URL(route.request().url()).hostname)) {
            return route.abort();
          }
        } catch {
          return route.abort();
        }
        return route.continue();
      });

      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: opts.timeoutMs,
      });
      const status = response?.status() ?? 0;
      if (status >= 500) {
        throw Object.assign(new Error(`HTTP ${status} en ${url}`), { transient: true });
      }
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

      const raw = await page.evaluate(scrapeFromDom);

      // Logo best-effort (AC-BEX-002.5): jamás falla el scrape por el logo.
      let logoCandidate: ScrapedPage["logoCandidate"] = null;
      if (raw.logo) {
        try {
          if (raw.logo.kind === "svg" && raw.logo.inlineSvg) {
            logoCandidate = {
              kind: "svg",
              dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(raw.logo.inlineSvg)}`,
            };
          } else if (raw.logo.src) {
            const dataUri = await fetchImageDataUri(page, raw.logo.src);
            if (dataUri) logoCandidate = { kind: raw.logo.kind, dataUri };
          }
        } catch {
          logoCandidate = null;
        }
      }

      return {
        url,
        finalUrl: page.url(),
        title: raw.title,
        metaDescription: raw.metaDescription,
        ogImage: raw.ogImage,
        headings: raw.headings,
        text: raw.text,
        links: raw.links,
        hasPasswordInput: raw.hasPasswordInput,
        scriptCount: raw.scriptCount,
        logoCandidate,
      };
    } finally {
      await browser?.close().catch(() => {});
    }
  }
}
