import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac, randomUUID } from "node:crypto";
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import { MIGRATIONS_DB_URL } from "../../db-urls";

/**
 * COV_PF_AUTH_002: Authentication & Account Lifecycle — @platform @auth (P0)
 *
 * Sin mocks en el path de autenticación: el spec crea un usuario DESECHABLE en
 * el proyecto Firebase real (identitytoolkit REST, API key de .env.local),
 * obtiene un ID token firmado por Google y lo pasa por /api/auth/link — la
 * verificación JWKS del server es la de producción. Las transiciones de Stripe
 * se conducen con webhooks firmados (HMAC local, patrón webhook.spec.ts).
 * El usuario desechable se borra al final (accounts:delete).
 */

const WEBHOOK_SECRET = "whsec_e2e_dummy";

function firebaseApiKey(): string | null {
  try {
    const env = readFileSync(resolve(__dirname, "../../../.env.local"), "utf8");
    return /NEXT_PUBLIC_FIREBASE_API_KEY=(.+)/.exec(env)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

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
        id: "sub_e2e_auth",
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

async function accountState(consultantId: string): Promise<string> {
  const { rows } = await withMigrator((c) =>
    c.query<{ account_state: string }>(`SELECT account_state FROM consultants WHERE id = $1`, [
      consultantId,
    ]),
  );
  return rows[0].account_state;
}

let ctx: APIRequestContext;

test.beforeAll(async ({}, testInfo) => {
  ctx = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL! });
});

test.afterAll(async () => {
  await ctx?.dispose();
});

test("@COV_PF_AUTH_002.1 @platform @auth — un ID token manipulado se rechaza sin tocar datos", async () => {
  const usersBefore = await withMigrator((c) =>
    c.query<{ n: string }>(`SELECT count(*) AS n FROM users`),
  );

  // JWT estructuralmente válido con firma basura: pasa el parseo, falla la
  // verificación criptográfica contra las claves de Google.
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const tampered = `${b64({ alg: "RS256", kid: "kid-falso" })}.${b64({
    aud: "brandme-5551f",
    iss: "https://securetoken.google.com/brandme-5551f",
    sub: "uid-atacante",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.${Buffer.from("firma-falsa").toString("base64url")}`;

  const res = await ctx.post("/api/auth/link", {
    headers: {
      authorization: `Bearer ${tampered}`,
      cookie: `bmc_session=sess-e2e-auth-${randomUUID().slice(0, 8)}`,
    },
  });
  expect(res.status()).toBe(401);

  const usersAfter = await withMigrator((c) =>
    c.query<{ n: string }>(`SELECT count(*) AS n FROM users`),
  );
  expect(usersAfter.rows[0].n, "cero escrituras con token inválido").toBe(usersBefore.rows[0].n);
});

