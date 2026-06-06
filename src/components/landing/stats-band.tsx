"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { STATS } from "@/lib/landing-content";
import { CountUp } from "./count-up";

/**
 * Banda de stats. "Brands in registry" es REAL (COUNT del historial vía /api/gallery);
 * los demás son claims de producto (copy). Los animados usan contador.
 */
export function StatsBand() {
  const t = useT();
  const [realBrands, setRealBrands] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/gallery")
      .then((r) => r.json())
      .then((j) => setRealBrands(j.success ? j.data.total : 0))
      .catch(() => setRealBrands(0));
  }, []);

  return (
    <section className="bg-canvas-dark px-6 py-section text-on-dark md:px-8">
      <div className="mx-auto w-full max-w-[1280px]">
        <p className="mb-12 text-center font-mono text-xs uppercase tracking-[0.1em] text-body">
          <span className="text-accent-mint">●</span> {t("ll.stats.eyebrow")}
        </p>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {STATS.map((s) => {
            // El stat de "brands" se sustituye por el COUNT real.
            const isReal = s.labelKey === "ll.stats.brands";
            const realValue = isReal ? realBrands : null;
            return (
              <div key={s.labelKey} className="text-center">
                <div className="text-4xl font-medium tracking-tight md:text-6xl">
                  {isReal ? (
                    <CountUp value={realValue ?? 0} />
                  ) : s.animated && s.value != null ? (
                    <CountUp value={s.value} suffix={s.suffix} />
                  ) : (
                    s.display
                  )}
                </div>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-body">
                  {t(s.labelKey)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
