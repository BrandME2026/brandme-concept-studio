"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/context";

/** Encabezado de la galería pública: título SEO + CTA de vuelta a crear. */
export function WebsHeader() {
  const t = useT();
  return (
    <header className="border-b border-hairline bg-canvas px-6 pb-8 pt-12 md:px-8">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <span className="eyebrow text-accent-orange">{t("webs.eyebrow")}</span>
        <h1 className="max-w-2xl text-3xl font-medium leading-tight tracking-[-1px] text-ink md:text-4xl">
          {t("webs.title")}
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-body">
          {t("webs.intro")}
        </p>
        <Link
          href="/"
          className="mt-2 w-fit rounded-md bg-accent-orange px-4 py-2 text-sm font-medium text-on-dark transition-opacity hover:opacity-90"
        >
          {t("webs.cta")}
        </Link>
      </div>
    </header>
  );
}
