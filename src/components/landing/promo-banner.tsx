"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";

/** Banner promocional amarillo, descartable (no persiste). */
export function PromoBanner() {
  const t = useT();
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-accent-mint px-6 py-2 text-center text-sm text-ink">
      <p className="font-mono text-xs tracking-tight">
        ⚡ {t("ll.promo.text")}{" "}
        <a href="#pricing" className="font-semibold underline">
          {t("ll.promo.link")}
        </a>
      </p>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={t("ll.promo.dismiss")}
        className="absolute right-6 text-body transition-opacity hover:opacity-70"
      >
        ✕
      </button>
    </div>
  );
}
