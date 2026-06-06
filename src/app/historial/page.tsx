"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n/context";

interface HistoryItem {
  id: string;
  url: string;
  name: string;
  screenshot: string | null;
  createdAt: string;
}

export default function HistorialPage() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { locale } = useLocale();
  const t = useT();

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setItems(j.data);
        else setError(j.error?.message ?? "Error");
      })
      .catch(() => setError(t("history.loadError")));
  }, [t]);

  return (
    <main className="flex flex-1 flex-col bg-canvas">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <Link href="/" className="eyebrow text-body hover:opacity-70">
          ← BrandMe
        </Link>
        <span className="text-sm font-semibold text-ink">{t("history.title")}</span>
        <span className="w-16" />
      </header>

      <div className="mx-auto w-full max-w-[1100px] flex-1 p-6">
        {error && <p className="text-accent-orange">{error}</p>}

        {items === null && !error && (
          <p className="text-sm text-body">{t("history.loading")}</p>
        )}

        {items && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="bg-brand-gradient h-12 w-12 rounded-[--radius-cb]" />
            <p className="text-sm text-body">{t("history.empty")}</p>
            <Link
              href="/"
              className="rounded-pill bg-[--color-cb-blue] px-4 py-2 text-sm font-semibold text-on-primary"
            >
              {t("history.create")}
            </Link>
          </div>
        )}

        {items && items.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <Link
                key={it.id}
                href={`/historial/${it.id}`}
                className="group overflow-hidden rounded-[--radius-cb] border border-hairline transition-shadow hover:shadow-lg"
              >
                {it.screenshot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.screenshot}
                    alt={it.name}
                    className="h-40 w-full object-cover object-top"
                  />
                ) : (
                  <div className="bg-brand-gradient h-40 w-full" />
                )}
                <div className="p-3">
                  <p className="truncate font-semibold text-ink">{it.name}</p>
                  <p className="truncate text-xs text-muted">{it.url}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {new Date(it.createdAt).toLocaleString(locale)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
