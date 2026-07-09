import { test, expect } from "@playwright/test";

/**
 * Regresión del transporte REAL del scraper (hallazgo del smoke test):
 * page.evaluate(scrapeFromDom) fallaba bajo runtimes esbuild/tsx ("__name is
 * not defined" — artefacto de keepNames en la serialización al navegador).
 * Este spec ejecuta el LocalScrapeProvider REAL (Playwright + SSRF guard)
 * contra example.com (IANA, estable) DESDE un runtime esbuild — exactamente el
 * contexto donde el bug vivía. Red requerida: solo example.com.
 */

import { LocalScrapeProvider } from "../../../src/lib/extraction/scrape-provider";

test("@extraction el LocalScrapeProvider real extrae texto y links (regresión __name)", async () => {
  const provider = new LocalScrapeProvider();
  const page = await provider.scrapePage("https://example.com/", { timeoutMs: 15_000 });

  expect(page.title).toContain("Example Domain");
  expect(page.text.length).toBeGreaterThan(50);
  expect(page.text.toLowerCase()).toContain("domain");
  expect(Array.isArray(page.links)).toBe(true);
  expect(page.scriptCount).toBeGreaterThanOrEqual(0);
});
