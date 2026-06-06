"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cuenta de 0 a `value` cuando entra en viewport (una sola vez). rAF + easeOutCubic.
 * Respeta prefers-reduced-motion (salta directo al valor). SSR-safe (arranca en 0).
 */
export function CountUp({
  value,
  suffix = "",
  durationMs = 1400,
}: {
  value: number;
  suffix?: string;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Lazy init: en reduced-motion arrancamos directamente en el valor final, sin
  // animar ni hacer setState síncrono dentro del effect.
  const [display, setDisplay] = useState(() => {
    if (typeof window === "undefined") return 0;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? value : 0;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          raf = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}
