import type { AIModelProvider } from "@/lib/ai/model-provider";
import { getConfigNumber } from "@/lib/config/config-store";
import { withSystemContext } from "@/lib/db/tenant-context";
import { emitDomainEvent } from "@/lib/events/domain-events";
import { captureError, withObservabilityContext } from "@/lib/observability/observability";
import { LlmExtractionError, runExtractionPass, AGENT_ID } from "./agent02-extractor";
import { evaluateQuality } from "./quality-gate";
import { LocalScrapeProvider } from "./scrape-provider";
import { scrapeBrandSite, type ScrapeOptions } from "./scraper";
import {
  createRun,
  getRawContent,
  markFailed,
  persistPayload,
  resolveHealthRecord,
  storeRawContent,
  upsertBrandByUrl,
  upsertHealthRecord,
} from "./store";
import {
  ScrapeTerminalError,
  type ExtractionRunResult,
  type ScrapeProvider,
  type ScrapeResult,
} from "./types";

/**
 * Pipeline del Agente 02 (WO-13): brand → corrida running → scrape (backup URL
 * si el primario falla terminal, AC-BEX-001.6) → raw content → pass LLM único →
 * quality gate → completed/degraded/failed + health record. SIN superficie
 * HTTP: los triggers reales llegan con WO-12 (Stage 1) y Build 6 (admin) —
 * mismo criterio que WO-4. Los contextos DB son bloques cortos que JAMÁS
 * abarcan los awaits de scrape/LLM (regla WO-3, pool 5).
 */

export interface RunOptions {
  url: string;
  backupUrl?: string | null;
  consultantId?: string | null;
  /** Inyectables (tests / EP-05); defaults reales. */
  scrapeProvider?: ScrapeProvider;
  llmProvider?: AIModelProvider;
  scrapeOverrides?: Partial<ScrapeOptions>;
}

async function loadScrapeOptions(): Promise<ScrapeOptions> {
  return {
    maxPages: await getConfigNumber("extraction", "max_pages", 5),
    pageTimeoutMs: await getConfigNumber("extraction", "page_timeout_ms", 30_000),
    retries: await getConfigNumber("extraction", "scrape_retries", 3),
    retryBaseMs: await getConfigNumber("extraction", "retry_base_ms", 2_000),
    maxContentBytes: await getConfigNumber("extraction", "max_content_bytes", 10_485_760),
  };
}

async function scrapeWithBackup(
  primary: string,
  backup: string | null | undefined,
  provider: ScrapeProvider,
  opts: ScrapeOptions,
): Promise<ScrapeResult> {
  try {
    return await scrapeBrandSite(primary, provider, opts);
  } catch (err) {
    if (err instanceof ScrapeTerminalError && backup) {
      captureError(err, `[agent-02] URL primaria falló terminal; probando backup ${backup}`);
      return scrapeBrandSite(backup, provider, opts);
    }
    throw err;
  }
}

export async function runBrandExtraction(options: RunOptions): Promise<ExtractionRunResult> {
  return withObservabilityContext(
    { surface: "agent-02-brand-extraction", role: "system", agent_id: AGENT_ID },
    async () => {
      const scrapeProvider = options.scrapeProvider ?? new LocalScrapeProvider();
      const consultantId = options.consultantId ?? null;

      const { brandId, extractionId } = await withSystemContext("brand-extraction", async () => {
        const brandId = await upsertBrandByUrl(options.url);
        const extractionId = await createRun({ brandId, consultantId });
        return { brandId, extractionId };
      });

      // 1) Scrape (fuera de todo contexto DB — awaits largos).
      let scrape: ScrapeResult;
      const scrapeOpts = { ...(await loadScrapeOptions()), ...options.scrapeOverrides };
      try {
        scrape = await scrapeWithBackup(options.url, options.backupUrl, scrapeProvider, scrapeOpts);
      } catch (err) {
        const failureClass =
          err instanceof ScrapeTerminalError ? err.failureClass : "persistent_transient_error";
        captureError(err, `[agent-02] scrape terminal (${failureClass}) para ${options.url}`);
        await withSystemContext("brand-extraction", async () => {
          await markFailed(extractionId, failureClass);
          await upsertHealthRecord({
            extractionId,
            brandId,
            failureClass,
            consultantId,
            attemptedUrl: options.url,
          });
        });
        return { extractionId, brandId, status: "failed", degradationFlag: true, failureClass };
      }

      await withSystemContext("brand-extraction", () => storeRawContent(extractionId, scrape));

      return finishFromScrape({ extractionId, brandId, consultantId, scrape, options });
    },
  );
}

