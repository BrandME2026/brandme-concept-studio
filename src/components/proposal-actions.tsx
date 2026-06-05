"use client";

import { useState } from "react";

/** Acciones sobre la propuesta generada: copiar HTML, descargar DESIGN.md, regenerar. */
export function ProposalActions({
  html,
  designMd,
  name,
  onRegenerate,
  disabled,
}: {
  html: string;
  designMd: string;
  name: string;
  onRegenerate: () => void;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard puede fallar sin gesto de usuario; silencioso
    }
  }

  function downloadDesignMd() {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const blob = new Blob([designMd], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug || "design"}.DESIGN.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const btn =
    "rounded-sm border border-hairline px-3 py-1.5 font-mono text-xs uppercase text-ink transition-colors hover:bg-hairline disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btn} onClick={copyHtml} disabled={disabled}>
        {copied ? "¡Copiado!" : "Copiar HTML"}
      </button>
      <button className={btn} onClick={downloadDesignMd} disabled={disabled}>
        Descargar DESIGN.md
      </button>
      <button className={btn} onClick={onRegenerate} disabled={disabled}>
        Regenerar
      </button>
    </div>
  );
}
