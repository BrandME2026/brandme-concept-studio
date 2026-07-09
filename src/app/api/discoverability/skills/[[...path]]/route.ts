import { NextResponse } from "next/server";
import { getPlatformPhase } from "@/lib/discoverability/platform-phase";
import { logCrawlerAccess } from "@/lib/discoverability/crawler-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SkillFileServer (WO-41): sirve /.well-known/skills/* (rewrite en
 * next.config — Next ignora dot-folders en el router). GATING POR FASE: en
 * closed_development el index lista 0 skills y los .md responden 404 — los 5
 * SKILL.md documentan features de Builds 2–5 y su contenido tiene gate de
 * review humano (Shawn/Luis) antes de Build 9. El flip de
 * discoverability.platform_phase los activará sin deploy cuando toque.
 */

const SKILL_NAMES = [
  "ama",
  "brand-extraction",
  "lead-qualification",
  "brandmepage-setup",
  "seo-bundle",
] as const;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await params;
  const file = path.join("/") || "index.json";
  logCrawlerAccess(req, `/.well-known/skills/${file}`); // REQ-SKL-001

  const phase = await getPlatformPhase();
  const published = phase !== "closed_development";

  if (file === "index.json") {
    return NextResponse.json({
      platform: "BrandMe",
      platform_phase: phase,
      skills: published
        ? SKILL_NAMES.map((name) => ({
            name,
            url: `/.well-known/skills/${name}.md`,
          }))
        : [],
      note: published
        ? undefined
        : "Skills disponibles a partir de la fase friendly_beta (contenido con gate de review pre-Build 9).",
    });
  }

  const name = file.replace(/\.md$/, "");
  if (!(SKILL_NAMES as readonly string[]).includes(name)) {
    return NextResponse.json({ error: "skill desconocido" }, { status: 404 });
  }
  if (!published) {
    return NextResponse.json(
      { error: "skill no publicado en la fase actual", platform_phase: phase },
      { status: 404 },
    );
  }
  // El contenido autorizado de los 5 SKILL.md vive en el requirement 178de0f8 y
  // se embebe aquí tras el gate de review (pre-Build 9). Hasta entonces esta
  // rama es inalcanzable en producción (la fase la controla el admin).
  return new Response(`# ${name}\n\n(Contenido pendiente del gate de review pre-Build 9.)\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
