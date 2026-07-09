import { chromium, type Browser, type Page } from "playwright";
import type { DesignTokens } from "@/types/design";
import type { RawExtraction } from "./extractor-script";
import { extractFromDom } from "./extractor-script";
import { buildDesignTokens } from "./tokens";
import { isBlockedHost, assertSafeUrl } from "./ssrf-guard";

const MAX_LOGO_BYTES = Number(process.env.MAX_LOGO_BYTES ?? 256 * 1024);

/** Detecta el MIME por magic bytes (no confiar en Content-Type, puede venir spoofeado). */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "image/webp";
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return "image/x-icon";
  const head = buf.toString("utf8", 0, 256).trim().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  return null;
}

/**
 * Descarga una imagen a data URI de forma segura: SIN seguir redirects (un redirect
 * podría saltarse el guard SSRF apuntando a la red interna) y validando los magic
 * bytes (no el Content-Type, que puede ser falso). Devuelve null si algo no cuadra.
 */
export async function fetchImageDataUri(page: Page, url: string): Promise<string | undefined> {
  await assertSafeUrl(url); // resuelve DNS, bloquea IPs internas
  const res = await page.request.get(url, { timeout: 8000, maxRedirects: 0 });
  // Un 3xx significa que la URL redirige: no lo seguimos (posible SSRF). Descartar.
  if (res.status() >= 300 || !res.ok()) return undefined;
  const buf = await res.body();
  if (buf.length < 100 || buf.length > MAX_LOGO_BYTES) return undefined;
  const mime = sniffImageMime(buf);
  if (!mime) return undefined; // no es una imagen real
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Convierte el logo detectado a data URI. SVG inline → data URI directo; URL →
 * descarga segura. Devuelve null si falla, es grande o no es seguro. Nunca rompe.
 */
async function resolveLogo(page: Page, logo: RawExtraction["logo"]): Promise<string | undefined> {
  if (!logo) return undefined;
  try {
    if (logo.kind === "svg" && logo.inlineSvg) {
      if (logo.inlineSvg.length > MAX_LOGO_BYTES) return undefined;
      return `data:image/svg+xml;utf8,${encodeURIComponent(logo.inlineSvg)}`;
    }
    if (!logo.src) return undefined;
    return await fetchImageDataUri(page, logo.src);
  } catch {
    return undefined;
  }
}

export interface ExtractionResult {
  tokens: DesignTokens;
  /** Screenshot del viewport como data URL (JPEG) para el LLM multimodal. */
  screenshot: string;
}

const TIMEOUT = Number(process.env.EXTRACT_TIMEOUT_MS ?? 30000);

/**
 * Fallback de logo: favicon de alta resolución vía el servicio de Google (logo real
 * de la marca, siempre disponible). Se descarga a data URI. Null si falla.
 */
async function faviconFallback(page: Page, url: string): Promise<string | undefined> {
  try {
    const host = new URL(url).hostname;
    // Servicio de Google sigue su propio redirect interno; permitimos redirects SOLO
    // para este host de confianza fijo, validando igualmente los magic bytes.
    const fav = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
    const res = await page.request.get(fav, { timeout: 8000 });
    if (!res.ok()) return undefined;
    const buf = await res.body();
    if (buf.length < 100 || buf.length > MAX_LOGO_BYTES) return undefined;
    if (!sniffImageMime(buf)) return undefined;
    const mime = sniffImageMime(buf)!;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

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

    // SSRF en profundidad: aborta sub-requests/redirects a IPs literales internas.
    // La URL de entrada ya pasó assertSafeUrl (con resolución DNS) en el route handler.
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

    // Logo del DOM; si no hay, fallback al favicon de alta resolución (logo real de
    // la marca, funciona universalmente aunque el DOM no exponga un <img> de logo).
    let logo = await resolveLogo(page, raw.logo);
    if (!logo) logo = await faviconFallback(page, url);
    const tokens = buildDesignTokens(raw, url, new Date().toISOString());
    if (logo) tokens.meta.logo = logo;
    return { tokens, screenshot };
  } finally {
    await browser?.close();
  }
}
