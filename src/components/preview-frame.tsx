"use client";

import { useMemo } from "react";
import { buildSrcDoc } from "@/lib/preview/build-srcdoc";

/**
 * Render del HTML generado en un iframe AISLADO.
 * sandbox="allow-scripts" SIN allow-same-origin: Tailwind Play CDN puede ejecutarse,
 * pero el documento no accede a cookies/storage/DOM de la app (defensa en profundidad).
 * Por eso el CDN sin SRI es aceptable: el blast radius queda contenido en el iframe.
 */
export function PreviewFrame({ html }: { html: string }) {
  const srcDoc = useMemo(() => buildSrcDoc(html), [html]);

  return (
    <iframe
      title="Preview de la propuesta"
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      className="h-full w-full border-0 bg-canvas"
    />
  );
}
