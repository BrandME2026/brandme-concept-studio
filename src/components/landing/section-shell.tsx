"use client";

import { useT } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/es";

/** Encabezado de sección reutilizable: eyebrow + título + intro opcional. */
export function SectionHeading({
  eyebrowKey,
  titleKey,
  introKey,
  dark = false,
}: {
  eyebrowKey: TranslationKey;
  titleKey?: TranslationKey;
  introKey?: TranslationKey;
  dark?: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <span className="eyebrow text-accent-orange">{t(eyebrowKey)}</span>
      {titleKey && (
        <h2
          className={`max-w-2xl text-3xl font-medium leading-tight tracking-[-1px] md:text-4xl ${
            dark ? "text-on-dark" : "text-ink"
          }`}
        >
          {t(titleKey)}
        </h2>
      )}
      {introKey && (
        <p className={`max-w-2xl text-base leading-relaxed ${dark ? "text-body" : "text-body"}`}>
          {t(introKey)}
        </p>
      )}
    </div>
  );
}
