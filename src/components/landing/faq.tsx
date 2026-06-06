"use client";

import { useT } from "@/lib/i18n/context";
import { FAQ_ITEMS } from "@/lib/landing-content";
import { SectionHeading } from "./section-shell";

/** FAQ con acordeón nativo (<details>) — accesible sin JS. */
export function Faq() {
  const t = useT();
  return (
    <section id="faq" className="bg-canvas px-6 py-section md:px-8">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <SectionHeading eyebrowKey="ll.faq.eyebrow" titleKey="ll.faq.title" />
        <div className="flex flex-col gap-3">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.qKey}
              className="group rounded-lg border border-hairline px-4 py-3"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-2 font-medium text-ink">
                {t(item.qKey)}
                <span className="text-accent-orange transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-body">{t(item.aKey)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
