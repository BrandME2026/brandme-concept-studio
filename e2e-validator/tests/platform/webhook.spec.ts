import { createHmac, randomUUID } from "node:crypto";
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import { MIGRATIONS_DB_URL } from "../../db-urls";

/**
 * COV_PF_WEBHOOK_001: Webhook Idempotency — @platform @webhook (P0)
 *
 * Contra la ruta REAL /api/stripe/webhook: la firma se fabrica con el mismo
 * HMAC-SHA256 que verifica constructEvent (secret dummy del webServer, crypto
 * local — la API de Stripe jamás se toca). Se usa customer.subscription.updated
 * porque su process() es solo-DB (sin retrieve).
 */

const WEBHOOK_SECRET = "whsec_e2e_dummy";

function stripeSignature(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

function subscriptionEvent(eventId: string, customerId: string, status: string): string {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_e2e_1",
        object: "subscription",
        customer: customerId,
        status,
        items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86_400 }] },
      },
    },
  });
}

async function withMigrator<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: MIGRATIONS_DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

let ctx: APIRequestContext;
let customerId: string;

async function subscriptionStatus(): Promise<string> {
  const { rows } = await withMigrator((c) =>
    c.query<{ status: string }>(`SELECT status FROM subscriptions WHERE stripe_customer_id = $1`, [
      customerId,
    ]),
  );
  return rows[0].status;
}

test.beforeAll(async ({}, testInfo) => {
  ctx = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL! });
  // Seed: consultant + suscripción en estado 'incomplete' que el webhook actualizará.
  customerId = `cus_e2e_wh_${randomUUID().slice(0, 8)}`;
  await withMigrator(async (c) => {
    const consultant = await c.query<{ id: string }>(
      `INSERT INTO consultants (firebase_uid) VALUES (NULL) RETURNING id`,
    );
    await c.query(
      `INSERT INTO subscriptions (session_id, consultant_id, stripe_customer_id, status)
       VALUES ($1, $2, $3, 'incomplete')`,
      [`sess-wh-${randomUUID().slice(0, 8)}`, consultant.rows[0].id, customerId],
    );
  });
});

test.afterAll(async () => {
  await ctx?.dispose();
});

test("@COV_PF_WEBHOOK_001.1 @platform @webhook — firma inválida: 400 y cero efectos", async () => {
  const payload = subscriptionEvent(`evt_e2e_bad_${randomUUID().slice(0, 6)}`, customerId, "active");
  const res = await ctx.post("/api/stripe/webhook", {
    headers: { "stripe-signature": "t=1,v1=firma-falsa", "content-type": "application/json" },
    data: payload,
  });
  expect(res.status()).toBe(400);
  expect(await subscriptionStatus(), "sin efectos: el status no cambió").toBe("incomplete");
});

test("@COV_PF_WEBHOOK_001.2 @platform @webhook — el replay se reconoce sin re-ejecutar", async () => {
  const eventId = `evt_e2e_${randomUUID().slice(0, 8)}`;

  // 1) Evento válido → procesa (status pasa a active).
  const payload = subscriptionEvent(eventId, customerId, "active");
  const first = await ctx.post("/api/stripe/webhook", {
    headers: {
      "stripe-signature": stripeSignature(payload, WEBHOOK_SECRET),
      "content-type": "application/json",
    },
    data: payload,
  });
  expect(first.status()).toBe(200);
  expect(await first.json()).toMatchObject({ received: true, replay: false });
  expect(await subscriptionStatus()).toBe("active");

  // 2) MISMO event id con contenido distinto (status canceled) → 200 reconocido,
  //    negocio NO re-ejecutado: el status sigue active.
  const replayPayload = subscriptionEvent(eventId, customerId, "canceled");
  const replay = await ctx.post("/api/stripe/webhook", {
    headers: {
      "stripe-signature": stripeSignature(replayPayload, WEBHOOK_SECRET),
      "content-type": "application/json",
    },
    data: replayPayload,
  });
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toMatchObject({ received: true, replay: true });
  expect(await subscriptionStatus(), "el replay no debe re-ejecutar negocio").toBe("active");
});
