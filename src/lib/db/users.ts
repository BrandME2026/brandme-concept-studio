import { db } from "./tenant-context";

/**
 * Usuarios Firebase (login OPCIONAL) y su vínculo con las sesiones anónimas.
 * users/user_sessions son tablas de IDENTIDAD (sin RLS): se consultan para
 * resolver el tenant, así que estas funciones corren bajo withSystemContext
 * (razones "tenant-resolution" / "auth-link-merge") — nunca expuestas crudas.
 */

export interface UserRecord {
  id: string; // Firebase UID
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
}

/**
 * Crea/actualiza el usuario y vincula la sesión anónima actual a él.
 * Idempotente. Devuelve el consultant FINAL de la sesión (post-merge) para que
 * el caller pueda disparar señales del AccountStateMachine (WO-5).
 */
export async function upsertUserAndLinkSession(
  user: { id: string; email?: string; displayName?: string; photoUrl?: string },
  sessionId: string,
): Promise<string> {
  await db().query(
    `INSERT INTO users (id, email, display_name, photo_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, users.email),
       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
       photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
       updated_at = now()`,
    [user.id, user.email ?? null, user.displayName ?? null, user.photoUrl ?? null],
  );
  await db().query(
    `INSERT INTO user_sessions (session_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (session_id) DO UPDATE SET user_id = EXCLUDED.user_id, linked_at = now()`,
    [sessionId, user.id],
  );
  return mergeConsultantForUser(user.id, sessionId);
}

const TENANT_TABLES = ["conversations", "generations", "leads", "subscriptions"] as const;

/**
 * Merge de tenants al login (WO-3): la sesión debe quedar apuntando al
 * consultant CANÓNICO del user y el historial del provisional se reasigna —
 * mismo comportamiento de "no perder el historial al loguearse" que existía
 * con user_sessions, ahora a nivel de tenant. Corre dentro de la transacción
 * del withSystemContext del caller (pooled = un solo BEGIN). Devuelve el
 * consultant final de la sesión.
 */
async function mergeConsultantForUser(userId: string, sessionId: string): Promise<string> {
  const canonical = (
    await db().query<{ id: string }>(`SELECT id FROM consultants WHERE firebase_uid = $1`, [
      userId,
    ])
  ).rows[0]?.id;
  const provisional = (
    await db().query<{ consultant_id: string }>(
      `SELECT consultant_id FROM consultant_sessions WHERE session_id = $1`,
      [sessionId],
    )
  ).rows[0]?.consultant_id;

  if (!canonical) {
    if (provisional) {
      // Primer login del user: el consultant de esta sesión pasa a ser el canónico.
      await db().query(
        `UPDATE consultants SET firebase_uid = $1 WHERE id = $2 AND firebase_uid IS NULL`,
        [userId, provisional],
      );
      return provisional;
    }
    // Sesión sin datos todavía: nace el canónico y se mapea la sesión.
    const created = await db().query<{ id: string }>(
      `INSERT INTO consultants (firebase_uid) VALUES ($1) RETURNING id`,
      [userId],
    );
    await db().query(
      `INSERT INTO consultant_sessions (session_id, consultant_id)
       VALUES ($1, $2) ON CONFLICT (session_id) DO NOTHING`,
      [sessionId, created.rows[0].id],
    );
    return created.rows[0].id;
  }

  if (!provisional) {
    await db().query(
      `INSERT INTO consultant_sessions (session_id, consultant_id)
       VALUES ($1, $2)
       ON CONFLICT (session_id) DO UPDATE SET consultant_id = EXCLUDED.consultant_id`,
      [sessionId, canonical],
    );
    return canonical;
  }
  if (provisional === canonical) return canonical;

  // Repuntar TODAS las sesiones del provisional y reasignar su historial.
  await db().query(
    `UPDATE consultant_sessions SET consultant_id = $1 WHERE consultant_id = $2`,
    [canonical, provisional],
  );
  for (const table of TENANT_TABLES) {
    await db().query(`UPDATE ${table} SET consultant_id = $1 WHERE consultant_id = $2`, [
      canonical,
      provisional,
    ]);
  }
  return canonical;
}

/** Usuario dueño de una sesión, o null si esa sesión no está vinculada a nadie. */
export async function getUserBySession(sessionId: string): Promise<UserRecord | null> {
  const { rows } = await db().query<UserRecord>(
    `SELECT u.id, u.email, u.display_name AS "displayName", u.photo_url AS "photoUrl"
     FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.session_id = $1`,
    [sessionId],
  );
  return rows[0] ?? null;
}
