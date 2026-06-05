"use client";

import { useState } from "react";
import type { DesignTokens } from "@/types/design";
import { ScreenshotModal } from "./screenshot-modal";

export function ExtractionPanel({
  tokens,
  screenshot,
}: {
  tokens: DesignTokens;
  screenshot: string;
}) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-5">
      <div>
        <span className="eyebrow text-body">Extracción</span>
        <h2 className="mt-1 text-lg font-medium leading-snug tracking-tight">
          {tokens.meta.title || tokens.meta.url}
        </h2>
      </div>

      <button
        type="button"
        onClick={() => setZoomed(true)}
        className="group relative overflow-hidden rounded-sm border border-hairline"
        aria-label="Ampliar captura"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={screenshot} alt="Captura de la web de referencia" className="w-full" />
        <span className="absolute bottom-2 right-2 rounded-xs bg-canvas-dark/80 px-2 py-0.5 font-mono text-[10px] uppercase text-on-dark opacity-0 transition-opacity group-hover:opacity-100">
          Ampliar
        </span>
      </button>

      <section>
        <span className="eyebrow text-body">Paleta</span>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {tokens.colors.palette.map((c) => (
            <div
              key={c.value}
              className="flex items-center gap-2 rounded-sm border border-hairline p-1.5"
            >
              <span
                className="h-7 w-7 flex-shrink-0 rounded-xs border border-hairline"
                style={{ backgroundColor: c.value }}
              />
              <div className="min-w-0">
                <code className="block text-xs text-ink">{c.value}</code>
                <span className="block truncate font-mono text-[10px] uppercase text-body">
                  {c.roles.join(" · ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <span className="eyebrow text-body">Tipografía</span>
        <ul className="mt-2 space-y-1.5 text-sm">
          {tokens.typography.fontFamilies.slice(0, 4).map((f) => (
            <li key={f.family} className="flex items-center justify-between gap-2">
              <span className="truncate" style={{ fontFamily: f.family }}>
                {f.family}
              </span>
              <span className="flex-shrink-0 rounded-xs bg-hairline px-1.5 py-0.5 font-mono text-[10px] uppercase text-body">
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

      {zoomed && (
        <ScreenshotModal
          src={screenshot}
          alt="Captura ampliada de la web"
          onClose={() => setZoomed(false)}
        />
      )}
    </div>
  );
}
