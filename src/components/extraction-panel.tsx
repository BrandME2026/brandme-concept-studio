"use client";

import type { DesignTokens } from "@/types/design";

export function ExtractionPanel({
  tokens,
  screenshot,
}: {
  tokens: DesignTokens;
  screenshot: string;
}) {
  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-5">
      <div>
        <span className="eyebrow text-body">Extracción</span>
        <h2 className="mt-1 text-xl font-medium tracking-tight">
          {tokens.meta.title || tokens.meta.url}
        </h2>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={screenshot}
        alt="Captura de la web de referencia"
        className="w-full rounded-sm border border-hairline"
      />

      <section>
        <span className="eyebrow text-body">Paleta</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {tokens.colors.palette.map((c) => (
            <div key={c.value} className="flex flex-col items-center gap-1">
              <span
                className="h-10 w-10 rounded-sm border border-hairline"
                style={{ backgroundColor: c.value }}
                title={`${c.value} · ${c.roles.join(", ")}`}
              />
              <code className="text-[10px] text-body">{c.value}</code>
            </div>
          ))}
        </div>
      </section>

      <section>
        <span className="eyebrow text-body">Tipografía</span>
        <ul className="mt-2 space-y-1 text-sm">
          {tokens.typography.fontFamilies.slice(0, 4).map((f) => (
            <li key={f.family} className="flex justify-between">
              <span style={{ fontFamily: f.family }}>{f.family}</span>
              <span className="font-mono text-xs uppercase text-body">
                {f.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <span className="eyebrow text-body">Espaciado</span>
        <p className="mt-1 font-mono text-sm text-body">
          {tokens.spacing.common.map((s) => `${s}px`).join(" · ")}
        </p>
      </section>
    </div>
  );
}
