import { getConfigValue } from "@/lib/config/config-store";

/**
 * CorsController (WO-32, REQ-SEC-003): control de acceso cross-origin de los
 * endpoints AUTENTICADOS (se aplica en tenantRoute). Allowlist EP-07
 * (security.cors_allowed_origins, editable sin deploy, <60s) que incluye
 * getbrandme.ai y subdominios vía la entrada "https://*.getbrandme.ai".
 * JAMÁS wildcard global (AC-SEC-003.2). Origen no permitido → sin headers CORS
 * y sin datos autenticados (403 server-side, más estricto que el bloqueo del
 * navegador).
 */

const DEFAULT_ALLOWLIST = ["https://getbrandme.ai", "https://*.getbrandme.ai"];

function originMatches(origin: string, entry: string): boolean {
  if (entry === "*") return false; // wildcard global prohibido por contrato
  if (!entry.includes("*")) return origin === entry;
  // Solo se soporta el comodín de subdominio: https://*.dominio.tld
  const m = /^(https?):\/\/\*\.(.+)$/.exec(entry);
  if (!m) return false;
  const [, scheme, domain] = m;
  const o = (() => {
    try {
      return new URL(origin);
    } catch {
      return null;
    }
  })();
  if (!o) return false;
  return o.protocol === `${scheme}:` && (o.hostname === domain || o.hostname.endsWith(`.${domain}`));
}

/** true si el request es same-origin (o sin Origin: navegación/cURL/server-to-server). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const r = new URL(req.url);
    return o.host === r.host && o.protocol === r.protocol;
  } catch {
    return false;
  }
}

/**
 * Headers CORS para un origin cross permitido, o null si NO está permitido.
 * Same-origin no necesita CORS (el caller no debe llamar esto en ese caso).
 */
export async function corsHeadersFor(origin: string): Promise<Record<string, string> | null> {
  const allowlist = await getConfigValue<string[]>(
    "security",
    "cors_allowed_origins",
    DEFAULT_ALLOWLIST,
  );
  const allowed = allowlist.some((entry) => originMatches(origin, entry));
  if (!allowed) return null;
  return {
    "Access-Control-Allow-Origin": origin, // nunca "*" (AC-SEC-003.2)
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}
