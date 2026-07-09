import type { RenderModel } from "@/lib/brandmepage/render-data";

/**
 * Vista SSR de la BrandMePage (WO-15, AC-BPG-001.2): pinta el RenderModel en
 * el orden canónico. El diseño sale de los identity tokens del Agente 02
 * (colores dinámicos por marca — no un design system fijo); sin tokens
 * (degradación) rige el template neutral. Responsive a 375px (grid fluida) y
 * scroll horizontal scoped en el portfolio nav móvil (AC-BPG-013.5).
 */

const NEUTRAL_PRIMARY = "#1f2937";

export function BrandMePageView({ model }: { model: RenderModel }) {
  const primary = model.identityTokens.primary_color_hex ?? NEUTRAL_PRIMARY;
  const palette = model.identityTokens.secondary_palette ?? [];
  const canvas = palette[0] ?? "#ffffff";
  const { copy, overlay, blocks } = model;

  return (
    <main className="min-h-screen" style={{ background: canvas, color: "#111827" }}>
      {/* 1) Hero con headshot */}
      <header
        className="px-6 py-16 text-center sm:py-24"
        style={{ background: primary, color: "#ffffff" }}
      >
        {overlay.headshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={overlay.headshotUrl}
            alt={overlay.name}
            className="mx-auto mb-6 h-24 w-24 rounded-full border-4 border-white/40 object-cover"
          />
        ) : null}
        <h1 className="mx-auto max-w-3xl text-3xl font-bold sm:text-5xl">{copy.hero_headline}</h1>
        <p className="mt-4 text-sm opacity-80">
          {/* Byline visible del autor (AC-BPG-010.5). */}
          Por {overlay.name} · Consultor de franquicias
        </p>
      </header>

      {/* 2) Brand overview */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="mb-4 text-2xl font-semibold" style={{ color: primary }}>
          Sobre {model.brandName}
        </h2>
        {copy.brand_overview.split(/\n{2,}/).map((paragraph, i) => (
          <p key={i} className="mb-4 leading-relaxed">
            {paragraph}
          </p>
        ))}
      </section>

      {/* Mid-page condicionales (AC-BPG-008): ROI solo con FDD real; Territory en pending. */}
      {blocks.roiCalculator ? (
        <section className="mx-auto max-w-3xl px-6 pb-12" data-block="roi-calculator">
          <h2 className="mb-3 text-xl font-semibold" style={{ color: primary }}>
            Inversión estimada
          </h2>
          <p className="text-sm text-gray-600">
            Cifras según divulgación de la marca (FDD). Modela tu inversión con tu consultor.
          </p>
        </section>
      ) : null}
      {blocks.territoryPending ? (
        <section className="mx-auto max-w-3xl px-6 pb-12" data-block="territory-pending">
          <h2 className="mb-3 text-xl font-semibold" style={{ color: primary }}>
            Disponibilidad de territorio
          </h2>
          <p className="text-sm text-gray-600">
            Estamos preparando los datos de territorio para tus mercados — muy pronto aquí.
          </p>
        </section>
      ) : null}

      {/* 3) Value proposition */}
      <section className="mx-auto max-w-3xl px-6 pb-12">
        <h2 className="mb-4 text-2xl font-semibold" style={{ color: primary }}>
          Por qué esta oportunidad
        </h2>
        <ul className="space-y-3">
          {copy.value_proposition.map((bullet, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden style={{ color: primary }}>
                ✓
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 4) FAQs de objeciones */}
      <section className="mx-auto max-w-3xl px-6 pb-12">
        <h2 className="mb-4 text-2xl font-semibold" style={{ color: primary }}>
          Preguntas frecuentes
        </h2>
        {copy.faqs.map((faq, i) => (
          <details key={i} className="mb-3 rounded-lg border border-gray-200 p-4">
            <summary className="cursor-pointer font-medium">{faq.question}</summary>
            <p className="mt-2 text-gray-700">{faq.answer}</p>
          </details>
        ))}
      </section>

      {/* 5) Perfil del consultor: bio → Loom → social → credenciales */}
      <section className="mx-auto max-w-3xl px-6 pb-12">
        <h2 className="mb-4 text-2xl font-semibold" style={{ color: primary }}>
          Tu consultor: {overlay.name}
        </h2>
        {overlay.bio ? <p className="mb-4 leading-relaxed">{overlay.bio}</p> : null}
        {blocks.loomVideo && overlay.loomUrl ? (
          <div className="mb-4 aspect-video" data-block="loom-video">
            <iframe
              src={overlay.loomUrl.replace("/share/", "/embed/")}
              title={`Video de ${overlay.name}`}
              className="h-full w-full rounded-lg"
              allowFullScreen
            />
          </div>
        ) : null}
        {Object.keys(overlay.socialLinks).length > 0 ? (
          <p className="mb-4 flex gap-4" data-block="social-links">
            {Object.entries(overlay.socialLinks).map(([network, href]) => (
              <a key={network} href={href} rel="noopener noreferrer" target="_blank" className="underline">
                {network}
              </a>
            ))}
          </p>
        ) : null}
        {blocks.credentials ? (
          <div className="rounded-lg border border-gray-200 p-4" data-block="credentials">
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
              Credenciales — autorreportadas por el consultor
            </p>
            <ul className="list-disc pl-5">
              {overlay.credentials.map((credential, i) => (
                <li key={i}>{credential}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* 6) Lead capture (iframe de primera parte, AC-BPG-001.4) */}
      <section className="mx-auto max-w-3xl px-6 pb-12" id="contacto">
        <h2 className="mb-4 text-2xl font-semibold" style={{ color: primary }}>
          Da el siguiente paso
        </h2>
        <iframe
          src={`/embed/lead-form?slug=${encodeURIComponent(model.leadSlug)}&brand=${encodeURIComponent(model.brandName)}&lang=es`}
          title="Formulario de contacto"
          className="h-[430px] w-full rounded-lg border border-gray-200"
        />
        <p className="mt-3 text-xs text-gray-500">
          Al enviar este formulario, consientes recibir comunicaciones de {overlay.name} sobre
          oportunidades de franquicia. Tu información se maneja conforme a nuestra Política de
          Privacidad.
        </p>
      </section>

      {/* 7) AMA widget (agent chat actual; el AMA grounded llega con WO-16) */}
      <section className="mx-auto max-w-3xl px-6 pb-16" data-block="ama-widget">
        <h2 className="mb-4 text-2xl font-semibold" style={{ color: primary }}>
          Pregunta lo que quieras
        </h2>
        <iframe
          src={`/embed/agent?slug=${encodeURIComponent(model.leadSlug)}&brand=${encodeURIComponent(model.brandName)}&lang=es`}
          title="Asistente de la marca"
          className="h-[480px] w-full rounded-lg border border-gray-200"
        />
      </section>

      {/* 8) Comparison card entry point (condicional) */}
      {blocks.comparisonCard ? (
        <section className="mx-auto max-w-3xl px-6 pb-12" data-block="comparison-card">
          <a href="#portfolio" className="underline" style={{ color: primary }}>
            Compara esta marca con otras que represento →
          </a>
        </section>
      ) : null}

      {/* 9) Testimonials: WO hijo — sin datos aún, se omite (blocks.testimonials=false) */}

      {/* 10) Portfolio brand navigation (al fondo) */}
      {blocks.portfolioNav ? (
        <section
          id="portfolio"
          className="mx-auto max-w-5xl px-6 pb-20"
          data-block="portfolio-nav"
        >
          <h2 className="mb-6 text-2xl font-semibold" style={{ color: primary }}>
            Más marcas que represento
          </h2>
          <div className="flex snap-x gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible">
            {model.portfolio.map((card) => (
              <a
                key={card.href}
                href={card.href}
                className="w-[160px] flex-none snap-start rounded-lg border border-gray-200 p-4 text-center md:w-auto"
              >
                {card.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.logoUrl} alt={card.brandName} className="mx-auto mb-2 h-12 object-contain" />
                ) : (
                  <span
                    className="mx-auto mb-2 block h-12 w-12 rounded-full"
                    style={{ background: card.primaryColor ?? NEUTRAL_PRIMARY }}
                  />
                )}
                <span className="text-sm font-medium">{card.brandName}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
