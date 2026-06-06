"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/context";
import { LanguageToggle } from "./language-toggle";

interface Item {
  id: string;
  title: string;
  updatedAt: string;
}

/** Sidebar de conversaciones (tipo Claude): nueva charla + lista + activa. */
export function ConversationSidebar({
  activeId,
  onNew,
}: {
  activeId: string | null;
  onNew: () => void;
}) {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((j) => setItems(j.success ? j.data : []))
      .catch(() => setItems([]));
  }, [activeId]);

  return (
    <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-hairline bg-canvas-dark text-on-dark lg:flex">
      <div className="flex items-center justify-between px-4 py-4">
        <span className="text-base font-medium tracking-tight">
          Franc<span className="text-accent-orange">ast</span>.ai
        </span>
        <LanguageToggle variant="dark" />
      </div>

      <button
        type="button"
        onClick={onNew}
        className="mx-3 mb-2 rounded-lg border border-white/15 px-3 py-2 text-left text-sm transition-colors hover:border-accent-periwinkle"
      >
        + {t("cv.new")}
      </button>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {items.length === 0 ? (
          <p className="px-2 py-3 text-xs text-body">{t("cv.empty")}</p>
        ) : (
          items.map((it) => (
            <Link
              key={it.id}
              href={`/c/${it.id}`}
              className={`block truncate rounded-md px-3 py-2 text-sm transition-colors ${
                it.id === activeId
                  ? "bg-surface-dark-soft text-on-dark"
                  : "text-body hover:bg-surface-dark-soft hover:text-on-dark"
              }`}
            >
              {it.title || t("cv.untitled")}
            </Link>
          ))
        )}
      </div>
    </aside>
  );
}
