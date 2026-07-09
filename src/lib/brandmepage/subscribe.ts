import type { AIModelProvider } from "@/lib/ai/model-provider";
import { onDomainEvent } from "@/lib/events/domain-events";
import { captureError } from "@/lib/observability/observability";
import { generateBrandMePage } from "./generation-pipeline";

/**
 * Wiring del Agente 04 (WO-15, AC-BPG-001.1): brand_extraction.completed →
 * enqueue de generación. Corridas de admin (consultant null) no generan página
 * (la página es por par consultant-brand). Idempotente: registrar una vez.
 * `opts` existe para inyectar el transporte LLM en tests (EP-05); producción
 * registra sin argumentos.
 */

let registered = false;

export function registerBrandMePageSubscribers(
  opts: { llmProvider?: AIModelProvider; retryBaseMs?: number } = {},
): void {
  if (registered) return;
  registered = true;
  onDomainEvent("brand_extraction.completed", async ({ brandId, consultantId }) => {
    if (!consultantId) return;
    try {
      await generateBrandMePage({
        consultantId,
        brandId,
        llmProvider: opts.llmProvider,
        retryBaseMs: opts.retryBaseMs,
      });
    } catch (err) {
      captureError(err, `[agent-04] generación post-extracción falló (brand ${brandId})`);
    }
  });
}

export function __resetSubscribersForTests(): void {
  registered = false;
}
