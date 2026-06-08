"use client";

import { useT } from "@/lib/i18n/context";

/** Footer de la landing: marca, tagline, columnas de links y copyright. */
export function Footer() {
  const t = useT();
  const product: { key: Parameters<typeof t>[0]; href: string }[] = [
    { key: "ll.nav.howItWorks", href: "#how" },
    { key: "ll.nav.gallery", href: "#gallery" },
    { key: "ll.nav.pricing", href: "#pricing" },
    { key: "ll.nav.faq", href: "#faq" },
  ];
  const legal: Parameters<typeof t>[0][] = ["ll.footer.privacy", "ll.footer.terms"];

  return (
    <footer className="border-t border-hairline bg-canvas-dark px-6 py-16 text-on-dark md:px-8">
      <div className="mx-auto grid w-full max-w-[1280px] gap-10 md:grid-cols-[2fr_1fr_1fr]">
        <div className="flex flex-col gap-2">
          <span className="text-lg font-medium tracking-tight">
            Brand<span className="text-accent-orange">ME</span>.ai
          </span>
          <p className="max-w-xs text-sm text-body">{t("ll.footer.tagline")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="eyebrow text-body">{t("ll.footer.product")}</span>
          {product.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-body hover:text-on-dark">
              {t(l.key)}
            </a>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <span className="eyebrow text-body">{t("ll.footer.legal")}</span>
          {legal.map((k) => (
            <a key={k} href="#" className="text-sm text-body hover:text-on-dark">
              {t(k)}
            </a>
          ))}
        </div>
      </div>
      <p className="mx-auto mt-12 w-full max-w-[1280px] font-mono text-[10px] uppercase tracking-tight text-hairline">
        {t("ll.footer.rights")}
      </p>
    </footer>
  );
}
