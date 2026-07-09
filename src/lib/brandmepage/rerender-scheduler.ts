import { withSystemContext } from "@/lib/db/tenant-context";
import { captureError } from "@/lib/observability/observability";
import { agent04Limiter } from "./agent04-limiter";
import { transitionState } from "./store";
import type { RerenderTier } from "./types";

/**
 * ReRenderScheduler (WO-15, ADR-002): encola jobs de re-render con 3 niveles de
 * prioridad y maneja el ciclo Published → Stale → Regenerating → Published. El
 * fallo terminal PRESERVA la versión publicada previa (el config anterior sigue
 * siendo el activo — jamás se toca en el path de fallo) + alerta.
 *
 * Kinds: "overlay" (perfil/overrides — SIN LLM, ADR-001: el overlay y los
 * overrides se leen en render-time, el job solo cicla el estado y regenera
 * artefactos derivados) y "brand" (cambio de capa de marca — el caller pasa un
 * regenerate() que re-ensambla config con LLM).
 */

export interface RerenderJob {
  pageId: string;
  tier: RerenderTier;
  /** Trabajo real del job (re-ensamblar config, etc.). Para overlay: opcional. */
  regenerate?: () => Promise<void>;
}

const pending: Array<Promise<void>> = [];

export function enqueueRerender(job: RerenderJob): Promise<void> {
  const run = (async () => {
    const wentStale = await withSystemContext("bmp-rerender", () =>
      transitionState(job.pageId, ["published"], "stale"),
    );
    if (!wentStale) return; // solo páginas publicadas se re-renderizan

    // acquire() dentro del try (hallazgo de review R1): si fallara, la página
    // no queda atascada en stale — el catch la regresa a published.
    let release: (() => void) | null = null;
    try {
      release = await agent04Limiter.acquire(job.tier);
      await withSystemContext("bmp-rerender", () =>
        transitionState(job.pageId, ["stale"], "regenerating"),
      );
      if (job.regenerate) await job.regenerate();
      await withSystemContext("bmp-rerender", () =>
        transitionState(job.pageId, ["regenerating"], "published"),
      );
    } catch (err) {
      // Fallo terminal: la versión previa queda viva (config intacto) y el
      // estado vuelve a published (contrato "page-at-same-URL").
      captureError(err, `[agent-04] re-render terminal para página ${job.pageId}`);
      await withSystemContext("bmp-rerender", () =>
        transitionState(job.pageId, ["regenerating", "stale"], "published"),
      );
    } finally {
      release?.();
    }
  })();
  pending.push(run);
  return run;
}

/** Espera a que drenen los jobs en vuelo (tests / apagado ordenado). */
export async function drainRerenders(): Promise<void> {
  await Promise.allSettled(pending.splice(0));
}
