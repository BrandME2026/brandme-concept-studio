import { LeadForm } from "./lead-form";

export const dynamic = "force-dynamic";

// Widget de primera parte embebido vía <iframe> en las páginas públicas del LLM. Al ser
// nuestra app (no el HTML no confiable), SÍ puede hacer fetch a /api/leads — por eso el
// formulario va aquí y no como <form> crudo dentro del sandbox del documento generado.
export default async function LeadFormEmbed({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; brand?: string; lang?: string }>;
}) {
  const { slug = "", brand = "", lang = "es" } = await searchParams;
  return <LeadForm slug={slug} brand={brand} lang={lang === "en" ? "en" : "es"} />;
}
