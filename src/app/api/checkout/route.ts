import { NextResponse } from "next/server";
import { z } from "zod";
import { readSessionId } from "@/lib/session";
import { isDbConfigured } from "@/lib/db/client";
import { getStripe, isStripeConfigured, siteUrl } from "@/lib/stripe/client";
import { getSubscriptionForTenant, upsertCustomer } from "@/lib/db/subscriptions";
import { withTenant } from "@/lib/db/tenant-context";
import { tenantRoute } from "@/lib/api/tenant-route";
import { rateLimit, clientKey, tooMany, LIMITS } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // slug de la web que el usuario quiere publicar al volver del pago (opcional).
  slug: z.string().max(80).optional(),
  // email del usuario logueado (Firebase) para prellenar el checkout y no pedirlo de nuevo.
  email: z.string().email().max(160).optional(),
});

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

/**
 * Crea (o reusa) el Customer de Stripe ligado al tenant y abre una Checkout
 * Session de suscripción mensual. Los accesos a DB van en bloques withTenant
 * CORTOS: la llamada a Stripe (red externa) queda fuera de cualquier contexto.
 */
const postHandler = tenantRoute(async (request, _ctx, { consultantId }) => {
  const base = siteUrl();
  if (process.env.NODE_ENV === "production" && base.includes("localhost")) {
    console.error("[checkout] NEXT_PUBLIC_SITE_URL apunta a localhost en producción");
    return fail("BAD_CONFIG", "Configuración de sitio inválida", 500);
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* body opcional */
  }
  const parsed = bodySchema.safeParse(body ?? {});
  const slug = parsed.success ? parsed.data.slug : undefined;
  const email = parsed.success ? parsed.data.email : undefined;

  try {
    const sessionId = (await readSessionId())!; // tenantRoute garantiza cookie
    const stripe = getStripe();

    // Reusar Customer si el tenant ya tiene uno; si no, crearlo y guardarlo.
    let customerId = (
      await withTenant(consultantId, () => getSubscriptionForTenant())
    )?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        ...(email ? { email } : {}),
        metadata: { session_id: sessionId, consultant_id: consultantId },
      });
      customerId = customer.id;
      await withTenant(consultantId, () => upsertCustomer({ sessionId, customerId: customer.id }));
    }

    const successUrl = `${base}/?checkout=success${slug ? `&slug=${encodeURIComponent(slug)}` : ""}`;
    const cancelUrl = `${base}/?checkout=cancel`;

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: sessionId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      subscription_data: { metadata: { session_id: sessionId } },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    });

    if (!checkout.url) return fail("NO_URL", "No se pudo iniciar el pago", 502);
    return NextResponse.json({ success: true, data: { url: checkout.url } });
  } catch (err) {
    console.error("[checkout] fallo creando sesión", err);
    return fail("CHECKOUT_FAILED", "No se pudo iniciar el pago", 500);
  }
});

export async function POST(request: Request, ctx: unknown) {
  const rl = rateLimit(`checkout:${clientKey(request)}`, LIMITS.checkout);
  if (!rl.ok) return tooMany(rl.retryAfter);

  if (!isDbConfigured()) return fail("NO_DB", "No disponible", 503);
  if (!isStripeConfigured()) return fail("NO_STRIPE", "Pagos no configurados", 503);
  return postHandler(request, ctx);
}
