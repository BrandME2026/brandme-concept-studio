import { readSessionId } from "@/lib/session";
import { db, withSystemContext, TenantContextError } from "@/lib/db/tenant-context";

/**
 * Resolución de tenant (WO-3): cookie bmc_session → consultant_id. Corre bajo
 * withSystemContext("tenant-resolution") porque toca las tablas de IDENTIDAD
 * (consultant_sessions/consultants/user_sessions), que se consultan ANTES de
 * que exista contexto de tenant.
 */

/**
 * Consultant de la sesión actual, o null si no hay cookie. Auto-provisiona el
 * mapping para sesiones nuevas (cookie acuñada por el middleware): si la sesión
 * pertenece a un user con consultant canónico lo reusa; si no, crea uno anónimo.
 */
export async function resolveConsultantId(): Promise<string | null> {
  const sessionId = await readSessionId();
  if (!sessionId) return null;
  return withSystemContext("tenant-resolution", async () => {
    const found = await db().query<{ consultant_id: string }>(
      `SELECT consultant_id FROM consultant_sessions WHERE session_id = $1`,
      [sessionId],
    );
    if (found.rows[0]) return found.rows[0].consultant_id;

    const linked = await db().query<{ id: string }>(
      `SELECT c.id
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
    const final = await db().query<{ consultant_id: string }>(
      `SELECT consultant_id FROM consultant_sessions WHERE session_id = $1`,
      [sessionId],
    );
    return final.rows[0].consultant_id;
  });
}

/** Como resolveConsultantId, pero sin sesión lanza (la capa API lo mapea a 401). */
export async function requireConsultantId(): Promise<string> {
  const consultantId = await resolveConsultantId();
  if (!consultantId) {
    throw new TenantContextError("Request sin sesión: no hay tenant");
  }
  return consultantId;
}
