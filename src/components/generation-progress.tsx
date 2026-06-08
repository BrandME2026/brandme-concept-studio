"use client";

import { useEffect, useState } from "react";
import type { DesignProposal } from "@/lib/schemas";
import { useT } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/es";
import { ReasoningPanel } from "./reasoning-panel";
import { CheckIcon, SpinnerIcon } from "./ui/icons";

/** Etapas de la propuesta, en el orden en que el modelo las completa. */
const STEPS: { field: keyof DesignProposal; labelKey: TranslationKey }[] = [
  { field: "name", labelKey: "progress.naming" },
  { field: "description", labelKey: "progress.aesthetic" },
  { field: "colors", labelKey: "progress.palette" },
  { field: "typography", labelKey: "progress.typography" },
  { field: "principles", labelKey: "progress.principles" },
  { field: "html", labelKey: "progress.preview" },
];

/** Mensajes rotativos que dan "vida" durante la espera (best practice: feedback continuo). */
const TICKS: TranslationKey[] = [
  "progress.tick.1",
  "progress.tick.2",
  "progress.tick.3",
  "progress.tick.4",
  "progress.tick.5",
  "progress.tick.6",
];

const ESTIMATE_S = 75; // estimación realista (~1 min y poco) para la barra

/**
 * Avance de la generación con "vida": pasos (activo con spinner, hechos con check),
 * barra de progreso que avanza sin estancarse, cronómetro y mensaje rotativo. Patrones
 * de UX para esperas largas (10+s): el movimiento continuo multiplica la paciencia.
 */
export function GenerationProgress({
  partial,
  seen,
  reasoning = "",
}: {
  partial: Partial<DesignProposal> | null;
  seen: Set<string>;
  reasoning?: string;
}) {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);

  // Cronómetro: 1 tick/seg. Da sensación de actividad aunque el stream esté en silencio.
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const doneCount = STEPS.filter((s) => seen.has(s.field)).length;
  const activeIndex = STEPS.findIndex((s) => !seen.has(s.field));

  // Progreso: combina pasos reales completados con avance por tiempo, pero nunca llega
  // al 100% hasta que de verdad termina (una barra estancada o "llena pero girando"
  // genera desconfianza). Tope 95%.
  const bySteps = (doneCount / STEPS.length) * 100;
  const byTime = Math.min(95, (elapsed / ESTIMATE_S) * 100);
  const pct = Math.min(95, Math.max(bySteps, byTime));

  // Mensaje rotativo: cambia cada 6s para reforzar "sigo trabajando".
  const tick = t(TICKS[Math.min(TICKS.length - 1, Math.floor(elapsed / 6))]);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="bg-brand-gradient h-6 w-6 animate-pulse rounded-sm" />
          <span className="eyebrow text-body">{t("progress.eyebrow")}</span>
        </div>
        <span className="font-mono text-xs text-body">
          {t("progress.elapsed", { s: elapsed })}
        </span>
      </div>

      {/* Barra de progreso (siempre en movimiento, tope 95% hasta terminar) */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-hairline">
        <div
          className="bg-brand-gradient h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Mensaje rotativo: vida durante el silencio del stream */}
      <p className="animate-fade text-sm text-body" key={tick}>
        {tick}
      </p>

      <ol className="space-y-2">
        {STEPS.map((step, i) => {
          const done = seen.has(step.field);
          const active = i === activeIndex;
          return (
            <li
              key={step.field}
              className={`flex items-center gap-2 text-sm transition-all ${
                done ? "text-ink" : active ? "text-on-dark" : "text-body opacity-40"
              }`}
            >
              <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                {done ? (
                  <CheckIcon size={14} className="text-accent-mint" />
                ) : active ? (
                  <SpinnerIcon size={14} className="text-accent-periwinkle" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-hairline" />
                )}
              </span>
              {t(step.labelKey)}
            </li>
          );
        })}
      </ol>

      {/* Vista previa de los datos que van llegando (progressive disclosure) */}
      {partial?.name ? (
        <div className="animate-fade rounded-sm border border-hairline p-3">
          <p className="font-medium">{partial.name}</p>
          {partial.description && (
            <p className="mt-1 text-sm text-body">{partial.description}</p>
          )}
          {partial.colors && (
            <div className="mt-2 flex gap-1.5">
              {Object.values(partial.colors)
                .filter((c): c is string => typeof c === "string")
                .map((c, i) => (
                  <span
                    key={i}
                    className="h-6 w-6 rounded-sm border border-hairline"
                    style={{ backgroundColor: c }}
                  />
                ))}
            </div>
          )}
        </div>
      ) : (
        // Skeleton de lo que viene (reduce ~40% el tiempo percibido vs panel vacío).
        <div className="space-y-2">
          <div className="h-5 w-2/5 animate-pulse rounded bg-hairline" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-hairline" />
          <div className="mt-2 flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-6 w-6 animate-pulse rounded-sm bg-hairline" />
            ))}
          </div>
        </div>
      )}

      <ReasoningPanel reasoning={reasoning} seen={seen} />

      <p className="text-xs text-body">{t("progress.note")}</p>
    </div>
  );
}
