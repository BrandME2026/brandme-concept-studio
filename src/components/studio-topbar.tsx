"use client";

import Link from "next/link";
import { Button } from "./ui/button";
import { LanguageToggle } from "./language-toggle";
import { useT, type TFunction } from "@/lib/i18n/context";

/** Barra superior del studio: contexto (URL), idioma y CTA de generación. */
export function StudioTopbar({
  url,
  onGenerate,
  generating,
  canGenerate,
  showExtraction,
  onToggleExtraction,
  quality,
  onQualityChange,
}: {
  url: string;
  onGenerate: () => void;
  generating: boolean;
  canGenerate: boolean;
  showExtraction: boolean;
  onToggleExtraction: () => void;
  quality: "rapido" | "alta";
  onQualityChange: (q: "rapido" | "alta") => void;
}) {
  const t = useT();
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // dejar url tal cual
  }
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-hairline bg-canvas px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          className="eyebrow text-body transition-opacity hover:opacity-70"
          aria-label={t("studio.back")}
        >
          ← BrandMe
        </Link>
        <span className="h-4 w-px bg-hairline" />
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={favicon} alt="" className="h-4 w-4 rounded-xs" />
          <span className="truncate text-sm text-ink" title={url}>
            {host}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/historial"
          className="hidden rounded-sm px-3 py-1.5 font-mono text-xs uppercase text-body transition-colors hover:bg-hairline lg:block"
        >
          {t("studio.history")}
        </Link>
        <button
          type="button"
          onClick={onToggleExtraction}
          className="hidden rounded-sm border border-hairline px-3 py-1.5 font-mono text-xs uppercase text-body transition-colors hover:bg-hairline lg:block"
        >
          {showExtraction ? t("studio.extraction.hide") : t("studio.extraction.show")}
        </button>
        <QualityToggle value={quality} onChange={onQualityChange} disabled={generating} t={t} />
        <LanguageToggle disabled={generating} />
        <Button onClick={onGenerate} disabled={generating || !canGenerate}>
          {generating ? t("studio.generating") : t("studio.generate")}
        </Button>
      </div>
    </header>
  );
}

function QualityToggle({
  value,
  onChange,
  disabled,
  t,
}: {
  value: "rapido" | "alta";
  onChange: (q: "rapido" | "alta") => void;
  disabled?: boolean;
  t: TFunction;
}) {
  const opts: { id: "rapido" | "alta"; label: string }[] = [
    { id: "rapido", label: t("studio.quality.fast") },
    { id: "alta", label: t("studio.quality.high") },
  ];
  return (
    <div
      className="flex rounded-sm border border-hairline p-0.5"
      title={t("studio.quality.title")}
    >
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={`rounded-xs px-2 py-1 font-mono text-xs uppercase transition-colors ${
            value === o.id ? "bg-primary text-on-primary" : "text-body"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
