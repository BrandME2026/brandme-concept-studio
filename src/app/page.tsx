import { LandingNav } from "@/components/landing/nav";
import { PromoBanner } from "@/components/landing/promo-banner";
import { Hero } from "@/components/landing/hero";
import { StatsBand } from "@/components/landing/stats-band";
import { Gallery } from "@/components/landing/gallery";
import { Comparison } from "@/components/landing/comparison";
import { Agents } from "@/components/landing/agents";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Datos estructurados (JSON-LD): ayuda a Google a entender la marca y el producto. */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Francast.ai",
  url: SITE_URL,
  description:
    "AI marketing for franchise consultants — a full AI-powered page for every franchise brand in your portfolio.",
  makesOffer: {
    "@type": "Offer",
    itemOffered: {
      "@type": "SoftwareApplication",
      name: "BrandMe by Francast",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
    },
  },
};

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PromoBanner />
      <LandingNav />
      <Hero />
      <StatsBand />
      <Gallery />
      <Comparison />
      <Agents />
      <Pricing />
      <Faq />
      <Footer />
    </main>
  );
}
