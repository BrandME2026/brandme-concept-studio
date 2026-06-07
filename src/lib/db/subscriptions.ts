import { getPool } from "./client";

/**
 * Suscripciones de pago. NO hay login: la identidad es la cookie de sesión
 * (`bmc_session`), así que una suscripción cuelga del `session_id`. El webhook de
 * Stripe llega con el `customer`, por eso guardamos el mapping en ambos sentidos.
 *
 * Estados que cuentan como "activa" para el gate de publicación: 'active' y 'trialing',
 * además de `current_period_end` en el futuro (defensa si un evento quedó stale).
 */

export interface SubscriptionRecord {
  sessionId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: string;
  currentPeriodEnd: string | null;
  email: string | null;
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      session_id             TEXT PRIMARY KEY,
      stripe_customer_id     TEXT NOT NULL,
      stripe_subscription_id TEXT,
      status                 TEXT NOT NULL DEFAULT 'incomplete',
      current_period_end     TIMESTAMPTZ,
      email                  TEXT,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_customer
      ON subscriptions (stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_subid
      ON subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
  `);
  schemaReady = true;
}

/** Fila de la sesión (o null si nunca pasó por checkout). */
export async function getSubscriptionBySession(
  sessionId: string,
): Promise<SubscriptionRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().query<SubscriptionRecord>(
    `SELECT session_id AS "sessionId", stripe_customer_id AS "stripeCustomerId",
            stripe_subscription_id AS "stripeSubscriptionId", status,
            current_period_end AS "currentPeriodEnd", email
     FROM subscriptions WHERE session_id = $1`,
    [sessionId],
  );
  return rows[0] ?? null;
}

/** session_id asociado a un customer de Stripe (para el webhook). */
export async function getSessionByCustomer(customerId: string): Promise<string | null> {
  await ensureSchema();
  const { rows } = await getPool().query<{ sessionId: string }>(
    `SELECT session_id AS "sessionId" FROM subscriptions WHERE stripe_customer_id = $1`,
    [customerId],
  );
  return rows[0]?.sessionId ?? null;
}

/** Crea/actualiza el mapping sesión↔customer al iniciar el checkout. Idempotente. */
export async function upsertCustomer(input: {
  sessionId: string;
  customerId: string;
  email?: string | null;
}): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO subscriptions (session_id, stripe_customer_id, email, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (session_id) DO UPDATE
       SET stripe_customer_id = EXCLUDED.stripe_customer_id,
           email = COALESCE(EXCLUDED.email, subscriptions.email),
           updated_at = now()`,
    [input.sessionId, input.customerId, input.email ?? null],
  );
}

/**
 * Sincroniza el estado de la suscripción desde un evento de Stripe. Resuelve la sesión
 * por customer. Idempotente: descarta el evento si su `current_period_end` es anterior
 * al guardado (eventos fuera de orden).
 */
export async function applySubscriptionEvent(input: {
  customerId: string;
  subscriptionId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
  email?: string | null;
}): Promise<void> {
  await ensureSchema();
  const periodEnd = input.currentPeriodEnd ? input.currentPeriodEnd.toISOString() : null;
  await getPool().query(
    `UPDATE subscriptions
       SET stripe_subscription_id = $2,
           status = $3,
           current_period_end = $4,
           email = COALESCE($5, email),
           updated_at = now()
     WHERE stripe_customer_id = $1
       AND ($4::timestamptz IS NULL
            OR current_period_end IS NULL
            OR $4::timestamptz >= current_period_end)`,
    [input.customerId, input.subscriptionId, input.status, periodEnd, input.email ?? null],
  );
}

/** true si la sesión tiene una suscripción activa (status + period_end futuro). */
export async function isSubscriptionActive(sessionId: string): Promise<boolean> {
  const sub = await getSubscriptionBySession(sessionId);
  if (!sub) return false;
  if (!ACTIVE_STATUSES.has(sub.status)) return false;
  if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() <= Date.now()) {
    return false;
  }
  return true;
}

/** true si la sesión NUNCA pasó por subscriptions (para la regla legacy del gate). */
export async function hasAnySubscriptionRow(sessionId: string): Promise<boolean> {
  return (await getSubscriptionBySession(sessionId)) !== null;
}
