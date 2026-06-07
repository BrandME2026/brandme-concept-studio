"use client";

import { useEffect } from "react";
import { ResponsivePreview } from "./responsive-preview";

/**
 * Overlay a pantalla completa con el preview responsive. Cierra con Esc.
 * Reusa el patrón de ScreenshotModal (fixed inset-0 + listener de teclado).
 */
export function PreviewFullscreen({
  html,
  onClose,
}: {
  html: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-canvas" role="dialog" aria-modal="true">
      <ResponsivePreview html={html} onExitFullscreen={onClose} />
    </div>
  );
}
