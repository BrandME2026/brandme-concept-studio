import type { AIModelProvider } from "@/lib/ai/model-provider";
import { withSystemContext } from "@/lib/db/tenant-context";
import { emitDomainEvent } from "@/lib/events/domain-events";
import { captureError, withObservabilityContext } from "@/lib/observability/observability";
import { agent04Limiter } from "./agent04-limiter";
import { AGENT_ID, generateCopy } from "./copy-generator";
import { triggerPublication } from "./lifecycle";
import {
  createPreviewLink,
  ensureConsultantSlug,
  insertConfig,
  loadConsultantOverlay,
  resolveBrandLayer,
  resolveBrandSlug,
  upsertPage,
} from "./store";
import type { GenerationResult } from "./types";

/**
 * PageGenerationAgent (WO-15): corre tras brand_extraction.completed. Resuelve
 * la capa de marca (template admin o extracción dinámica — BrandTemplateResolver),
 * genera el copy con LLM (gated por Agent04ConcurrencyLimiter), persiste el
 * config INMUTABLE + la página en Draft con preview link, y emite
 * brandmepage.generated. `publish: true` dispara el trigger de publicación
 * (gate de aprobación según ConfigStore).
 *
 * Los contextos DB son bloques cortos; el pass LLM corre fuera de todo
 * contexto (regla WO-3).
 */

export interface GenerateOptions {
  consultantId: string;
  brandId: string;
  publish?: boolean;
  llmProvider?: AIModelProvider;
  retryBaseMs?: number;
}

export async function generateBrandMePage(opts: GenerateOptions): Promise<GenerationResult> {
  return withObservabilityContext(
    { surface: "agent-04-brandmepage", role: "system", agent_id: AGENT_ID },
    async () => {
      const prepared = await withSystemContext("bmp-generation", async () => {
        const brand = await resolveBrandLayer(opts.brandId);
        if (!brand) {
          throw new Error(
            `brand ${opts.brandId} sin extracción ni template: la generación corre tras Brand Extraction`,
          );
        }
        const overlay = await loadConsultantOverlay(opts.consultantId);
        const consultantSlug = await ensureConsultantSlug(opts.consultantId);
        const brandSlug = await resolveBrandSlug(opts.consultantId, opts.brandId);
        return { brand, overlay, consultantSlug, brandSlug };
      });

      // Pass LLM gated por el limiter (tier consultant: generación inicial).
      const release = await agent04Limiter.acquire("consultant");
      let copyResult: Awaited<ReturnType<typeof generateCopy>>;
      try {
        copyResult = await generateCopy(prepared.brand, prepared.overlay.name, {
          consultantId: opts.consultantId,
          provider: opts.llmProvider,
          retryBaseMs: opts.retryBaseMs,
        });
      } catch (err) {
        // Fallo terminal (AC-BPG-006.4): alerta con contexto; el portal (Build 6)
        // y el email de fallo leerán este estado desde observabilidad/8090.
        captureError(
          err,
          `[agent-04] generación terminal para consultant ${opts.consultantId} brand ${opts.brandId}`,
        );
        throw err;
      } finally {
        release();
      }

      const result = await withSystemContext("bmp-generation", async () => {
        const configId = await insertConfig({
          brandId: opts.brandId,
          consultantId: opts.consultantId,
          brand: prepared.brand,
          copy: copyResult.copy,
          complianceVerified: copyResult.complianceVerified,
        });
        const pageId = await upsertPage({
          consultantId: opts.consultantId,
          brandId: opts.brandId,
          consultantSlug: prepared.consultantSlug,
          brandSlug: prepared.brandSlug,
          configId,
        });
        const previewToken = await createPreviewLink(pageId);
        return { pageId, configId, previewToken };
      });

      emitDomainEvent("brandmepage.generated", {
        pageId: result.pageId,
        consultantId: opts.consultantId,
      });

      let state: GenerationResult["state"] = "draft";
      if (opts.publish) {
        state = (await triggerPublication(result.pageId)) ?? "draft";
      }

      return {
        pageId: result.pageId,
        configId: result.configId,
        state,
        consultantSlug: prepared.consultantSlug,
        brandSlug: prepared.brandSlug,
        previewToken: result.previewToken,
      };
    },
  );
}
