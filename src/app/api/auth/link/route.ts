import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/session";
import { isDbConfigured } from "@/lib/db/client";
import { upsertUserAndLinkSession } from "@/lib/db/users";
import { verifyFirebaseToken } from "@/lib/auth/verify-token";
import { rateLimit, clientKey, tooMany, LIMITS } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

/**
 * Vincula la sesión anónima actual (cookie bmc_session) con el usuario Firebase.
 * Recibe el ID token en `Authorization: Bearer <token>`, lo verifica contra las claves
 * públicas de Google, y hace upsert del usuario + el vínculo sesión↔usuario.
 * Login OPCIONAL: si no hay DB o token válido, responde sin romper (no bloquea el login).
 */
export async function POST(req: Request) {
  const rl = rateLimit(`auth:${clientKey(req)}`, LIMITS.chat);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    return NextResponse.json(
      { success: false, error: { code: "NO_TOKEN", message: "Falta el token" } },
      { status: 401 },
    );
  }

  const verified = await verifyFirebaseToken(token);
  if (!verified) {
    return NextResponse.json(
      { success: false, error: { code: "BAD_TOKEN", message: "Token inválido" } },
      { status: 401 },
    );
  }

  // Sin DB la app funciona igual; el login simplemente no persiste el vínculo.
  if (!isDbConfigured()) {
    return NextResponse.json({ success: true, data: { linked: false } });
  }

  const sessionId = await getSessionId();
  try {
    await upsertUserAndLinkSession(
      {
        id: verified.uid,
        email: verified.email,
        displayName: verified.name,
        photoUrl: verified.picture,
      },
      sessionId,
    );
    return NextResponse.json({ success: true, data: { linked: true } });
  } catch (e) {
    console.error("[auth/link] no se pudo vincular la sesión", e);
    return NextResponse.json(
      { success: false, error: { code: "LINK_FAILED", message: "No se pudo vincular" } },
      { status: 500 },
    );
  }
}
