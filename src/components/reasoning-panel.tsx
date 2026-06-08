"use client";

import { useEffect, useRef } from "react";
import type { DesignProposal } from "@/lib/schemas";
import { useT } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/es";

/**
 * Frases del narrado de respaldo, en el orden en que el modelo completa campos.
 * Se usan SOLO cuando el modelo no emite reasoning real, para que el panel
 * nunca quede vacío (es un "proceso", no el pensamiento crudo del modelo).
 */
const NARRATED: { field: keyof DesignProposal; key: TranslationKey }[] = [
  { field: "colors", key: "reasoning.narrated.palette" },
  { field: "typography", key: "reasoning.narrated.typography" },
  { field: "principles", key: "reasoning.narrated.principles" },
  { field: "html", key: "reasoning.narrated.html" },
];

/**
 * Panel SIEMPRE visible que muestra "qué piensa el agente" mientras genera.
 * - Si llega reasoning real del modelo → lo muestra en vivo.
 * - Si no → narra el proceso a partir de los campos ya completados (seen).
 */
export function ReasoningPanel({
  reasoning,
  seen,
}: {
  reasoning: string;
  seen: Set<string>;
}) {
  const t = useT();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al final conforme llega más texto.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [reasoning, seen.size]);

  const hasRealReasoning = reasoning.trim().length > 0;

  // Narrado: arranca con la frase inicial y suma una línea por campo completado.
  const narratedLines = [
    t("reasoning.narrated.start"),
    ...NARRATED.filter((n) => seen.has(n.field)).map((n) => t(n.key)),
  ];

  return (
    <div className="rounded-sm border border-hairline">
      <div className="px-3 py-2">
        <span className="eyebrow text-body">{t("reasoning.eyebrow")}</span>
      </div>
      <div className="border-t border-hairline px-3 py-2">
        {hasRealReasoning ? (
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs text-body">
            {reasoning}
          </pre>
        ) : (
          <div className="max-h-56 space-y-1.5 overflow-auto">
            {narratedLines.map((line, i) => (
              <p key={i} className="text-xs text-body">
                {line}
              </p>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
