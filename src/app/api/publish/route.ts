import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionId } from "@/lib/session";
import { isDbConfigured } from "@/lib/db/client";
import { isStripeConfigured } from "@/lib/stripe/client";
import { isSubscriptionActive } from "@/lib/db/subscriptions";
import { publishGeneration } from "@/lib/db/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ slug: z.string().min(1).max(80) });

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

/**
 * Marca una web como publicada (visible en /p/[slug]). Exige suscripción activa
 * server-side cuando Stripe está configurado (blindaje: no se publica sin pagar
 * saltándose el UI). Sin Stripe → publicar es gratis (comportamiento legacy).
 * Filtra por session_id: nunca publica una web ajena.
 */
export async function POST(request: Request) {
  if (!isDbConfigured()) return fail("NO_DB", "No disponible", 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("BAD_JSON", "Cuerpo inválido", 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail("INVALID", "slug requerido", 400);

  try {
    const sessionId = await getSessionId();

    if (isStripeConfigured() && !(await isSubscriptionActive(sessionId))) {
      return fail("PAYMENT_REQUIRED", "Necesitas una suscripción activa para publicar", 402);
    }

    const ok = await publishGeneration(parsed.data.slug, sessionId);
    if (!ok) return fail("NOT_FOUND", "Página no encontrada o no es tuya", 404);
    return NextResponse.json({ success: true, data: { published: true } });
  } catch (err) {
    console.error("[publish] fallo publicando", err);
    return fail("PUBLISH_FAILED", "No se pudo publicar", 500);
  }
}
