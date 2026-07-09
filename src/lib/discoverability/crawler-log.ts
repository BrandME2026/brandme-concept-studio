import { getConfigValue } from "@/lib/config/config-store";
import { db, withSystemContext } from "@/lib/db/tenant-context";
import { isDbConfigured } from "@/lib/db/client";
import { captureError } from "@/lib/observability/observability";

/**
 * CrawlerAccessLogger (WO-41, REQ-SKL-001): registra cada GET a los endpoints
 * de discoverability (llms.txt, /.well-known/skills/*) con user-agent crudo +
 * clasificado contra los patrones EP-07 (`discoverability.known_crawlers`) y
 * referrer. Fire-and-forget: la respuesta JAMÁS espera al log; los errores van
 * a observability. El dashboard que agrega esto es Build 6 (Admin Console).
 */

async function classify(userAgent: string | null): Promise<string | null> {
  if (!userAgent) return null;
  const patterns = await getConfigValue<Record<string, string>>(
    "discoverability",
    "known_crawlers",
    {},
  );
  const ua = userAgent.toLowerCase();
  for (const [name, needle] of Object.entries(patterns)) {
    if (typeof needle === "string" && needle && ua.includes(needle)) return name;
  }
  return null;
}

/** Registra el acceso sin bloquear la respuesta. */
export function logCrawlerAccess(req: Request, path: string): void {
  if (!isDbConfigured()) return;
  const userAgent = req.headers.get("user-agent");
  const referrer = req.headers.get("referer");
  void (async () => {
    const crawlerName = await classify(userAgent);
    await withSystemContext("crawler-access-log", async () => {
      await db().query(
        `INSERT INTO crawler_access_logs (path, user_agent, crawler_name, referrer)
         VALUES ($1, $2, $3, $4)`,
        [path, userAgent, crawlerName, referrer],
      );
    });
  })().catch((err) => captureError(err, "[discoverability] log de crawler falló"));
}
