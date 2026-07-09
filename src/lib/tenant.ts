import { readSessionId } from "@/lib/session";
import { db, withSystemContext, TenantContextError } from "@/lib/db/tenant-context";
import type { AccountState } from "@/lib/auth/account-state-machine";

/**
 * Resolución de tenant (WO-3): cookie bmc_session → consultant_id. Corre bajo
 * withSystemContext("tenant-resolution") porque toca las tablas de IDENTIDAD
 * (consultant_sessions/consultants/user_sessions), que se consultan ANTES de
 * que exista contexto de tenant.
 *
 * WO-5: la resolución también devuelve account_state (viaja en los mismos
 * SELECT/JOIN — cero queries extra) para que la capa API pueda negar el portal
 * a cuentas 'pending' sin otro roundtrip.
 */

export interface ConsultantIdentity {
  consultantId: string;
  accountState: AccountState;
}

/**
 * Identidad del consultant de la sesión actual, o null si no hay cookie.
 * Auto-provisiona el mapping para sesiones nuevas (cookie acuñada por el
 * middleware): si la sesión pertenece a un user con consultant canónico lo
 * reusa; si no, crea uno anónimo (que nace 'active' — login opcional).
 */
export async function resolveConsultant(): Promise<ConsultantIdentity | null> {
  const sessionId = await readSessionId();
  if (!sessionId) return null;
  return withSystemContext("tenant-resolution", async () => {
    const found = await db().query<{ consultant_id: string; account_state: AccountState }>(
      `SELECT cs.consultant_id, c.account_state
       FROM consultant_sessions cs JOIN consultants c ON c.id = cs.consultant_id
       WHERE cs.session_id = $1`,
      [sessionId],
    );
    if (found.rows[0]) {
      return {
        consultantId: found.rows[0].consultant_id,
        accountState: found.rows[0].account_state,
      };
    }

    const linked = await db().query<{ id: string; account_state: AccountState }>(
      `SELECT c.id, c.account_state
       FROM user_sessions us JOIN consultants c ON c.firebase_uid = us.user_id
       WHERE us.session_id = $1`,
      [sessionId],
    );
    const consultantId =
      linked.rows[0]?.id ??
      (
        await db().query<{ id: string }>(
          `INSERT INTO consultants (firebase_uid) VALUES (NULL) RETURNING id`,
        )
      ).rows[0].id;

    await db().query(
      `INSERT INTO consultant_sessions (session_id, consultant_id)
       VALUES ($1, $2)
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionId, consultantId],
    );
    // Si otro request concurrente ganó el INSERT, el mapping del ganador manda.
    const final = await db().query<{ consultant_id: string; account_state: AccountState }>(
      `SELECT cs.consultant_id, c.account_state
       FROM consultant_sessions cs JOIN consultants c ON c.id = cs.consultant_id
       WHERE cs.session_id = $1`,
      [sessionId],
    );
    return {
      consultantId: final.rows[0].consultant_id,
      accountState: final.rows[0].account_state,
    };
  });
}

/** Solo el id (compatibilidad para superficies que no gatean por estado). */
export async function resolveConsultantId(): Promise<string | null> {
  return (await resolveConsultant())?.consultantId ?? null;
}

/** Como resolveConsultant, pero sin sesión lanza (la capa API lo mapea a 401). */
export async function requireConsultant(): Promise<ConsultantIdentity> {
  const identity = await resolveConsultant();
  if (!identity) {
    throw new TenantContextError("Request sin sesión: no hay tenant");
  }
  return identity;
}

/** Como requireConsultant pero devolviendo solo el id. */
export async function requireConsultantId(): Promise<string> {
  return (await requireConsultant()).consultantId;
}
