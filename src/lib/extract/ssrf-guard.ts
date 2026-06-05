/**
 * Defensa SSRF: la app navega a URLs arbitrarias del usuario con Playwright.
 * Bloqueamos hosts que apunten a la propia red del servidor (loopback, link-local,
 * rangos privados) para evitar que un atacante lea metadata de cloud o servicios internos.
 */

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false;

  if (a === 127) return true; // loopback
  if (a === 10) return true; // privado
  if (a === 0) return true; // "este" host
  if (a === 169 && b === 254) return true; // link-local (metadata cloud)
  if (a === 192 && b === 168) return true; // privado
  if (a === 172 && b >= 16 && b <= 31) return true; // privado
  return false;
}

/** ¿El host debe bloquearse por apuntar a la red interna? */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").trim();
  if (h === "localhost" || h === "" ) return true;
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd"))
    return true; // IPv6 loopback / link-local / unique-local
  return isPrivateIPv4(h);
}
