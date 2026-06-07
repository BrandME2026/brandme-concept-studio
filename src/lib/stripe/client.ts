import Stripe from "stripe";

/**
 * Cliente de Stripe (servidor). Singleton como getPool(). Lee STRIPE_SECRET_KEY.
 * Si no está configurado, la app degrada: el gate de pago se desactiva y publicar
 * es gratis (comportamiento legacy) — ver isStripeConfigured().
 */
let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY no configurada");
    stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
  }
  return stripe;
}

/** true si Stripe está configurado (secret + price). Sin esto, no hay gate de pago. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

/** URL base del sitio para success/cancel de Checkout. */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
