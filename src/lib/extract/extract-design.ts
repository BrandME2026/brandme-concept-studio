import { chromium, type Browser } from "playwright";
import type { DesignTokens } from "@/types/design";
import { extractFromDom } from "./extractor-script";
import { buildDesignTokens } from "./tokens";

export interface ExtractionResult {
  tokens: DesignTokens;
  /** Screenshot del viewport como data URL (JPEG) para el LLM multimodal. */
  screenshot: string;
}

const TIMEOUT = Number(process.env.EXTRACT_TIMEOUT_MS ?? 30000);

/**
 * Navega a la URL con un navegador headless, espera la hidratación (apps Next.js
 * JS-heavy), extrae design tokens del CSS computado y captura un screenshot.
 */
export async function extractDesign(url: string): Promise<ExtractionResult> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    // Esperar a que la app JS-heavy hidrate y la red se calme.
    await page
      .waitForLoadState("networkidle", { timeout: TIMEOUT })
      .catch(() => {}); // si nunca llega a idle, seguimos con lo que haya

    // Scroll progresivo para disparar lazy-loading/animaciones de entrada.
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let y = 0;
        const step = () => {
          window.scrollBy(0, window.innerHeight);
          y += window.innerHeight;
          if (y >= document.body.scrollHeight || y > 5000) {
            window.scrollTo(0, 0);
            resolve();
          } else {
            setTimeout(step, 100);
          }
        };
        step();
      });
    });
    await page.waitForTimeout(500);

    const raw = await page.evaluate(extractFromDom);
    const buffer = await page.screenshot({ type: "jpeg", quality: 70 });
    const screenshot = `data:image/jpeg;base64,${buffer.toString("base64")}`;

    const tokens = buildDesignTokens(raw, url, new Date().toISOString());
    return { tokens, screenshot };
  } finally {
    await browser?.close();
  }
}
