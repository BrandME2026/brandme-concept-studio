import type { Metadata } from "next";
import { Gallery } from "@/components/landing/gallery";
import { WebsHeader } from "./webs-header";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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

/** Galería pública navegable: lista todas las webs generadas y enlaza a cada /p/[slug]. */
export default function WebsPage() {
  return (
    <main className="flex min-h-[100dvh] flex-col overflow-y-auto bg-canvas">
      <WebsHeader />
      <Gallery showHeading={false} />
    </main>
  );
}
