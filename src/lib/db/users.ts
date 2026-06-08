import { getPool } from "./client";

/**
 * Usuarios Firebase (login OPCIONAL) y su vínculo con las sesiones anónimas.
 * La app sigue funcionando por `session_id` (cookie); cuando un usuario inicia sesión,
 * vinculamos su `session_id` actual a su `user_id` para no perder el historial previo.
 * Esto NO cambia las tablas existentes (conversations/generations por session_id):
 * la pertenencia usuario→datos se resuelve por el join user_sessions.
 */

export interface UserRecord {
  id: string; // Firebase UID
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
}

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      email        TEXT,
      display_name TEXT,
      photo_url    TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      linked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id);
  `);
  schemaReady = true;
}

/** Crea/actualiza el usuario y vincula la sesión anónima actual a él. Idempotente. */
export async function upsertUserAndLinkSession(
  user: { id: string; email?: string; displayName?: string; photoUrl?: string },
  sessionId: string,
): Promise<void> {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `INSERT INTO users (id, email, display_name, photo_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, users.email),
       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
       photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
       updated_at = now()`,
    [user.id, user.email ?? null, user.displayName ?? null, user.photoUrl ?? null],
  );
  await pool.query(
    `INSERT INTO user_sessions (session_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (session_id) DO UPDATE SET user_id = EXCLUDED.user_id, linked_at = now()`,
    [sessionId, user.id],
  );
}

/** Usuario dueño de una sesión, o null si esa sesión no está vinculada a nadie. */
export async function getUserBySession(sessionId: string): Promise<UserRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().query<UserRecord>(
    `SELECT u.id, u.email, u.display_name AS "displayName", u.photo_url AS "photoUrl"
     FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.session_id = $1`,
    [sessionId],
  );
  return rows[0] ?? null;
}
