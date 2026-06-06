"use client";

import { useLocale } from "@/lib/i18n/context";
import { LOCALES } from "@/lib/i18n/locale";

/**
 * Toggle global ES/EN conectado al contexto i18n. Mismo control en landing y studio:
 * cambiarlo re-renderiza toda la UI y persiste la preferencia en cookie.
 */
export function LanguageToggle({
  disabled,
  variant = "light",
}: {
  disabled?: boolean;
  /** "light" sobre fondo claro (studio); "dark" sobre el hero oscuro (landing). */
  variant?: "light" | "dark";
}) {
  const { locale, setLocale } = useLocale();
  const border = variant === "dark" ? "border-white/20" : "border-hairline";
  const active = variant === "dark" ? "bg-on-dark text-ink" : "bg-primary text-on-primary";
  const idle = variant === "dark" ? "text-on-dark/70" : "text-body";

  return (
    <div className={`flex rounded-sm border ${border} p-0.5`}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          disabled={disabled}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`rounded-xs px-2 py-1 font-mono text-xs uppercase transition-colors ${
            locale === l ? active : idle
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
