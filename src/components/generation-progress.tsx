"use client";

import type { DesignProposal } from "@/lib/schemas";

/** Etapas de la propuesta, en el orden en que el modelo las completa. */
const STEPS: { field: keyof DesignProposal; label: string }[] = [
  { field: "name", label: "Nombrando el sistema" },
  { field: "description", label: "Definiendo la estética" },
  { field: "colors", label: "Eligiendo la paleta" },
  { field: "typography", label: "Componiendo la tipografía" },
  { field: "principles", label: "Redactando principios" },
  { field: "html", label: "Maquetando el preview" },
];

/**
 * Muestra el avance de la generación: etapas completadas + el objeto parcial
 * que va llegando en vivo (en vez de un spinner mudo).
 */
export function GenerationProgress({
  partial,
  seen,
}: {
  partial: Partial<DesignProposal> | null;
  seen: Set<string>;
}) {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <div className="flex items-center gap-3">
        <div className="bg-brand-gradient h-6 w-6 animate-pulse rounded-sm" />
        <span className="eyebrow text-body">Generando propuesta…</span>
      </div>

      <ol className="space-y-2">
        {STEPS.map((step) => {
          const done = seen.has(step.field);
          return (
            <li
              key={step.field}
              className={`flex items-center gap-2 text-sm transition-opacity ${
                done ? "text-ink" : "text-body opacity-50"
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  done ? "bg-accent-mint" : "bg-hairline"
                }`}
              />
              {step.label}
            </li>
          );
        })}
      </ol>

      {/* Vista previa de los datos que van llegando */}
      {partial?.name && (
        <div className="rounded-sm border border-hairline p-3">
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
      )}

      <p className="text-xs text-body">
        Puede tardar hasta un minuto. Estamos componiendo un diseño nuevo
        inspirado en la web, no una copia.
      </p>
    </div>
  );
}
