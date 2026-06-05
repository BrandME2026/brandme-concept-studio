"use client";

import Link from "next/link";
import type { Language } from "@/lib/ai/prompts";
import { Button } from "./ui/button";

/** Barra superior del studio: contexto (URL), idioma y CTA de generación. */
export function StudioTopbar({
  url,
  language,
  onLanguageChange,
  onGenerate,
  generating,
  canGenerate,
  showExtraction,
  onToggleExtraction,
}: {
  url: string;
  language: Language;
  onLanguageChange: (l: Language) => void;
  onGenerate: () => void;
  generating: boolean;
  canGenerate: boolean;
  showExtraction: boolean;
  onToggleExtraction: () => void;
}) {
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
          aria-label="Volver al inicio"
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
        <button
          type="button"
          onClick={onToggleExtraction}
          className="hidden rounded-sm border border-hairline px-3 py-1.5 font-mono text-xs uppercase text-body transition-colors hover:bg-hairline lg:block"
        >
          {showExtraction ? "Ocultar diseño extraído" : "Ver diseño extraído"}
        </button>
        <LanguageToggle
          value={language}
          onChange={onLanguageChange}
          disabled={generating}
        />
        <Button onClick={onGenerate} disabled={generating || !canGenerate}>
          {generating ? "Generando…" : "Generar propuesta"}
        </Button>
      </div>
    </header>
  );
}

function LanguageToggle({
  value,
  onChange,
  disabled,
}: {
  value: Language;
  onChange: (l: Language) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-sm border border-hairline p-0.5">
      {(["es", "en"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          disabled={disabled}
          onClick={() => onChange(lang)}
          className={`rounded-xs px-2 py-1 font-mono text-xs uppercase transition-colors ${
            value === lang ? "bg-primary text-on-primary" : "text-body"
          }`}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
