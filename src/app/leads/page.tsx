"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n/context";

interface Lead {
  id: string;
  slug: string;
  brand: string | null;
  city: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  source: string;
  createdAt: string;
}

export default function LeadsPage() {
  const [items, setItems] = useState<Lead[] | null>(null);
  const { locale } = useLocale();
  const t = useT();

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((j) => setItems(j.success ? j.data : []))
      .catch(() => setItems([]));
  }, []);

  return (
    <main className="flex flex-1 flex-col bg-canvas">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <Link href="/" className="eyebrow text-body hover:opacity-70">
          ← BrandME.ai
        </Link>
        <span className="text-sm font-semibold text-ink">{t("leads.title")}</span>
        <span className="w-16" />
      </header>

      <div className="mx-auto w-full max-w-[1100px] flex-1 p-6">
        {items === null && <p className="text-sm text-body">{t("leads.loading")}</p>}

        {items && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="bg-brand-gradient h-12 w-12 rounded-md" />
            <p className="text-sm text-body">{t("leads.empty")}</p>
            <Link href="/" className="text-sm text-accent-orange hover:opacity-70">
              {t("leads.create")}
            </Link>
          </div>
        )}

        {items && items.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-hairline bg-canvas-dark/5 text-xs uppercase text-body">
                <tr>
                  <th className="px-3 py-2">{t("leads.col.name")}</th>
                  <th className="px-3 py-2">{t("leads.col.contact")}</th>
                  <th className="px-3 py-2">{t("leads.col.page")}</th>
                  <th className="px-3 py-2">{t("leads.col.message")}</th>
                  <th className="px-3 py-2">{t("leads.col.date")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id} className="border-b border-hairline/60 last:border-0">
                    <td className="px-3 py-2 font-medium text-ink">{l.name}</td>
                    <td className="px-3 py-2 text-body">
                      {l.phone && (
                        <a href={`tel:${l.phone}`} className="block hover:text-accent-orange">
                          {l.phone}
                        </a>
                      )}
                      {l.email && (
                        <a href={`mailto:${l.email}`} className="block hover:text-accent-orange">
                          {l.email}
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/p/${l.slug}`} className="text-accent-orange hover:opacity-70">
                        {l.brand ?? l.slug}
                        {l.city ? ` · ${l.city}` : ""}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-body">{l.message ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[11px] text-muted">
                      {new Date(l.createdAt).toLocaleString(locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
