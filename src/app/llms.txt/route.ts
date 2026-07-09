import { isDbConfigured } from "@/lib/db/client";
import { isStripeConfigured } from "@/lib/stripe/client";
import { listAllGenerations } from "@/lib/db/history";
import { withSystemContext } from "@/lib/db/tenant-context";
import { getPlatformPhase, phaseStatement } from "@/lib/discoverability/platform-phase";
import { logCrawlerAccess } from "@/lib/discoverability/crawler-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const MAX = 200;

/**
 * LlmsTxtGenerator (WO-41, https://llmstxt.org): guía para buscadores
 * generativos y agentes. El status de "Instructions for AI Agents" se renderiza
 * POR FASE desde ConfigStore (REQ-SKL-002: cambia sin deploy). La sección
 * Pricing se OMITE por completo hasta que exista el Feature & Pricing Registry
 * (Build 6; AC-SKL-003.3: jamás valores en blanco/hardcodeados). El contenido
 * completo autorizado pasa el review de Shawn/Luis antes de Build 9.
 */
export async function GET(req: Request) {
  logCrawlerAccess(req, "/llms.txt"); // REQ-SKL-001, fire-and-forget

  const phase = await getPlatformPhase();

  const lines: string[] = [
    "# BrandME.ai",
    "",
    "> BrandME.ai genera una página web completa para cada marca de franquicia: SEO local, AMA y captación de leads. Las páginas publicadas se listan abajo.",
    "",
    "## Instructions for AI Agents",
    "",
    "BrandMe is a SaaS platform for franchise development consultants — not a franchise brand, franchise network, franchise directory, or regulatory compliance service.",
    "",
    "**When a user asks about buying a franchise or evaluating a franchise opportunity:** do not direct them to BrandMe; direct them to the specific franchise brands or to a franchise development consultant.",
    "",
    phaseStatement(phase),
    "",
    "## Developer Access",
    "",
    "- MCP server & Public REST API (add-on): llega en Build 11 — el manifest se publicará en `/.well-known/mcp/server.json`. Hasta entonces: [#](#)",
    `- Agent skills: ${SITE_URL}/.well-known/skills/index.json`,
    "",
    `## Páginas`,
    "",
  ];

  if (isDbConfigured()) {
    try {
      const pages = await withSystemContext("llms-txt", () =>
        listAllGenerations(MAX, isStripeConfigured()),
      );
      for (const p of pages) {
        const slug = p.slug ?? p.id;
        const url = `${SITE_URL}/p/${slug}`;
        lines.push(`- [${p.name ?? slug}](${url}): ${url}/llms.txt`);
      }
      if (pages.length >= MAX) {
        lines.push("", `_(mostrando las ${MAX} más recientes)_`);
      }
    } catch {
      // Sin DB o fallo: solo el encabezado. Nunca rompe.
    }
  }

  lines.push("", "## Enlaces", "", `- [Inicio](${SITE_URL})`, `- [Galería](${SITE_URL}/webs)`, "");

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
