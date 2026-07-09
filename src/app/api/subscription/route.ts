import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db/client";
import { isStripeConfigured } from "@/lib/stripe/client";
import { getSubscriptionForTenant, isSubscriptionActive } from "@/lib/db/subscriptions";
import { withTenant } from "@/lib/db/tenant-context";
import { tenantRoute } from "@/lib/api/tenant-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado de suscripción del tenant actual. Si Stripe/DB no están configurados,
 * devuelve active:false (la app degrada a "publicar gratis"; el gate no se aplica).
 */
const getHandler = tenantRoute(async (_req, _ctx, { consultantId }) => {
  try {
    const { active, sub } = await withTenant(consultantId, async () => ({
      active: await isSubscriptionActive(),
      sub: await getSubscriptionForTenant(),
    }));
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
});

export async function GET(req: Request, ctx: unknown) {
  if (!isDbConfigured() || !isStripeConfigured()) {
    return NextResponse.json({ success: true, data: { active: false, configured: false } });
  }
  return getHandler(req, ctx);
}