/**
 * Re-extracción de admin SIN URL override (AC-BEX-013.3): re-corre el pass LLM
 * contra el raw_content ya almacenado — el scrape provider NO se invoca.
 */
export async function reextractFromStored(
  extractionId: string,
  opts: { llmProvider?: AIModelProvider } = {},
): Promise<ExtractionRunResult> {
  const stored = await withSystemContext("brand-extraction", () => getRawContent(extractionId));
  if (!stored?.scrape) {
    throw new Error(`extracción ${extractionId} sin raw_content almacenado`);
  }
  const newRunId = await withSystemContext("brand-extraction", async () => {
    const id = await createRun({ brandId: stored.brandId, consultantId: stored.consultantId });
    await storeRawContent(id, stored.scrape!);
    return id;
  });
  return finishFromScrape({
    extractionId: newRunId,
    brandId: stored.brandId,
    consultantId: stored.consultantId,
    scrape: stored.scrape,
    options: { url: "", llmProvider: opts.llmProvider },
    resolutionPath: "admin_re_extraction",
  });
}

async function finishFromScrape(input: {
  extractionId: string;
  brandId: string;
  consultantId: string | null;
  scrape: ScrapeResult;
  options: Pick<RunOptions, "llmProvider" | "url">;
  resolutionPath?: string;
}): Promise<ExtractionRunResult> {
  const { extractionId, brandId, consultantId, scrape } = input;

  // 2) Pass LLM (limiter + retries dentro; fuera de contexto DB).
  try {
    const output = await runExtractionPass(scrape, {
      consultantId: consultantId ?? undefined,
      provider: input.options.llmProvider,
    });

    // 3) Quality gate + persistencia.
    const gate = evaluateQuality(output, { logoExtracted: scrape.logoDataUri !== null });
    await withSystemContext("brand-extraction", async () => {
      await persistPayload({
        extractionId,
        output,
        perFieldStatus: gate.perFieldStatus,
        degraded: gate.degraded,
        logoDataUri: scrape.logoDataUri,
      });
      if (gate.degraded) {
        await upsertHealthRecord({
          extractionId,
          brandId,
          failureClass: "quality_degradation",
          consultantId,
          attemptedUrl: input.options.url || scrape.scrapedUrls[0] || "",
        });
      } else {
        await resolveHealthRecord(brandId, input.resolutionPath ?? "url_retry");
      }
    });
    // AC-BPG-001.1: la generación de página se engancha aquí. Se emite también
    // en degradación (ADR-003 de BrandMePage: la página degradada usa el
    // template neutral y sigue siendo claimable).
    emitDomainEvent("brand_extraction.completed", { brandId, consultantId, extractionId });
    return {
      extractionId,
      brandId,
      status: gate.degraded ? "degraded" : "completed",
      degradationFlag: gate.degraded,
      failureClass: gate.degraded ? "quality_degradation" : null,
    };
  } catch (err) {
    const failureClass =
      err instanceof LlmExtractionError ? err.failureClass : "llm_api_error";
    captureError(err, `[agent-02] pass LLM terminal (${failureClass})`);
    await withSystemContext("brand-extraction", async () => {
      await markFailed(extractionId, failureClass);
      await upsertHealthRecord({
        extractionId,
        brandId,
        failureClass,
        consultantId,
        attemptedUrl: input.options.url || scrape.scrapedUrls[0] || "",
      });
    });
    return { extractionId, brandId, status: "failed", degradationFlag: true, failureClass };
  }
}
