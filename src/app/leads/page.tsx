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

/** Métricas derivadas de la lista de leads (sin endpoint extra: se calculan en cliente). */
function computeKpis(items: Lead[]) {
  const now = Date.now();
  const DAY = 86_400_000;
  const since = (days: number) =>
    items.filter((l) => now - new Date(l.createdAt).getTime() <= days * DAY).length;
  // Página con más leads (marca · ciudad).
  const byPage = new Map<string, number>();
  for (const l of items) {
    const key = `${l.brand ?? l.slug}${l.city ? ` · ${l.city}` : ""}`;
    byPage.set(key, (byPage.get(key) ?? 0) + 1);
  }
  let top: { name: string; n: number } | null = null;
  for (const [name, n] of byPage) if (!top || n > top.n) top = { name, n };
  const withContact = items.filter((l) => l.phone || l.email).length;
  return {
    total: items.length,
    form: items.filter((l) => l.source === "form").length,
    agent: items.filter((l) => l.source === "agent").length,
    last7: since(7),
    last30: since(30),
    top,
    contactPct: items.length ? Math.round((withContact / items.length) * 100) : 0,
  };
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

  const kpis = items && items.length > 0 ? computeKpis(items) : null;

  return (
    <main className="flex min-h-[100dvh] flex-1 flex-col bg-canvas-dark text-on-dark">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <Link href="/" className="eyebrow text-body hover:text-on-dark">
          ← BrandME.ai
        </Link>
        <span className="text-sm font-semibold text-on-dark">{t("leads.title")}</span>
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

        {kpis && (
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: t("leads.kpi.total"), value: String(kpis.total) },
              {
                label: t("leads.kpi.form") + " / " + t("leads.kpi.agent"),
                value: `${kpis.form} / ${kpis.agent}`,
              },
              { label: t("leads.kpi.last7"), value: String(kpis.last7) },
              { label: t("leads.kpi.contactRate"), value: `${kpis.contactPct}%` },
              { label: t("leads.kpi.last30"), value: String(kpis.last30) },
              {
                label: t("leads.kpi.topPage"),
                value: kpis.top ? `${kpis.top.name} (${kpis.top.n})` : t("leads.kpi.none"),
                wide: true,
              },
            ].map((k, i) => (
              <div
                key={i}
                className={`rounded-xl border border-white/10 bg-white/5 p-4 ${
                  k.wide ? "col-span-2" : ""
                }`}
              >
                <p className="eyebrow text-body">{k.label}</p>
                <p className="mt-1 truncate text-xl font-medium text-on-dark">{k.value}</p>
              </div>
            ))}
          </div>
        )}

        {items && items.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-body">
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
                  <tr key={l.id} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2 font-medium text-on-dark">{l.name}</td>
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
