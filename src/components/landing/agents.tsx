"use client";

import { useT } from "@/lib/i18n/context";
import { AGENTS, AGENT_STEPS } from "@/lib/landing-content";
import { SectionHeading } from "./section-shell";

/** Equipo de 7 agentes de IA + mini "cómo funciona" de 3 pasos. */
export function Agents() {
  const t = useT();
  return (
    <section id="how" className="bg-canvas px-6 py-section md:px-8">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12">
        {/* How it works: 3 pasos */}
        <div className="grid gap-6 md:grid-cols-3">
          {AGENT_STEPS.map((step, i) => (
            <div key={step} className="flex flex-col gap-2">
              <span className="font-mono text-2xl font-medium text-accent-orange">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-sm leading-relaxed text-body">{t(step)}</p>
            </div>
          ))}
        </div>

        <SectionHeading
          eyebrowKey="ll.agents.eyebrow"
          introKey="ll.agents.intro"
        />
        <h2 className="-mt-8 max-w-2xl text-3xl font-medium leading-tight tracking-[-1px] md:text-4xl">
          <span className="text-ink">{t("ll.agents.title1")} </span>
          <span className="font-serif italic text-accent-orange">{t("ll.agents.title2")}</span>
        </h2>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a) => (
            <div
              key={a.number}
              className="flex flex-col gap-2 rounded-lg border border-hairline p-5 transition-shadow hover:shadow-md"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-body">
                Agent {a.number}
              </span>
              <h3 className="text-lg font-medium text-ink">{t(a.titleKey)}</h3>
              <p className="text-sm leading-relaxed text-body">{t(a.descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
