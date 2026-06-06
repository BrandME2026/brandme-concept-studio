import { AgentChat } from "./agent-chat";

export const dynamic = "force-dynamic";

// Agente de captación embebido vía <iframe> de primera parte en las páginas públicas.
// Igual que el formulario: al ser nuestra app, puede llamar a /api/agent (el HTML del
// LLM bajo sandbox no podría).
export default async function AgentEmbed({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; brand?: string; city?: string; lang?: string }>;
}) {
  const { slug = "", brand = "", city = "", lang = "es" } = await searchParams;
  return (
    <AgentChat slug={slug} brand={brand} city={city} lang={lang === "en" ? "en" : "es"} />
  );
}
