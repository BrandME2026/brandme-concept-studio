import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/context";
import { es } from "@/lib/i18n/es";
import { en } from "@/lib/i18n/en";
import { LOCALE_COOKIE, resolveInitialLocale } from "@/lib/i18n/locale";

/** Resuelve el idioma en el servidor (cookie + Accept-Language) para SSR sin flash. */
async function getServerLocale() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveInitialLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get("accept-language"),
  );
}

// Display sans — sustituto open-source de "The Future" (DESIGN.md together.ai).
const inter = Inter({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Mono en mayúsculas — sustituto de "PP Neue Montreal Mono" para eyebrows y labels.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

/** URL pública del sitio (configurable por env). Fallback para desarrollo. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const dict = locale === "en" ? en : es;
  const title = dict["meta.title"];
  const description = dict["meta.description"];
  const siteName = dict["meta.siteName"];

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    keywords: dict["meta.keywords"],
    applicationName: siteName,
    alternates: {
      canonical: "/",
      languages: { es: "/", en: "/" },
    },
    openGraph: {
      type: "website",
      siteName,
      title: dict["meta.ogTitle"],
      description,
      url: "/",
      locale: locale === "en" ? "en_US" : "es_ES",
    },
    twitter: {
      card: "summary_large_image",
      title: dict["meta.ogTitle"],
      description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col bg-canvas text-ink font-display">
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
