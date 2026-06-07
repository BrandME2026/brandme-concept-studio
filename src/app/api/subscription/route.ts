import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/session";
import { isDbConfigured } from "@/lib/db/client";
import { isStripeConfigured } from "@/lib/stripe/client";
import { getSubscriptionBySession, isSubscriptionActive } from "@/lib/db/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado de suscripción de la sesión actual. Si Stripe/DB no están configurados,
 * devuelve active:false (la app degrada a "publicar gratis"; el gate no se aplica).
 */
export async function GET() {
  if (!isDbConfigured() || !isStripeConfigured()) {
    return NextResponse.json({ success: true, data: { active: false, configured: false } });
  }
  try {
    const sessionId = await getSessionId();
    const active = await isSubscriptionActive(sessionId);
    const sub = await getSubscriptionBySession(sessionId);
    return NextResponse.json({
      success: true,
      data: {
        active,
        configured: true,
        status: sub?.status ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      },
    });
  } catch (err) {
    console.error("[subscription] fallo consultando estado", err);
    return NextResponse.json({ success: true, data: { active: false, configured: true } });
  }
}
