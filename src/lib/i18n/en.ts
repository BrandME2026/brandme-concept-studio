import type { TranslationKey } from "./es";

/** Diccionario inglés. Mismas claves que es.ts. */
export const en: Record<TranslationKey, string> = {
  // Metadata (layout) — SEO
  "meta.title": "Francast.ai — AI marketing for franchise consultants",
  "meta.description":
    "BrandMe builds a full AI-powered page for every franchise brand in your portfolio: 100 SEO pages, a brand-smart AMA, and lead agents that never sleep. Live in 4 minutes.",
  "meta.ogTitle": "Francast.ai — Launch every franchise brand with its own AI",
  "meta.keywords":
    "franchise marketing, franchise consultant, SEO pages, AMA, FDD, lead capture, BrandMe, Francast",
  "meta.siteName": "Francast.ai",

  // Landing
  "landing.eyebrow": "Tell our agent your brands",
  "landing.h1": "Tell us about your firm and we'll launch your brand.",
  "landing.lead":
    "Answer a few questions and our agent identifies the official site, analyzes it, and generates your proposal with a live preview.",

  // Onboarding — questions (steps)
  "onboarding.step.name": "What's your name and firm?",
  "onboarding.step.name.placeholder": "e.g. Shawn Whitaker, Whitaker Franchise",
  "onboarding.step.brand": "Which franchise brand do you want to launch first?",
  "onboarding.step.first": "Which one do we launch first?",
  "onboarding.step.markets": "Which markets do you focus on for that brand?",
  "onboarding.step.markets.placeholder": "e.g. Dallas, Plano, Frisco",
  "onboarding.step.investor": "What kind of investor profile is your sweet spot?",
  "onboarding.step.positioning":
    "What's your positioning? What do you sell that nobody else does?",
  "onboarding.step.positioning.placeholder":
    "e.g. Texas-only, owner-operator-first, operations-led",
  "onboarding.step.confirm": "Here's what happens next:",

  // Onboarding — investor profiles
  "investor.firstTime": "First-time owner",
  "investor.multiUnit": "Multi-unit operator",
  "investor.successor": "Family-business successor",
  "investor.mix": "Mix of all three",

  // Onboarding — confirm actions
  "onboarding.confirm.fdd": "Pull the FDD for the brand",
  "onboarding.confirm.page": "Generate your franchise landing page",
  "onboarding.confirm.seo": "Spin up 100 SEO pages",
  "onboarding.confirm.ama": "Train an AMA agent on your offer",
  "onboarding.confirm.cockpit": "Set up your operations cockpit",

  // Onboarding — buttons and validation
  "onboarding.send": "Send",
  "onboarding.continue": "Continue",
  "onboarding.shipIt": "Yes, ship it →",
  "onboarding.shipping": "Shipping…",
  "onboarding.minChars": "Please write at least {n} characters.",
  "onboarding.pickBrand": "Pick at least one brand.",
  "onboarding.resolveFailed":
    "Couldn't identify the official site for {brand}. Try again.",
  "onboarding.connectionFailed":
    "Connection failed. Check your network and try again.",

  // Studio — topbar
  "studio.back": "Back to home",
  "studio.history": "History",
  "studio.extraction.show": "Show extracted design",
  "studio.extraction.hide": "Hide extracted design",
  "studio.quality.fast": "Fast",
  "studio.quality.high": "High",
  "studio.quality.title": "Generation quality: Fast (Sonnet) or High (GPT-5.5)",
  "studio.generate": "Generate proposal",
  "studio.generating": "Generating…",
  "studio.includes": "Includes",
  "studio.tab.extract": "Extraction",
  "studio.tab.chat": "Chat",
  "studio.tab.preview": "Preview",

  // Studio — chat panel
  "chat.header": "Refine design",
  "chat.empty":
    "Describe how you want your design: “darker”, “serif typography”, “minimalist style”. It'll guide the proposal when you hit Generate.",
  "chat.placeholder": "Type a message…",
  "chat.hint": "Enter sends · Shift+Enter for a new line",
  "chat.send": "Send",

  // Studio — extraction panel
  "extraction.eyebrow": "Extraction",
  "extraction.zoom": "Zoom",
  "extraction.zoom.aria": "Zoom screenshot",
  "extraction.screenshotAlt": "Reference website screenshot",
  "extraction.palette": "Palette",
  "extraction.typography": "Typography",
  "extraction.spacing": "Spacing",

  // Studio — extraction loading screen
  "extraction.loading.title": "Extracting design…",
  "extraction.loading.lead":
    "We render the full site to read its real colors, typography and layout.",
  "extraction.loading.slow":
    "This site is taking longer than usual (it may be heavy or bot-protected). We're still trying… if it fails, we'll let you know.",

  // Studio — generation progress
  "progress.eyebrow": "Generating proposal…",
  "progress.naming": "Naming the system",
  "progress.aesthetic": "Defining the aesthetic",
  "progress.palette": "Choosing the palette",
  "progress.typography": "Composing typography",
  "progress.principles": "Writing principles",
  "progress.preview": "Laying out the preview",
  "progress.note":
    "It may take up to a minute. We're composing a new design inspired by the site, not a copy.",

  // Studio — reasoning panel (what the agent is thinking)
  "reasoning.toggle": "View agent reasoning",
  "reasoning.eyebrow": "Agent reasoning",
  "reasoning.narrated.start":
    "Analyzing the extracted tokens and screenshot of the original site to understand its visual identity…",
  "reasoning.narrated.palette":
    "Detected the site's base palette and deriving a range that keeps its character without copying it.",
  "reasoning.narrated.typography":
    "Composing a typographic hierarchy that fits the brand and stays legible on screen.",
  "reasoning.narrated.principles":
    "Writing the design principles that guide the system's decisions.",
  "reasoning.narrated.html":
    "Laying out the preview with Tailwind and micro-interactions to show the system in action.",

  // Studio — proposal actions
  "proposal.copy": "Copy HTML",
  "proposal.copied": "Copied!",
  "proposal.download": "Download DESIGN.md",
  "proposal.regenerate": "Regenerate",

  // Studio — extraction error / generic
  "studio.extractError": "Extraction error",
  "studio.retry": "Retry",

  // Studio — empty preview (guide steps)
  "studio.empty.step.review": "Review the extracted design",
  "studio.empty.step.refine": "Refine it in the chat (optional)",
  "studio.empty.step.generate": "Hit Generate proposal",
  "studio.empty.hint": "Your new design preview will show up here.",

  // Studio — accessible labels
  "extraction.zoomedAlt": "Zoomed screenshot of the site",
  "extraction.drawer.label": "Extracted design",
  "extraction.drawer.close": "Close",

  // History
  "history.title": "History",
  "history.loading": "Loading…",
  "history.loadError": "Couldn't load the history",
  "history.empty": "You haven't generated proposals yet. Go back home and create the first one.",
  "history.create": "Create proposal",

  // Home chat (full-screen conversational interface)
  "hc.greeting": "Which franchise brand do you want to launch today?",
  "hc.subtitle":
    "Tell me about your business and I'll build a full AI-powered page: SEO, AMA and lead capture.",
  "hc.placeholder": "Type here… (e.g. I want to launch Burger King in Dallas)",
  "hc.send": "Send",
  "hc.hint": "Enter sends · Shift+Enter for a new line",
  "hc.launching": "Preparing your page…",
  "hc.suggest1": "I want to launch Burger King in Dallas",
  "hc.suggest2": "How does it work?",
  "hc.suggest3": "I have several franchise brands",
  "hc.resolveFailed": "I couldn't identify the official site for {brand}. Can you share the URL?",

  // ── Long landing (Francast.ai) ───────────────────────────────────────────
  // Nav
  "ll.nav.howItWorks": "How It Works",
  "ll.nav.gallery": "Gallery",
  "ll.nav.pricing": "Pricing",
  "ll.nav.faq": "FAQ",
  "ll.nav.signIn": "Sign in",
  "ll.nav.cta": "Launch your BrandMe →",

  // Promo banner
  "ll.promo.text": "Built in 4 minutes. Backed by a 30-day money-back guarantee.",
  "ll.promo.link": "See pricing →",
  "ll.promo.dismiss": "Dismiss notice",

  // Hero
  "ll.hero.eyebrow": "AI marketing for franchise consultants",
  "ll.hero.title1": "Your brands.",
  "ll.hero.title2": "Your markets.",
  "ll.hero.title3": "Working for you.",
  "ll.hero.badge": "Brand-locked · Consultant-operated · FDD-verified",
  "ll.hero.lead":
    "BrandMe builds a full AI-powered page for every franchise brand in your portfolio — with 100 SEO pages, a brand-smart AMA, and lead agents that never sleep. Add your brands. We handle everything else.",
  "ll.hero.check1": "30-day money-back guarantee",
  "ll.hero.check2": "No long-term contract",
  "ll.hero.check3": "Live in 4 minutes",
  "ll.hero.terminalTitle": "FRANCAST.AI · INTAKE",
  "ll.hero.viewPage": "View page →",
  "ll.hero.sample": "Sample build · Cycles through real BrandMe pages every 12 seconds",

  // Stats band
  "ll.stats.eyebrow": "Built for the franchise consultant who runs more than one brand",
  "ll.stats.seoPages": "SEO pages per brand",
  "ll.stats.leadResponse": "First lead response",
  "ll.stats.brands": "Brands in registry",
  "ll.stats.coverage": "Agent coverage",

  // Gallery
  "ll.gallery.eyebrow": "The BrandMe gallery",
  "ll.gallery.title": "Real consultants. Real franchises. Real results.",
  "ll.gallery.intro":
    "Every BrandMe page is operated by an independent consultant and locked to that brand's standards. Browse by category — every card is a live page.",
  "ll.gallery.browseAll": "Browse all {n} {category} brands →",
  "ll.gallery.addBrand": "Add a brand",
  "ll.gallery.addBrandSub": "{n} more service brands available",
  "ll.gallery.ownBrand": "Or your own brand",
  "ll.gallery.ownBrandSub": "Custom brands welcome",
  // Categories
  "ll.gallery.cat.restaurants": "Restaurants & QSR",
  "ll.gallery.cat.fitness": "Fitness & Wellness",
  "ll.gallery.cat.services": "Personal & Business Services",
  "ll.gallery.cat.other": "Other brands",
  // Real gallery states
  "ll.gallery.loading": "Loading pages…",
  "ll.gallery.empty": "No pages generated yet. Create the first one above.",
  "ll.gallery.emptyCta": "Get started →",
  "ll.gallery.viewPage": "View page →",
  "ll.gallery.count": "{n} live pages",

  // Comparison
  "ll.compare.old.eyebrow": "Today · The old way",
  "ll.compare.old.title": "One generic site. Every brand on the same page.",
  "ll.compare.old.1": "Static brochure site, built once, never updated",
  "ll.compare.old.2": "Every brand fights for the same hero space",
  "ll.compare.old.3": "Prospects email you for the FDD, then wait days",
  "ll.compare.old.4": "No SEO at the city level — invisible in local search",
  "ll.compare.old.5": "Leads die in the inbox while you're with another client",
  "ll.compare.old.6": "Can't ramp up: each new brand = another month of dev",
  "ll.compare.new.eyebrow": "With BrandMe by Francast",
  "ll.compare.new.title": "Every brand its own page. Every page its own AI.",
  "ll.compare.new.1": "One BrandMe page per brand, generated in 4 minutes",
  "ll.compare.new.2": "100 SEO city pages per brand, indexed for local search",
  "ll.compare.new.3": "AMA agent answers FDD questions 24/7 — under 5 min",
  "ll.compare.new.4": "Lead capture, qualification, and nurture automated",
  "ll.compare.new.5": "Brand-locked: no consultant can break brand standards",
  "ll.compare.new.6": "Add a new brand to your portfolio in one afternoon",

  // Agents
  "ll.agents.eyebrow": "Your AI team",
  "ll.agents.title1": "Seven AI agents.",
  "ll.agents.title2": "Working every brand, every day.",
  "ll.agents.intro":
    "Not features. Not settings to configure. A team that shows up every morning, runs your brands, and surfaces results — without a single email from you.",
  "ll.agents.1.title": "AI Brand Strategist",
  "ll.agents.1.desc":
    "Learns your portfolio, your markets, and your ideal client in a 5-minute setup. Builds the foundation every other agent runs on.",
  "ll.agents.2.title": "AI Market Researcher",
  "ll.agents.2.desc":
    "Maps open territories, competition, and local demand for each brand. (TODO client: confirm agent 02 copy.)",
  "ll.agents.3.title": "AI Page Builder",
  "ll.agents.3.desc":
    "Generates your full BrandMe page — hero, FAQs, compliance-safe disclosures — from the brand's official materials. Live in under an hour.",
  "ll.agents.4.title": "AI SEO Engine",
  "ll.agents.4.desc":
    "Builds 100 geo-targeted SEO pages per brand. \"Open a Great Clips franchise in Dallas.\" Indexed, structured, and ranking while you sleep.",
  "ll.agents.5.title": "AI AMA Agent",
  "ll.agents.5.desc":
    "Answers FDD questions 24/7, citing the official document. You stop being the bottleneck.",
  "ll.agents.6.title": "AI Lead Agent",
  "ll.agents.6.desc":
    "Captures, qualifies, and nurtures leads automatically, day and night. (TODO client: confirm agent 06 copy.)",
  "ll.agents.7.title": "AI Results Analyst",
  "ll.agents.7.desc":
    "Surfaces which brands, cities, and campaigns are working — without you asking. (TODO client: confirm agent 07 copy.)",
  // How it works (3 steps in agents)
  "ll.agents.step1": "Tell us about your brands in a 5-minute setup — even from your phone.",
  "ll.agents.step2": "We generate your page, surface SEO, and train the AMA. You watch it happen in real time.",
  "ll.agents.step3": "You drive the high-value conversations — the rest runs in the background.",

  // Pricing (TODO client: real prices)
  "ll.pricing.eyebrow": "Pricing",
  "ll.pricing.title": "One price per brand. No surprises.",
  "ll.pricing.intro": "Start with one brand. Add more whenever you want. Cancel anytime.",
  "ll.pricing.popular": "Most popular",
  "ll.pricing.perMonth": "/mo",
  "ll.pricing.starter.name": "Starter",
  "ll.pricing.starter.price": "$—",
  "ll.pricing.starter.desc": "One brand, fully operated.",
  "ll.pricing.starter.cta": "Get started",
  "ll.pricing.growth.name": "Growth",
  "ll.pricing.growth.price": "$—",
  "ll.pricing.growth.desc": "For consultants with several brands.",
  "ll.pricing.growth.cta": "Launch BrandMe",
  "ll.pricing.portfolio.name": "Portfolio",
  "ll.pricing.portfolio.price": "$—",
  "ll.pricing.portfolio.desc": "Full portfolio, everything included.",
  "ll.pricing.portfolio.cta": "Talk to sales",
  "ll.pricing.feat.seo": "100 SEO pages per brand",
  "ll.pricing.feat.ama": "AMA agent 24/7",
  "ll.pricing.feat.agents": "All 7 AI agents",
  "ll.pricing.feat.leads": "Automated lead capture",
  "ll.pricing.feat.support": "Priority support",

  // FAQ (TODO client: validate)
  "ll.faq.eyebrow": "FAQ",
  "ll.faq.title": "What consultants ask.",
  "ll.faq.q1": "How long does a page take to build?",
  "ll.faq.a1":
    "Your first BrandMe page is live in about 4 minutes after setup. The 100 SEO pages index over the following hours.",
  "ll.faq.q2": "Do I need the brand's FDD?",
  "ll.faq.a2":
    "The AMA agent cites the official Franchise Disclosure Document and public materials. We use it to ground the answers.",
  "ll.faq.q3": "Can I add more brands later?",
  "ll.faq.a3": "Yes. Add a new brand to your portfolio in one afternoon, whenever you want.",
  "ll.faq.q4": "Is there a long-term contract?",
  "ll.faq.a4": "No. No long-term contract, and you can cancel anytime.",
  "ll.faq.q5": "What does the 30-day guarantee cover?",
  "ll.faq.a5":
    "If you're not satisfied in the first 30 days, we refund you in full. No questions asked.",

  // Footer
  "ll.footer.tagline": "AI marketing for franchise consultants.",
  "ll.footer.product": "Product",
  "ll.footer.legal": "Legal",
  "ll.footer.contact": "Contact",
  "ll.footer.privacy": "Privacy",
  "ll.footer.terms": "Terms",
  "ll.footer.rights": "© 2026 Francast.ai. All rights reserved.",
};
