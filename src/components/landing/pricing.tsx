"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { PRICING_TIERS } from "@/lib/landing-content";
import { SectionHeading } from "./section-shell";

/** Pricing: 3 tiers. Precios placeholder ($—) hasta que el cliente los confirme. */
export function Pricing() {
  const t = useT();
  return (
    <section id="pricing" className="bg-canvas px-6 py-section md:px-8">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col items-center gap-12">
        <div className="text-center">
          <SectionHeading
            eyebrowKey="ll.pricing.eyebrow"
            titleKey="ll.pricing.title"
            introKey="ll.pricing.intro"
          />
        </div>

        <div className="grid w-full gap-6 md:grid-cols-3">
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.nameKey}
              className={`relative flex flex-col gap-4 rounded-lg border p-6 ${
                tier.highlighted ? "border-accent-orange shadow-lg" : "border-hairline"
              }`}
            >
              {tier.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-orange px-3 py-0.5 font-mono text-[10px] uppercase text-on-dark">
                  {t("ll.pricing.popular")}
                </span>
              )}
              <h3 className="text-lg font-medium text-ink">{t(tier.nameKey)}</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-medium text-ink">{t(tier.priceKey)}</span>
                <span className="text-sm text-body">{t("ll.pricing.perMonth")}</span>
              </div>
              <p className="text-sm text-body">{t(tier.descKey)}</p>
              <ul className="flex flex-col gap-2">
                {tier.featureKeys.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-body">
                    <span className="mt-0.5 text-accent-orange">✓</span>
                    {t(f)}
                  </li>
                ))}
              </ul>
              <Button
                variant={tier.highlighted ? "primary" : "outline"}
                className={tier.highlighted ? "mt-auto bg-accent-orange text-on-dark" : "mt-auto"}
              >
                {t(tier.ctaKey)}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
