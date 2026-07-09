import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { applySubscriptionEvent } from "@/lib/db/subscriptions";
import type { WebhookAdapter } from "./handler";

/**
 * Adapter Stripe del WebhookHandlerPrimitive (WO-6). Aporta SOLO la estrategia
 * de firma (constructEvent, crypto local) y el routing de eventos; firma+dedup+
 * transacción los pone el primitivo. Las llamadas de red a Stripe (retrieve)
 * van en prepare() — FUERA de la transacción de dedup.
 *
 * Cambio deliberado vs la ruta anterior: un fallo de negocio ahora responde 500
 * (rollback sin consumir dedup → Stripe reintenta y el retry procesa). Antes se
 * respondía 200 y el evento se perdía hasta el siguiente update.
 */

type ApplyInput = Parameters<typeof applySubscriptionEvent>[0];

export interface StripePrepared {
  apply: ApplyInput | null; // null = tipo de evento que no nos interesa
}

/** current_period_end de la subscription → Date. Tolera distintas formas del SDK. */
function periodEnd(sub: Stripe.Subscription): Date | null {
  const raw =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000) : null;
}

export const stripeWebhookAdapter: WebhookAdapter<Stripe.Event, StripePrepared> = {
  vendor: "stripe",

  async verifyAndParse(rawBody, headers) {
    const sig = headers.get("stripe-signature");
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig || !secret) return null;
    try {
      const event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
      return { eventId: event.id, event };
    } catch {
      return null;
    }
  },

  async prepare(event): Promise<StripePrepared> {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof s.customer === "string" ? s.customer : s.customer?.id;
        const subscriptionId =
          typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null);
        if (!customerId || !subscriptionId) return { apply: null };
        // Red: recuperar la subscription para status + period_end fiables.
        const sub = await getStripe().subscriptions.retrieve(subscriptionId);
        return {
          apply: {
            customerId,
            subscriptionId,
            status: sub.status,
            currentPeriodEnd: periodEnd(sub),
            email: s.customer_details?.email ?? null,
          },
        };
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        if (!customerId) return { apply: null };
        return {
          apply: {
            customerId,
            subscriptionId: sub.id,
            status: sub.status,
            currentPeriodEnd: periodEnd(sub),
          },
        };
      }
      default:
        return { apply: null };
    }
  },

  async process(prepared) {
    if (!prepared.apply) return;
    // Contexto system ya abierto por el primitivo: la función usa db() ambiental.
    const result = await applySubscriptionEvent(prepared.apply);
    if (result === "customer_not_found") {
      // Lanzar → rollback del dedup → 500 → Stripe reintenta. Cubre la carrera
      // checkout→webhook; un customer permanentemente desconocido generará
      // reintentos de Stripe ~3 días (deuda conocida: sin dead-letter aún).
      throw new Error(
        `subscriptions sin fila para el customer ${prepared.apply.customerId}: se pide retry`,
      );
    }
    if (result === "stale_event") {
      // Evento fuera de orden: descarte idempotente POR DISEÑO (no es fallo).
      console.warn(
        `[webhooks:stripe] evento stale descartado (customer ${prepared.apply.customerId})`,
      );
    }
  },
};
