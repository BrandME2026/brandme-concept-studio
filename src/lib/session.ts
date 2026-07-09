import { cookies } from "next/headers";

export const SESSION_COOKIE = "bmc_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 1 año

/**
 * Lee el id de sesión anónima (cookie) SIN crearlo. El acuñado vive en
 * src/middleware.ts y ocurre solo en navegaciones de documento: una llamada a
 * API sin cookie NO gana sesión — las rutas tenant responden 401 (WO-3,
 * AC-PF-001.4) en vez de fabricar una identidad fantasma.
 */
export async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}
