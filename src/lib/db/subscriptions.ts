import { db } from "./tenant-context";

/**
 * Suscripciones de pago. La fila cuelga históricamente del `session_id` (PK,
 * se conserva por EP-01) pero el TENANT es consultant_id: un consultant puede
 * acumular varias filas (una por sesión que pasó por checkout). Las lecturas
 * tenant-scoped van por RLS; el webhook de Stripe llega sin tenant y corre bajo
 * withSystemContext resolviendo por stripe_customer_id.
 *
 * Estados que cuentan como "activa" para el gate de publicación: 'active' y
 * 'trialing', con `current_period_end` NULL o en el futuro.
 */

export interface SubscriptionRecord {
  sessionId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: string;
  currentPeriodEnd: string | null;
  email: string | null;
}

/** Fila más reciente del tenant del contexto (o null si nunca pasó por checkout). */
export async function getSubscriptionForTenant(): Promise<SubscriptionRecord | null> {
  const { rows } = await db().query<SubscriptionRecord>(
    `SELECT session_id AS "sessionId", stripe_customer_id AS "stripeCustomerId",
            stripe_subscription_id AS "stripeSubscriptionId", status,
            current_period_end AS "currentPeriodEnd", email
     FROM subscriptions
     ORDER BY updated_at DESC
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

/** consultant dueño de un customer de Stripe (webhook; usar bajo withSystemContext). */
export async function getConsultantByCustomer(customerId: string): Promise<string | null> {
  const { rows } = await db().query<{ consultantId: string | null }>(
    `SELECT consultant_id AS "consultantId" FROM subscriptions WHERE stripe_customer_id = $1`,
    [customerId],
  );
  return rows[0]?.consultantId ?? null;
}

/** session_id asociado a un customer de Stripe (webhook; usar bajo withSystemContext). */
export async function getSessionByCustomer(customerId: string): Promise<string | null> {
  const { rows } = await db().query<{ sessionId: string }>(
    `SELECT session_id AS "sessionId" FROM subscriptions WHERE stripe_customer_id = $1`,
    [customerId],
  );
  return rows[0]?.sessionId ?? null;
}

/** Crea/actualiza el mapping sesión↔customer al iniciar el checkout (bajo withTenant). */
export async function upsertCustomer(input: {
  sessionId: string;
  customerId: string;
  email?: string | null;
}): Promise<void> {
  await db().query(
    `INSERT INTO subscriptions (session_id, stripe_customer_id, email, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (session_id) DO UPDATE
       SET stripe_customer_id = EXCLUDED.stripe_customer_id,
           email = COALESCE(EXCLUDED.email, subscriptions.email),
           updated_at = now()`,
    [input.sessionId, input.customerId, input.email ?? null],
  );
}

export type ApplySubscriptionResult = "applied" | "customer_not_found" | "stale_event";

/**
 * Sincroniza el estado de la suscripción desde un evento de Stripe (webhook;
 * usar bajo withSystemContext). Resuelve por customer. El resultado DISTINGUE
 * los dos no-ops (WO-6, hallazgo de review): "customer_not_found" debe
 * reintentar (cubre la carrera checkout→webhook), "stale_event" es el descarte
 * idempotente por diseño de eventos fuera de orden — jamás debe reintentar.
 */
export async function applySubscriptionEvent(input: {
  customerId: string;
  subscriptionId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
  email?: string | null;
}): Promise<ApplySubscriptionResult> {
  const existing = await db().query(
    `SELECT 1 FROM subscriptions WHERE stripe_customer_id = $1`,
    [input.customerId],
  );
  if (existing.rows.length === 0) return "customer_not_found";

  const periodEnd = input.currentPeriodEnd ? input.currentPeriodEnd.toISOString() : null;
  const updated = await db().query(
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
  return (updated.rowCount ?? 0) > 0 ? "applied" : "stale_event";
}

/** true si el tenant del contexto tiene ALGUNA suscripción activa. */
export async function isSubscriptionActive(): Promise<boolean> {
  const { rows } = await db().query<{ active: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM subscriptions
       WHERE status IN ('active', 'trialing')
         AND (current_period_end IS NULL OR current_period_end > now())
     ) AS active`,
  );
  return rows[0].active;
}

/** true si el tenant del contexto pasó alguna vez por subscriptions (regla legacy del gate). */
export async function hasAnySubscriptionRow(): Promise<boolean> {
  const { rows } = await db().query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM subscriptions) AS exists`,
  );
  return rows[0].exists;
}
