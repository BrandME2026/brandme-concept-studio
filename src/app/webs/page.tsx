import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { listAllGenerations, type GenerationListItem } from "@/lib/db/history";
import { isDbConfigured } from "@/lib/db/client";
import { inferCategory, CATEGORY_ORDER } from "@/lib/brand-category";
import { es } from "@/lib/i18n/es";
import { en } from "@/lib/i18n/en";
import { LOCALE_COOKIE, resolveInitialLocale } from "@/lib/i18n/locale";
import type { TranslationKey } from "@/lib/i18n/es";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// SSR: las cards van en el HTML del servidor (indexables por Google), no inyectadas
// por JS en el cliente. Por eso /webs es server component y lee la DB directamente.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Webs creadas con Francast.ai | Galería pública",
  description:
    "Galería pública de páginas de marketing reales generadas por IA con Francast.ai. Explora las webs en vivo o crea la tuya.",
  alternates: { canonical: "/webs" },
  openGraph: {
    type: "website",
    title: "Webs creadas con Francast.ai",
    description:
      "Galería pública de páginas de marketing reales generadas por IA con Francast.ai.",
    url: `${SITE_URL}/webs`,
  },
  robots: { index: true, follow: true },
};

async function getDict() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveInitialLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get("accept-language"),
  );
  return { dict: locale === "en" ? en : es, locale };
}

/** Galería pública navegable y SSR: lista todas las webs generadas, agrupadas por categoría. */
export default async function WebsPage() {
  const { dict, locale } = await getDict();
  const t = (k: TranslationKey) => dict[k];

  let items: GenerationListItem[] = [];
  if (isDbConfigured()) {
    try {
      items = await listAllGenerations();
    } catch {
      items = [];
    }
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: items.filter((it) => inferCategory(it.url).id === cat.id),
  })).filter((g) => g.items.length > 0);

  return (
    <main className="flex min-h-[100dvh] flex-col overflow-y-auto bg-canvas">
      <header className="border-b border-hairline bg-canvas px-6 pb-8 pt-12 md:px-8">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
          <span className="eyebrow text-accent-orange">{t("webs.eyebrow")}</span>
          <h1 className="max-w-2xl text-3xl font-medium leading-tight tracking-[-1px] text-ink md:text-4xl">
            {t("webs.title")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-body">{t("webs.intro")}</p>
          <Link
            href="/"
            className="mt-2 w-fit rounded-md bg-accent-orange px-4 py-2 text-sm font-medium text-on-dark transition-opacity hover:opacity-90"
          >
            {t("webs.cta")}
          </Link>
        </div>
      </header>

      <section className="bg-canvas px-6 py-section md:px-8">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12">
          {items.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-hairline py-16 text-center">
              <div className="bg-brand-gradient h-12 w-12 rounded-md" />
              <p className="text-sm text-body">{t("ll.gallery.empty")}</p>
              <Link href="/" className="text-sm text-accent-orange hover:opacity-70">
                {t("ll.gallery.emptyCta")}
              </Link>
            </div>
          )}

          {grouped.map((g) => (
            <div key={g.cat.id} className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-orange/10 text-lg">
                  {g.cat.icon}
                </span>
                <div>
                  <h2 className="text-lg font-medium text-ink">{t(g.cat.nameKey)}</h2>
                  <p className="font-mono text-[10px] uppercase tracking-tight text-body">
                    {dict["ll.gallery.count"].replace("{n}", String(g.items.length))}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((it) => (
                  <PageCard key={it.id} item={it} viewLabel={t("ll.gallery.viewPage")} locale={locale} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function PageCard({
  item,
  viewLabel,
  locale,
}: {
  item: GenerationListItem;
  viewLabel: string;
  locale: string;
}) {
  let host = item.url;
  try {
    host = new URL(item.url).hostname.replace(/^www\./, "");
  } catch {
    /* dejar tal cual */
  }
  return (
    <Link
      href={`/p/${item.slug ?? item.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-hairline transition-shadow hover:shadow-md"
    >
      {item.screenshot ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.screenshot} alt={item.name} className="h-40 w-full object-cover object-top" />
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
            {viewLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}
