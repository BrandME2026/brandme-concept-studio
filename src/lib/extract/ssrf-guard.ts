import { promises as dns } from "node:dns";
import ipaddr from "ipaddr.js";

/**
 * Defensa SSRF: la app navega a URLs arbitrarias del usuario con Playwright.
 * Bloqueamos hosts que apunten a la red interna del servidor (loopback, link-local,
 * privadas, ULA, metadata cloud) para que un atacante no lea servicios internos.
 *
 * Dos capas:
 *  1. isBlockedHost: chequeo de string rápido (literal IP o "localhost") — barato, síncrono.
 *  2. assertSafeUrl: resuelve el hostname por DNS y rechaza si CUALQUIER IP resuelta es
 *     interna — cubre DNS-rebinding (dominio público que resuelve a 127.0.0.1/169.254.x).
 */

// Rangos que ipaddr.js clasifica como no enrutables públicamente.
const BLOCKED_RANGES = new Set([
  "unspecified", // 0.0.0.0, ::
  "loopback", // 127.0.0.0/8, ::1
  "linkLocal", // 169.254.0.0/16, fe80::/10
  "uniqueLocal", // fc00::/7
  "private", // 10/8, 172.16/12, 192.168/16
  "reserved",
  "broadcast",
  "carrierGradeNat", // 100.64.0.0/10
]);

/** ¿La IP (literal ya parseada) cae en un rango interno/no público? */
export function isBlockedAddress(addr: string): boolean {
  if (!ipaddr.isValid(addr)) return false;
  let ip = ipaddr.parse(addr);
  // IPv4 mapeada en IPv6 (::ffff:127.0.0.1) → evaluar como IPv4.
  if (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress()) {
    ip = (ip as ipaddr.IPv6).toIPv4Address();
  }
  return BLOCKED_RANGES.has(ip.range());
}

/**
 * Chequeo síncrono de string: bloquea "localhost" y literales IP internos.
 * No resuelve DNS — para eso está assertSafeUrl. Útil como filtro rápido.
 */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").trim();
  if (h === "" || h === "localhost" || h.endsWith(".localhost")) return true;
  return isBlockedAddress(h);
}

/**
 * Valida una URL completa: bloquea esquemas no http(s) y resuelve el hostname,
 * rechazando si cualquier IP resuelta es interna. Lanza Error si la URL no es segura.
 */
export async function assertSafeUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL inválida");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Esquema no permitido");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHost(host)) throw new Error("Host bloqueado");

  // Si es un literal IP, isBlockedHost ya decidió; no hay DNS que resolver.
  if (ipaddr.isValid(host)) return;

  // Resolver TODAS las IPs del dominio y rechazar si alguna es interna (DNS-rebinding).
  const records = await dns.lookup(host, { all: true, verbatim: true });
  for (const { address } of records) {
    if (isBlockedAddress(address)) {
      throw new Error("El dominio resuelve a una IP interna");
    }
  }
}
