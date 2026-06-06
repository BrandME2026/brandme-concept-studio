"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { es, type TranslationKey } from "./es";
import { en } from "./en";
import { LOCALE_COOKIE, type Locale } from "./locale";

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { es, en };
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Sustituye {placeholders} por sus valores. Sin librería. */
function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

export type TFunction = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      // Fail-soft: cae al español y, si tampoco, a la clave cruda.
      const value = DICTIONARIES[locale][key] ?? es[key] ?? key;
      return format(value, vars);
    },
    [locale],
  );

  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n debe usarse dentro de <LanguageProvider>");
  return ctx;
}

export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void } {
  const { locale, setLocale } = useI18n();
  return { locale, setLocale };
}

export function useT(): I18nValue["t"] {
  return useI18n().t;
}
