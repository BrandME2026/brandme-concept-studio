"use client";

import { useEffect } from "react";
import type { DesignTokens } from "@/types/design";
import { ExtractionPanel } from "./extraction-panel";

/** Drawer overlay con el diseño extraído (detalle técnico, bajo demanda). */
export function ExtractionDrawer({
  open,
  onClose,
  tokens,
  screenshot,
}: {
  open: boolean;
  onClose: () => void;
  tokens: DesignTokens;
  screenshot: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Scrim */}
      <div
        className={`fixed inset-0 z-40 bg-canvas-dark/40 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel deslizante */}
      <aside
        className={`fixed left-0 top-0 z-50 h-full w-[360px] max-w-[85vw] border-r border-hairline bg-canvas shadow-2xl transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-label="Diseño extraído"
      >
        <div className="flex items-center justify-between border-b border-hairline p-4">
          <span className="eyebrow text-body">Diseño extraído</span>
          <button
            onClick={onClose}
            className="font-mono text-xs uppercase text-body transition-opacity hover:opacity-70"
            aria-label="Cerrar"
          >
            Cerrar ✕
          </button>
        </div>
        <div className="h-[calc(100%-57px)] overflow-y-auto">
          <ExtractionPanel tokens={tokens} screenshot={screenshot} />
        </div>
      </aside>
    </>
  );
}
