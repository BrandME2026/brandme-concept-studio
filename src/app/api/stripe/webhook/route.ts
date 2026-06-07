import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { isDbConfigured } from "@/lib/db/client";
import { applySubscriptionEvent } from "@/lib/db/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de Stripe. Verifica la firma con el BODY CRUDO (req.text(), nunca req.json()),
 * y sincroniza la tabla subscriptions. Idempotente: applySubscriptionEvent descarta
 * eventos fuera de orden. Responde 200 a cualquier evento con firma válida para que
 * Stripe no reintente; 400 solo si la firma es inválida.
 */
export async function POST(req: Request) {
  if (!isStripeConfigured() || !isDbConfigured()) {
    // Sin Stripe/DB no hay nada que sincronizar; 200 evita reintentos infinitos.
    return NextResponse.json({ received: true });
  }

  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Falta firma o secret" }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error("[stripe/webhook] firma inválida", err);
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof s.customer === "string" ? s.customer : s.customer?.id;
        const subscriptionId =
          typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null;
        if (customerId && subscriptionId) {
          // Recuperar la subscription para status + period_end fiables.
          const sub = await getStripe().subscriptions.retrieve(subscriptionId);
          await applySubscriptionEvent({
            customerId,
            subscriptionId,
            status: sub.status,
            currentPeriodEnd: periodEnd(sub),
            email: s.customer_details?.email ?? null,
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        if (customerId) {
          await applySubscriptionEvent({
            customerId,
            subscriptionId: sub.id,
            status: sub.status,
            currentPeriodEnd: periodEnd(sub),
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Loggeamos pero respondemos 200: el estado se reconcilia en el próximo evento
    // (subscription.updated) y evitamos tormentas de reintentos por un fallo transitorio.
    console.error(`[stripe/webhook] error procesando ${event.type}`, err);
  }

  return NextResponse.json({ received: true });
}

/** current_period_end de la subscription → Date. Tolera distintas formas del SDK. */
function periodEnd(sub: Stripe.Subscription): Date | null {
  const raw =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000) : null;
}
