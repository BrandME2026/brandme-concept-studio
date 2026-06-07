"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";

/** Acciones sobre la propuesta generada: copiar HTML, descargar DESIGN.md, compartir, regenerar. */
export function ProposalActions({
  html,
  designMd,
  name,
  shareId,
  slug,
  onRegenerate,
  busy,
}: {
  html: string;
  designMd: string;
  name: string;
  /** id de la conversación/página para el link público /p/[id] (Compartir). */
  shareId?: string | null;
  /** slug de la web para publicar (botón Publicar). */
  slug?: string | null;
  onRegenerate?: () => void;
  busy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [publishState, setPublishState] = useState<"idle" | "working" | "done">("idle");
  const [publishError, setPublishError] = useState("");
  const t = useT();

  /** Publica la web: si hay suscripción activa marca published; si no, manda a Stripe. */
  async function publish() {
    if (!slug || publishState === "working") return;
    setPublishState("working");
    setPublishError("");
    try {
      const sub = await fetch("/api/subscription").then((r) => r.json()).catch(() => null);
      const active = Boolean(sub?.data?.active);
      const configured = Boolean(sub?.data?.configured);

      // Con paywall activo y sin suscripción → Checkout de Stripe.
      if (configured && !active) {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        const json = await res.json().catch(() => null);
        if (json?.data?.url) {
          window.location.href = json.data.url as string;
          return;
        }
        throw new Error(json?.error?.message ?? t("proposal.publishError"));
      }

      // Suscripción activa (o sin Stripe → gratis): publicar directo.
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? t("proposal.publishError"));
      setPublishState("done");
    } catch (err) {
      setPublishState("idle");
      setPublishError(err instanceof Error ? err.message : t("proposal.publishError"));
    }
  }

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
      {slug && (
        <button
          className="rounded-sm border border-primary bg-primary px-3 py-1.5 font-mono text-xs uppercase text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
          onClick={publish}
          disabled={publishState === "working" || publishState === "done"}
          title={publishError || undefined}
        >
          {publishState === "done"
            ? t("proposal.published")
            : publishState === "working"
              ? t("proposal.publishing")
              : t("proposal.publish")}
        </button>
      )}
    </div>
  );
}
