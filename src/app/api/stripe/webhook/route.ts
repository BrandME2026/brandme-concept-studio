import { NextResponse } from "next/server";
import { isStripeConfigured } from "@/lib/stripe/client";
import { isDbConfigured } from "@/lib/db/client";
import { handleWebhook } from "@/lib/webhooks/handler";
import { stripeWebhookAdapter } from "@/lib/webhooks/stripe-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de Stripe sobre el WebhookHandlerPrimitive (WO-6): firma verificada
 * con el BODY CRUDO, dedup por event.id en webhook_events (replays → 200 sin
 * re-ejecutar), negocio en transacción idempotente (fallo → 500 y Stripe
 * reintenta; el dedup no se consume en rollback).
 */
export async function POST(req: Request) {
  if (!isStripeConfigured() || !isDbConfigured()) {
    // Sin Stripe/DB no hay nada que sincronizar; 200 evita reintentos infinitos.
    return NextResponse.json({ received: true });
  }
  return handleWebhook(req, stripeWebhookAdapter);
}
