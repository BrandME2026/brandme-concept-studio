"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";

/** Acciones sobre la propuesta generada: copiar HTML, descargar DESIGN.md, compartir, regenerar. */
export function ProposalActions({
  html,
  designMd,
  name,
  shareId,
  onRegenerate,
  busy,
}: {
  html: string;
  designMd: string;
  name: string;
  /** id de la conversación/página para el link público /p/[id] (Compartir). */
  shareId?: string | null;
  onRegenerate?: () => void;
  busy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const t = useT();

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard puede fallar sin gesto de usuario; silencioso */
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

  async function share() {
    if (!shareId) return;
    const url = `${window.location.origin}/p/${shareId}`;
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch {
      /* silencioso */
    }
  }

  const btn =
    "rounded-sm border border-hairline px-3 py-1.5 font-mono text-xs uppercase text-ink transition-colors hover:bg-hairline disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btn} onClick={copyHtml}>
        {copied ? t("proposal.copied") : t("proposal.copy")}
      </button>
      <button className={btn} onClick={downloadDesignMd}>
        {t("proposal.download")}
      </button>
      {shareId && (
        <button className={btn} onClick={share}>
          {shared ? t("proposal.shared") : t("proposal.share")}
        </button>
      )}
      {onRegenerate && (
        <button className={btn} onClick={onRegenerate} disabled={busy}>
          {t("proposal.regenerate")}
        </button>
      )}
    </div>
  );
}
