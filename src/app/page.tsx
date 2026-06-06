import { AppShell } from "@/components/app-shell";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Francast.ai",
  url: SITE_URL,
  description:
    "AI marketing for franchise consultants — a full AI-powered page for every franchise brand in your portfolio.",
};

export default function Home() {
  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AppShell />
    </main>
  );
}
