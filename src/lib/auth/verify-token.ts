/**
 * Verificación del ID token de Firebase en el servidor SIN Admin SDK (evita añadir
 * service-account y peso a la imagen). Valida la firma RS256 contra los certificados
 * públicos de Google y comprueba iss/aud/exp. Suficiente para login OPCIONAL y vincular
 * datos no sensibles; si en el futuro se protegen rutas críticas, migrar a Admin SDK.
 *
 * Usa la API Web Crypto (disponible en el runtime nodejs de Next 16).
 */

// Endpoint JWKS de Google (claves en formato JWK → importan limpio con Web Crypto,
// a diferencia del endpoint x509 que entrega certificados que habría que parsear a mano).
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

interface Jwk {
  kid: string;
  n: string;
  e: string;
  kty: string;
  alg?: string;
}
interface CachedKeys {
  keys: Record<string, Jwk>;
  expiresAt: number;
}
let keyCache: CachedKeys | null = null;

async function fetchKeys(): Promise<Record<string, Jwk>> {
  const now = Date.now();
  if (keyCache && keyCache.expiresAt > now) return keyCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("no se pudieron obtener las claves de Google");
  const json = (await res.json()) as { keys: Jwk[] };
  const byKid: Record<string, Jwk> = {};
  for (const k of json.keys) byKid[k.kid] = k;
  // Respeta el max-age del header (las claves rotan cada pocas horas).
  const cc = res.headers.get("cache-control") ?? "";
  const maxAge = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 3600);
  keyCache = { keys: byKid, expiresAt: now + maxAge * 1000 };
  return byKid;
}

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Importa una clave pública RSA desde su JWK (n, e) para verificar RS256. */
async function importJwk(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

export interface VerifiedToken {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * Verifica un ID token de Firebase. Devuelve el payload si es válido, o null si no.
 * No lanza por tokens inválidos (devuelve null); solo por fallos de red de certs.
 */
export async function verifyFirebaseToken(token: string): Promise<VerifiedToken | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { kid?: string; alg?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) return null;

  // Claims obligatorios de Firebase.
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  if (typeof payload.sub !== "string" || !payload.sub) return null;

  // Verifica la firma contra la clave pública correspondiente al kid.
  let keys: Record<string, Jwk>;
  try {
    keys = await fetchKeys();
  } catch {
    return null;
  }
  const jwk = keys[header.kid];
  if (!jwk) return null;

  let key: CryptoKey;
  try {
    key = await importJwk(jwk);
  } catch {
    return null;
  }

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = b64urlToBytes(sigB64);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    sig as BufferSource,
    data as BufferSource,
  );
  if (!ok) return null;

  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}
