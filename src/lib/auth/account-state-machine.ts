import { db } from "@/lib/db/tenant-context";
import { captureError } from "@/lib/observability/observability";

/**
 * AccountStateMachine (WO-5, blueprint 1a85d215): ÚNICO escritor de
 * consultants.account_state. El enforcement es a nivel BD — un trigger rechaza
 * cualquier escritura que no venga de aquí (GUC app.account_state_writer,
 * seteado en el MISMO statement vía subquery en FROM: atómico y válido tanto
 * en modo pooled como direct).
 *
 * Señales reales de hoy: password_set llega por /api/auth/link (login
 * verificado sobre un consultant pending; la UI de Stage 2 de Build 2 golpea
 * este mismo path) y checkout_completed/subscription_deleted por el adapter
 * Stripe del WebhookHandlerPrimitive (WO-6). Las señales repetidas son no-op
 * silencioso y las transiciones inválidas no-op + captureError: los webhooks
 * REINTENTAN ante 5xx, así que la máquina jamás lanza por ruido de eventos.
 *
 * Corre bajo el contexto ambiental (withSystemContext en todos los callers).
 */

export type AccountState = "pending" | "active" | "subscribed" | "active_post_cancel";
export type AccountSignal = "password_set" | "checkout_completed" | "subscription_deleted";

export interface SignalResult {
  applied: boolean;
  state: AccountState | null;
  reason?: "noop" | "invalid_transition" | "not_found";
}

// Camino del blueprint + re-entrada active_post_cancel→subscribed (extensión
// documentada: sin ella un cliente que re-suscribe quedaría atascado).
const TRANSITIONS: Record<AccountState, Partial<Record<AccountSignal, AccountState>>> = {
  pending: { password_set: "active" },
  active: { checkout_completed: "subscribed" },
  subscribed: { subscription_deleted: "active_post_cancel" },
  active_post_cancel: { checkout_completed: "subscribed" },
};

// Estados donde la señal ya se consumó antes: repetirla es no-op, no error.
const NOOP_STATES: Record<AccountSignal, AccountState[]> = {
  password_set: ["active", "subscribed", "active_post_cancel"],
  checkout_completed: ["subscribed"],
  subscription_deleted: ["active_post_cancel"],
};

const MILESTONE_BY_SIGNAL: Partial<Record<AccountSignal, string>> = {
  password_set: "stage2_password_set_at",
  checkout_completed: "checkout_completed_at",
};

const WRITER_GUC = `SELECT set_config('app.account_state_writer', 'account-state-machine', true)`;

export async function getAccountState(consultantId: string): Promise<AccountState | null> {
  const { rows } = await db().query<{ account_state: AccountState }>(
    `SELECT account_state FROM consultants WHERE id = $1`,
    [consultantId],
  );
  return rows[0]?.account_state ?? null;
}

/** Milestone write-once: el COALESCE preserva el primer valor (el trigger de BD lo exige). */
async function recordMilestone(consultantId: string, column: string): Promise<void> {
  await db().query(
    `INSERT INTO onboarding_sessions (consultant_id, ${column})
     VALUES ($1, now())
     ON CONFLICT (consultant_id) DO UPDATE
       SET ${column} = COALESCE(onboarding_sessions.${column}, now()),
           updated_at = now()`,
    [consultantId],
  );
}

/**
 * Aplica una señal del lifecycle. Compare-and-swap sobre el estado leído: si
 * una señal concurrente ganó la carrera, se re-lee y re-evalúa (máx. 3 vueltas).
 */
export async function signalAccountState(
  consultantId: string,
  signal: AccountSignal,
): Promise<SignalResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getAccountState(consultantId);
    if (!current) return { applied: false, state: null, reason: "not_found" };

    const target = TRANSITIONS[current][signal];
    if (!target) {
      if (NOOP_STATES[signal].includes(current)) {
        return { applied: false, state: current, reason: "noop" };
      }
      captureError(
        new Error(
          `AccountStateMachine: transición inválida '${signal}' desde '${current}' (consultant ${consultantId})`,
        ),
      );
      return { applied: false, state: current, reason: "invalid_transition" };
    }

    const updated = await db().query(
      `UPDATE consultants SET account_state = $3
         FROM (${WRITER_GUC}) AS writer
        WHERE consultants.id = $1 AND consultants.account_state = $2`,
      [consultantId, current, target],
    );
    if ((updated.rowCount ?? 0) === 1) {
      const milestone = MILESTONE_BY_SIGNAL[signal];
      if (milestone) await recordMilestone(consultantId, milestone);
      return { applied: true, state: target };
    }
    // rowCount 0: otra señal cambió el estado entre el SELECT y el UPDATE.
  }
  captureError(
    new Error(`AccountStateMachine: CAS agotado para '${signal}' (consultant ${consultantId})`),
  );
  return { applied: false, state: await getAccountState(consultantId), reason: "invalid_transition" };
}

/**
 * Crea el Consultant 'pending' de Stage 1 ChatIntake (la cuenta existe antes
 * de que el password esté seteado) + milestone stage1_submitted_at. Usar bajo
 * withSystemContext — el onboarding llega sin contexto tenant.
 */
export async function createPendingConsultant(firebaseUid: string | null = null): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO consultants (firebase_uid, account_state)
     SELECT $1, 'pending' FROM (${WRITER_GUC}) AS writer
     RETURNING id`,
    [firebaseUid],
  );
  const consultantId = rows[0].id;
  await recordMilestone(consultantId, "stage1_submitted_at");
  return consultantId;
}
