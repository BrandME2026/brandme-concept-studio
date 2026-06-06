"use client";

import { useT } from "@/lib/i18n/context";
import { COMPARISON_OLD, COMPARISON_NEW } from "@/lib/landing-content";
import type { TranslationKey } from "@/lib/i18n/es";

/** Dos columnas: la forma antigua (✗) vs BrandMe (✓). */
export function Comparison() {
  return (
    <section className="bg-canvas px-6 py-section md:px-8">
      <div className="mx-auto grid w-full max-w-[1280px] gap-6 md:grid-cols-2">
        <Column
          variant="old"
          eyebrowKey="ll.compare.old.eyebrow"
          titleKey="ll.compare.old.title"
          items={COMPARISON_OLD}
        />
        <Column
          variant="new"
          eyebrowKey="ll.compare.new.eyebrow"
          titleKey="ll.compare.new.title"
          items={COMPARISON_NEW}
        />
      </div>
    </section>
  );
}

function Column({
  variant,
  eyebrowKey,
  titleKey,
  items,
}: {
  variant: "old" | "new";
  eyebrowKey: TranslationKey;
  titleKey: TranslationKey;
  items: TranslationKey[];
}) {
  const t = useT();
  const isNew = variant === "new";
  return (
    <div
      className={`flex flex-col gap-4 rounded-lg border p-6 ${
        isNew ? "border-accent-orange bg-canvas" : "border-hairline bg-canvas"
      }`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
          isNew ? "bg-accent-orange text-on-dark" : "bg-hairline text-body"
        }`}
      >
        {isNew ? "✓" : "✕"}
      </span>
      <span className="eyebrow text-body">{t(eyebrowKey)}</span>
      <h3 className="text-xl font-medium leading-snug text-ink">{t(titleKey)}</h3>
      <ul className="mt-2 flex flex-col gap-2.5">
        {items.map((k) => (
          <li key={k} className="flex items-start gap-2 text-sm text-body">
            <span className={isNew ? "mt-0.5 text-accent-orange" : "mt-0.5 text-hairline"}>
              {isNew ? "✓" : "✕"}
            </span>
            {t(k)}
          </li>
        ))}
      </ul>
    </div>
  );
}
