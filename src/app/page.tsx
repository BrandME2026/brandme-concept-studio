import { HomeChat } from "@/components/home-chat";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Datos estructurados (JSON-LD) mínimos para SEO. */
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
    <main className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeChat />
    </main>
  );
}
