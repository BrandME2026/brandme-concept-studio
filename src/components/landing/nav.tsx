"use client";

import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { useT } from "@/lib/i18n/context";

/** Nav sticky de la landing: logo, anclas, sign in, CTA y toggle de idioma. */
export function LandingNav() {
  const t = useT();
  const links: { href: string; key: Parameters<typeof t>[0] }[] = [
    { href: "#how", key: "ll.nav.howItWorks" },
    { href: "#gallery", key: "ll.nav.gallery" },
    { href: "#pricing", key: "ll.nav.pricing" },
    { href: "#faq", key: "ll.nav.faq" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-canvas/90 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-6 py-3 md:px-8">
        <a href="#top" className="text-lg font-medium tracking-tight text-ink">
          Brand<span className="text-accent-orange">ME</span>.ai
        </a>

        <div className="hidden items-center gap-6 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-body transition-colors hover:text-ink"
            >
              {t(l.key)}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <a
            href="#"
            className="hidden text-sm text-body transition-colors hover:text-ink sm:block"
          >
            {t("ll.nav.signIn")}
          </a>
          <LanguageToggle variant="light" />
          <Button variant="primary" className="bg-accent-orange text-on-dark">
            {t("ll.nav.cta")}
          </Button>
        </div>
      </nav>
    </header>
  );
}
