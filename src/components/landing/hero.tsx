"use client";

import { useT } from "@/lib/i18n/context";
import { TerminalPanel } from "./terminal-panel";

/** Hero: titular grande a la izquierda + terminal (onboarding) a la derecha. */
export function Hero() {
  const t = useT();
  const checks = ["ll.hero.check1", "ll.hero.check2", "ll.hero.check3"] as const;

  return (
    <section id="top" className="bg-canvas px-6 py-section md:px-8">
      <div className="mx-auto grid w-full max-w-[1280px] items-center gap-12 lg:grid-cols-2">
        {/* Columna izquierda */}
        <div className="flex flex-col gap-6">
          <span className="eyebrow text-accent-orange">{t("ll.hero.eyebrow")}</span>
          <h1 className="text-5xl font-medium leading-[0.95] tracking-[-2px] md:text-7xl">
            <span className="block text-ink">{t("ll.hero.title1")}</span>
            <span className="block text-ink">{t("ll.hero.title2")}</span>
            <span className="block font-serif italic text-accent-orange">
              {t("ll.hero.title3")}
            </span>
          </h1>
          <span className="w-fit rounded-full bg-accent-periwinkle/20 px-3 py-1 font-mono text-[11px] uppercase tracking-tight text-ink">
            {t("ll.hero.badge")}
          </span>
          <p className="max-w-md text-lg leading-relaxed text-body">{t("ll.hero.lead")}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {checks.map((c) => (
              <li key={c} className="flex items-center gap-1.5 font-mono text-xs text-body">
                <span className="text-accent-orange">✓</span>
                {t(c)}
              </li>
            ))}
          </ul>
        </div>

        {/* Columna derecha: terminal con el onboarding */}
        <div className="flex flex-col gap-3">
          <TerminalPanel />
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.1em] text-hairline">
            {t("ll.hero.sample")}
          </p>
        </div>
      </div>
    </section>
  );
}
