"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n/context";
import { inferCategory, CATEGORY_ORDER, type Category } from "@/lib/brand-category";
import { SectionHeading } from "./section-shell";

interface GalleryItem {
  id: string;
  url: string;
  name: string;
  screenshot: string | null;
  createdAt: string;
}

/** Galería de páginas REALES generadas (del historial). Agrupadas por categoría inferida. */
export function Gallery() {
  const t = useT();
  const [items, setItems] = useState<GalleryItem[] | null>(null);

  useEffect(() => {
    fetch("/api/gallery")
      .then((r) => r.json())
      .then((j) => setItems(j.success ? j.data.items : []))
      .catch(() => setItems([]));
  }, []);

  // Agrupar por categoría inferida del dominio, en orden estable.
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: (items ?? []).filter((it) => inferCategory(it.url).id === cat.id),
  })).filter((g) => g.items.length > 0);

  return (
    <section id="gallery" className="bg-canvas px-6 py-section md:px-8">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12">
        <SectionHeading
          eyebrowKey="ll.gallery.eyebrow"
          titleKey="ll.gallery.title"
          introKey="ll.gallery.intro"
        />

        {items === null && (
          <p className="text-sm text-body">{t("ll.gallery.loading")}</p>
        )}

        {items !== null && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-hairline py-16 text-center">
            <div className="bg-brand-gradient h-12 w-12 rounded-md" />
            <p className="text-sm text-body">{t("ll.gallery.empty")}</p>
            <a href="#top" className="text-sm text-accent-orange hover:opacity-70">
              {t("ll.gallery.emptyCta")}
            </a>
          </div>
        )}

        {grouped.map((g) => (
          <CategoryBlock key={g.cat.id} category={g.cat} items={g.items} />
        ))}
      </div>
    </section>
  );
}

function CategoryBlock({ category, items }: { category: Category; items: GalleryItem[] }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-orange/10 text-lg">
          {category.icon}
        </span>
        <div>
          <h3 className="text-lg font-medium text-ink">{t(category.nameKey)}</h3>
          <p className="font-mono text-[10px] uppercase tracking-tight text-body">
            {t("ll.gallery.count", { n: items.length })}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <PageCard key={it.id} item={it} />
        ))}
      </div>
    </div>
  );
}

function PageCard({ item }: { item: GalleryItem }) {
  const t = useT();
  const { locale } = useLocale();
  let host = item.url;
  try {
    host = new URL(item.url).hostname.replace(/^www\./, "");
  } catch {
    /* dejar tal cual */
  }
  return (
    <Link
      href={`/p/${item.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-hairline transition-shadow hover:shadow-md"
    >
      {item.screenshot ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.screenshot}
          alt={item.name}
          className="h-40 w-full object-cover object-top"
        />
      ) : (
        <div className="bg-brand-gradient h-40 w-full" />
      )}
      <div className="flex flex-col gap-1 p-3">
        <p className="truncate font-medium text-ink">{item.name}</p>
        <p className="truncate font-mono text-[10px] text-body">{host}</p>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-muted">
            {new Date(item.createdAt).toLocaleDateString(locale)}
          </span>
          <span className="text-xs text-accent-orange opacity-0 transition-opacity group-hover:opacity-100">
            {t("ll.gallery.viewPage")}
          </span>
        </div>
      </div>
    </Link>
  );
}