test("@COV_PF_AUTH_002.2 @platform @auth — el lifecycle sigue el camino permitido", async () => {
  const apiKey = firebaseApiKey();
  test.skip(!apiKey, "sin NEXT_PUBLIC_FIREBASE_API_KEY en .env.local — no se puede crear el usuario real");

  const sessionId = `sess-e2e-auth-${randomUUID().slice(0, 8)}`;
  const cookie = `bmc_session=${sessionId}`;
  const customerId = `cus_e2e_auth_${randomUUID().slice(0, 8)}`;

  // Seed: consultant PENDING (como lo dejará Stage 1 ChatIntake) mapeado a la
  // sesión. El INSERT en pending exige el GUC del single-writer.
  const consultantId = await withMigrator(async (c) => {
    await c.query(`SELECT set_config('app.account_state_writer', 'account-state-machine', false)`);
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO consultants (firebase_uid, account_state) VALUES (NULL, 'pending') RETURNING id`,
    );
    await c.query(`INSERT INTO consultant_sessions (session_id, consultant_id) VALUES ($1, $2)`, [
      sessionId,
      rows[0].id,
    ]);
    await c.query(
      `INSERT INTO onboarding_sessions (consultant_id, stage1_submitted_at) VALUES ($1, now())`,
      [rows[0].id],
    );
    return rows[0].id;
  });

  // 1) pending → el portal (API tenant) se niega con ACCOUNT_PENDING.
  const denied = await ctx.get("/api/history", { headers: { cookie } });
  expect(denied.status()).toBe(403);
  expect(await denied.json()).toMatchObject({ code: "ACCOUNT_PENDING" });

  // 1b) La página server /c/[id] (única superficie tenant fuera de tenantRoute,
  //     hallazgo de review R1) también gatea: con conversación PROPIA, pending
  //     es expulsado a "/".
  const conversationId = await withMigrator(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO conversations (session_id, consultant_id, title)
       VALUES ($1, $2, 'conv del pending') RETURNING id`,
      [sessionId, consultantId],
    );
    return rows[0].id;
  });
  const pageDenied = await ctx.get(`/c/${conversationId}`, { headers: { cookie } });
  expect(new URL(pageDenied.url()).pathname, "pending expulsado del portal").toBe("/");

  // 2) password-set REAL: usuario desechable en Firebase → ID token firmado por
  //    Google → /api/auth/link → pending → active.
  const email = `e2e-wo5-${randomUUID().slice(0, 12)}@brandme-e2e.test`;
  const signUp = await ctx.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    { data: { email, password: `E2e-${randomUUID()}`, returnSecureToken: true } },
  );
  expect(signUp.ok(), "signUp contra Firebase real").toBe(true);
  const { idToken } = (await signUp.json()) as { idToken: string };

  try {
    const linked = await ctx.post("/api/auth/link", {
      headers: { authorization: `Bearer ${idToken}`, cookie },
    });
    expect(linked.status()).toBe(200);
    expect(await linked.json()).toMatchObject({ success: true, data: { linked: true } });

    expect(await accountState(consultantId), "pending → active").toBe("active");
    const milestone = await withMigrator((c) =>
      c.query<{ ts: Date | null }>(
        `SELECT stage2_password_set_at AS ts FROM onboarding_sessions WHERE consultant_id = $1`,
        [consultantId],
      ),
    );
    expect(milestone.rows[0].ts, "milestone Stage 2 escrito").toBeInstanceOf(Date);

    // 3) activa → el portal ya responde (API y página server).
    const allowed = await ctx.get("/api/history", { headers: { cookie } });
    expect(allowed.status()).toBe(200);
    const pageAllowed = await ctx.get(`/c/${conversationId}`, { headers: { cookie } });
    expect(new URL(pageAllowed.url()).pathname, "activa entra a su conversación").toBe(
      `/c/${conversationId}`,
    );

    // 4) checkout completado (webhook Stripe firmado) → active → subscribed.
    await withMigrator((c) =>
      c.query(
        `INSERT INTO subscriptions (session_id, consultant_id, stripe_customer_id, status)
         VALUES ($1, $2, $3, 'incomplete')`,
        [sessionId, consultantId, customerId],
      ),
    );
    const subPayload = subscriptionEvent(`evt_e2e_auth_${randomUUID().slice(0, 8)}`, customerId, "active");
    const subRes = await ctx.post("/api/stripe/webhook", {
      headers: {
        "stripe-signature": stripeSignature(subPayload, WEBHOOK_SECRET),
        "content-type": "application/json",
      },
      data: subPayload,
    });
    expect(subRes.status()).toBe(200);
    expect(await accountState(consultantId), "active → subscribed").toBe("subscribed");

    // 5) cancelación → subscribed → active_post_cancel.
    const cancelPayload = subscriptionEvent(
      `evt_e2e_auth_${randomUUID().slice(0, 8)}`,
      customerId,
      "canceled",
    );
    const cancelRes = await ctx.post("/api/stripe/webhook", {
      headers: {
        "stripe-signature": stripeSignature(cancelPayload, WEBHOOK_SECRET),
        "content-type": "application/json",
      },
      data: cancelPayload,
    });
    expect(cancelRes.status()).toBe(200);
    expect(await accountState(consultantId), "subscribed → active_post_cancel").toBe(
      "active_post_cancel",
    );

    // 6) Nadie escribe account_state fuera de la máquina (trigger de BD).
    await expect(
      withMigrator((c) =>
        c.query(`UPDATE consultants SET account_state = 'subscribed' WHERE id = $1`, [consultantId]),
      ),
    ).rejects.toThrow(/AccountStateMachine/);
  } finally {
    await ctx.post(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, {
      data: { idToken },
    });
  }
});
