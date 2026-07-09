import { NextResponse } from "next/server";
import { readSessionId } from "@/lib/session";
import { isDbConfigured } from "@/lib/db/client";
import { upsertUserAndLinkSession } from "@/lib/db/users";
import { withSystemContext } from "@/lib/db/tenant-context";
import { verifyFirebaseToken } from "@/lib/auth/verify-token";
import { getAccountState, signalAccountState } from "@/lib/auth/account-state-machine";
import { checkRateLimit, clientKey, tooMany } from "@/lib/security/rate-limit";
import { captureError } from "@/lib/observability/observability";

export const runtime = "nodejs";

/**
 * Vincula la sesión anónima actual (cookie bmc_session) con el usuario Firebase.
 * Recibe el ID token en `Authorization: Bearer <token>`, lo verifica contra las
 * claves públicas de Google, y hace upsert del usuario + vínculo sesión↔usuario
 * (+ merge del consultant provisional al canónico). Corre bajo
 * withSystemContext("auth-link-merge"): toca tablas de identidad y reasigna
 * filas entre consultants, cosa que ningún contexto tenant puede hacer.
 * Login OPCIONAL: si no hay DB o token válido, responde sin romper.
 */
export async function POST(req: Request) {
  const rl = await checkRateLimit("chat", `auth:${clientKey(req)}`);
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

  const sessionId = await readSessionId();
  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: { code: "NO_SESSION", message: "No autorizado" } },
      { status: 401 },
    );
  }

  try {
    await withSystemContext("auth-link-merge", async () => {
      const consultantId = await upsertUserAndLinkSession(
        {
          id: verified.uid,
          email: verified.email,
          displayName: verified.name,
          photoUrl: verified.picture,
        },
        sessionId,
      );
      // Señal password_set del AccountStateMachine (WO-5): un login VERIFICADO
      // sobre un consultant 'pending' confirma la credencial (Stage 2 de Build 2
      // golpea este mismo path). Para cuentas ya activas es no-op.
      if ((await getAccountState(consultantId)) === "pending") {
        await signalAccountState(consultantId, "password_set");
      }
    });
    return NextResponse.json({ success: true, data: { linked: true } });
  } catch (e) {
    captureError(e, "[auth/link] no se pudo vincular la sesión");
    return NextResponse.json(
      { success: false, error: { code: "LINK_FAILED", message: "No se pudo vincular" } },
      { status: 500 },
    );
  }
}
