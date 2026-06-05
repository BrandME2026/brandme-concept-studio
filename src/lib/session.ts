import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

const COOKIE = "bmc_session";
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Devuelve el id de sesión anónima (cookie). Si no existe, crea uno nuevo.
 * Identifica el historial por navegador sin necesidad de login.
 */
export async function getSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR,
    path: "/",
  });
  return id;
}
