import { assertSafeUrl } from "@/lib/extract/ssrf-guard";
import { captureError } from "@/lib/observability/observability";
import { planCrawl, truncateToBudget } from "./crawl-plan";
import {
  ScrapeTerminalError,
  type ScrapedPage,
  type ScrapeProvider,
  type ScrapeResult,
} from "./types";

/**
 * BrandSiteScraper (WO-13): homepage + hasta max_pages-1 internas priorizadas
 * (About/FAQ/Locations/Investor + franchise-intent), retries con backoff
 * exponencial (AC-BEX-001.2: base 2s, factor 2) SOLO ante errores transitorios,
 * clasificación de fallo terminal en 4 clases (AC-BEX-001.3) y truncado al
 * presupuesto de contenido. El robots.txt se respeta ANTES de scrapear.
 */

export interface ScrapeOptions {
  maxPages: number;
  pageTimeoutMs: number;
  retries: number;
  retryBaseMs: number;
  maxContentBytes: number;
  /** Inyectable en tests; default real: setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isTransient(err: unknown): boolean {
  if (err instanceof ScrapeTerminalError) return false;
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code ?? "";
  return (
    (err as { transient?: boolean })?.transient === true ||
    /timeout|net::|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(
      `${message} ${code}`,
    )
  );
}

/** robots.txt mínimo: reglas Disallow del grupo `User-agent: *` sobre el path. */
export function isDisallowedByRobots(robotsTxt: string, path: string): boolean {
  let groupApplies = false;
  let inAgentLines = false;
  for (const rawLine of robotsTxt.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (key.trim().toLowerCase() === "user-agent") {
      if (!inAgentLines) groupApplies = false; // arranca un grupo nuevo
      inAgentLines = true;
      if (value === "*") groupApplies = true;
    } else {
      inAgentLines = false;
      if (
        key.trim().toLowerCase() === "disallow" &&
        groupApplies &&
        value !== "" &&
        path.startsWith(value)
      ) {
        return true;
      }
    }
  }
  return false;
}

async function checkRobots(url: string, timeoutMs: number): Promise<void> {
  const target = new URL(url);
  const robotsUrl = `${target.origin}/robots.txt`;
  try {
    // Guard SSRF (hallazgo de review R1): este fetch corre en el orquestador,
    // FUERA del transporte — sin esto, un url de tenant que resuelva a red
    // interna/metadata haría la petición igual. Mismo guard que el provider.
    await assertSafeUrl(robotsUrl);
    const res = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(Math.min(timeoutMs, 10_000)),
      redirect: "manual",
    });
    if (!res.ok) return; // sin robots.txt legible = sin restricción
    const body = await res.text();
    if (isDisallowedByRobots(body, target.pathname)) {
      throw new ScrapeTerminalError(
        "robots_txt_disallow",
        `robots.txt de ${target.origin} prohíbe ${target.pathname}`,
      );
    }
  } catch (err) {
    if (err instanceof ScrapeTerminalError) throw err;
    // robots.txt inaccesible no bloquea el scrape (la página misma decidirá).
  }
}

/** Heurísticas de clasificación terminal sobre la homepage (AC-BEX-001.3 b/c). */
function classifyHomepage(page: ScrapedPage): void {
  const textLen = page.text.length;
  if (page.hasPasswordInput && textLen < 800) {
    throw new ScrapeTerminalError(
      "paywall_or_login_wall",
      `login wall detectado en ${page.finalUrl} (${textLen} chars visibles)`,
    );
  }
  if (textLen < 500 && /log ?in|sign ?in|suscr[ií]b|subscribe|register/i.test(page.text)) {
    throw new ScrapeTerminalError(
      "paywall_or_login_wall",
      `paywall detectado en ${page.finalUrl}`,
    );
  }
  if (textLen < 200 && page.scriptCount >= 5) {
    throw new ScrapeTerminalError(
      "js_spa_no_content",
      `SPA sin contenido extraíble en ${page.finalUrl} (${textLen} chars, ${page.scriptCount} scripts)`,
    );
  }
}

async function scrapeWithRetries(
  provider: ScrapeProvider,
  url: string,
  opts: ScrapeOptions,
): Promise<ScrapedPage> {
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await provider.scrapePage(url, { timeoutMs: opts.pageTimeoutMs });
    } catch (err) {
      lastErr = err;
      if (!isTransient(err)) throw err;
      if (attempt < opts.retries) {
        await sleep(opts.retryBaseMs * 2 ** attempt); // 2s, 4s, 8s con base 2s
      }
    }
  }
  throw new ScrapeTerminalError(
    "persistent_transient_error",
    `scrape de ${url} agotó ${opts.retries + 1} intentos: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

/**
 * Corre el crawl completo de un sitio de marca. Lanza ScrapeTerminalError con
 * la clase de fallo cuando la homepage no es scrapeable; los fallos de páginas
 * ADICIONALES solo se loguean y la página se omite.
 */
export async function scrapeBrandSite(
  url: string,
  provider: ScrapeProvider,
  opts: ScrapeOptions,
): Promise<ScrapeResult> {
  // El guard SSRF (assertSafeUrl con DNS) es responsabilidad del TRANSPORTE:
  // LocalScrapeProvider lo aplica por página; un provider Firecrawl fetchea
  // desde su propia infra. El orquestador solo decide QUÉ scrapear.
  await checkRobots(url, opts.pageTimeoutMs);

  const homepage = await scrapeWithRetries(provider, url, opts);
  classifyHomepage(homepage);

  const plan = planCrawl(homepage, opts.maxPages);
  const pages: ScrapedPage[] = [homepage];
  for (const pageUrl of plan.additionalUrls) {
    try {
      pages.push(await scrapeWithRetries(provider, pageUrl, opts));
    } catch (err) {
      captureError(err, `[agent-02] página adicional omitida: ${pageUrl}`);
    }
  }

  const { pages: kept, truncated } = truncateToBudget(
    pages,
    plan.franchiseDevUrl,
    opts.maxContentBytes,
  );

  // Logo (AC-BEX-002.5): primer candidato encontrado en orden de scrape.
  const logoDataUri = kept.find((p) => p.logoCandidate)?.logoCandidate?.dataUri ?? null;

  return {
    pages: kept,
    scrapedUrls: kept.map((p) => p.finalUrl),
    logoDataUri,
    franchiseDevUrl: plan.franchiseDevUrl,
    truncated,
  };
}
