<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-6

**Work Order:** WO-6 — Build 1 — Webhook Handler Primitive (HMAC + idempotency)
**Created At (UTC):** 2026-07-09T12:52:00Z

## Summary

Primitivo reutilizable de webhooks entrantes (blueprint 0028b99f / EP-02): validación de firma del vendor (400 sin negocio en firma mala), dedup insert-before-process contra `webhook_events` (unique `(vendor,event_id)` — replays concurrentes colisionan en el índice), lógica de negocio en transacción idempotente (rollback NO consume el registro de dedup) y purga TTL oportunista. El webhook de Stripe existente MIGRA al primitivo.

## Code Reuse And Package Structure

**Reuso:** `withSystemContext`/`db()` (la transacción idempotente ES el contexto system pooled de WO-3; anidamiento reusa la transacción) · ConfigStore para el TTL de retención (EP-07: `webhooks.event_retention_days`) · verificación de firma Stripe existente (`constructEvent`, crypto local) · `applySubscriptionEvent` idempotente existente.

**Nuevos:** `src/lib/webhooks/handler.ts` (primitivo + tipo `WebhookAdapter`) · `src/lib/webhooks/stripe-adapter.ts` · `drizzle/0006_webhook_events.sql` · `tests/db/webhooks.test.ts` · `e2e-validator/tests/platform/webhook.spec.ts`.

**Modificados:** `src/app/api/stripe/webhook/route.ts` (delega en el primitivo) · `src/lib/db/schema.ts` (webhookEvents) · `e2e-validator/playwright.config.ts` (STRIPE_* dummy para el e2e).

## Components And Flow

```ts
interface WebhookAdapter<E, P = E> {
  vendor: string;
  /** Firma + parseo (crypto LOCAL, sin red). null = firma inválida → 400. */
  verifyAndParse(rawBody: string, headers: Headers): Promise<{ eventId: string; event: E } | null>;
  /** Llamadas de RED del vendor (p.ej. stripe.subscriptions.retrieve) — FUERA de la transacción. */
  prepare?(event: E): Promise<P>;
  /** Negocio idempotente SOLO-DB; corre tras el insert de dedup, en la MISMA transacción system. */
  process(prepared: P): Promise<void>;
}
handleWebhook<E, P>(req: Request, adapter: WebhookAdapter<E, P>): Promise<Response>
```

Flujo: rawBody → verifyAndParse (null → 400) → prepare fuera de contexto (regla WO-3: red nunca dentro de withTenant/withSystemContext) → purga TTL oportunista (contexto propio, fail-soft con log) → `withSystemContext("webhook-<vendor>")`: INSERT dedup `ON CONFLICT DO NOTHING` (rowCount 0 → replay → 200 sin ejecutar) → `adapter.process()` con contexto ambiental → commit. process lanza → rollback (dedup NO consumido) → 500 (el vendor reintenta; cambio deliberado vs el 200-siempre anterior de Stripe: con dedup + applySubscriptionEvent idempotente el retry es seguro y no se pierden eventos).

**webhook_events (0006):** modelo del blueprint; `expires_at = now() + retention` (config `webhooks.event_retention_days`, default 30, seed). Plataforma SIN RLS. GRANT SELECT, INSERT, DELETE a brandme_app.

**Stripe adapter:** verifyAndParse = constructEvent try/catch; prepare = retrieve solo para checkout.session.completed; process = switch existente llamando applySubscriptionEvent con db() ambiental.

## Steps

1. RED: tests/db/webhooks.test.ts con adapter fake (firma mala→400 sin proceso ni fila; válido→200+proceso+fila con TTL; replay→200 sin re-ejecución; process lanza→500+rollback y el retry procesa; 2 concurrentes mismo event→1 sola ejecución; purga de expirados).
2. GREEN: 0006 + handler.ts + schema.ts.
3. Migrar Stripe: stripe-adapter.ts + route delegando. tsc/unit/db/build.
4. E2E webhook.spec.ts (@COV_PF_WEBHOOK_001.1/.2) contra la ruta REAL con firma Stripe artesanal (HMAC t.payload con secret dummy en el webServer) + seed de subscription.
5. Review → commit → in_review.

## Testing

`pnpm test:db` · `pnpm test` · `pnpm test:e2e` (9 specs) · `pnpm tsc --noEmit` · `pnpm build`.
