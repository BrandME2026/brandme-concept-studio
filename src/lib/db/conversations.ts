import { getPool } from "./client";

export interface ConversationRecord {
  id: string;
  sessionId: string;
  title: string;
  messages: unknown[]; // UIMessage[] serializados
  url: string | null;
  generatedHtml: string | null;
  designMd: string | null;
  name: string | null;
  screenshot: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: string;
}

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id     TEXT NOT NULL,
      title          TEXT NOT NULL DEFAULT 'Nueva conversación',
      messages       JSONB NOT NULL DEFAULT '[]'::jsonb,
      url            TEXT,
      generated_html TEXT,
      design_md      TEXT,
      name           TEXT,
      screenshot     TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_session
      ON conversations (session_id, updated_at DESC);
  `);
  schemaReady = true;
}

/** Crea una conversación vacía y devuelve su id. */
export async function createConversation(sessionId: string): Promise<string> {
  await ensureSchema();
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO conversations (session_id) VALUES ($1) RETURNING id`,
    [sessionId],
  );
  return rows[0].id;
}

/** Lista las conversaciones de una sesión (sin payload pesado). */
export async function listConversations(
  sessionId: string,
  limit = 50,
): Promise<ConversationListItem[]> {
  await ensureSchema();
  const { rows } = await getPool().query<ConversationListItem>(
    `SELECT id, title, updated_at AS "updatedAt"
     FROM conversations WHERE session_id = $1
     ORDER BY updated_at DESC LIMIT $2`,
    [sessionId, limit],
  );
  return rows;
}

/** Obtiene una conversación completa (verificando que pertenece a la sesión). */
export async function getConversation(
  id: string,
  sessionId: string,
): Promise<ConversationRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().query<ConversationRecord>(
    `SELECT id, session_id AS "sessionId", title, messages, url,
            generated_html AS "generatedHtml", design_md AS "designMd", name,
            screenshot, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM conversations WHERE id = $1 AND session_id = $2`,
    [id, sessionId],
  );
  return rows[0] ?? null;
}

/** Guarda/actualiza una conversación. Solo toca los campos provistos. */
export async function saveConversation(
  id: string,
  sessionId: string,
  patch: {
    title?: string;
    messages?: unknown[];
    url?: string | null;
    generatedHtml?: string | null;
    designMd?: string | null;
    name?: string | null;
    screenshot?: string | null;
  },
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE conversations SET
       title          = COALESCE($3, title),
       messages       = COALESCE($4::jsonb, messages),
       url            = COALESCE($5, url),
       generated_html = COALESCE($6, generated_html),
       design_md      = COALESCE($7, design_md),
       name           = COALESCE($8, name),
       screenshot     = COALESCE($9, screenshot),
       updated_at     = now()
     WHERE id = $1 AND session_id = $2`,
    [
      id,
      sessionId,
      patch.title ?? null,
      patch.messages ? JSON.stringify(patch.messages) : null,
      patch.url ?? null,
      patch.generatedHtml ?? null,
      patch.designMd ?? null,
      patch.name ?? null,
      patch.screenshot ?? null,
    ],
  );
}

/** Página generada de una conversación, por id, SIN sesión (para compartir /p/[id]). */
export async function getPublicConversationPage(
  id: string,
): Promise<{ id: string; url: string | null; name: string | null; html: string } | null> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    id: string;
    url: string | null;
    name: string | null;
    html: string | null;
  }>(
    `SELECT id, url, name, generated_html AS html
     FROM conversations WHERE id = $1 AND generated_html IS NOT NULL`,
    [id],
  );
  const r = rows[0];
  if (!r || !r.html) return null;
  return { id: r.id, url: r.url, name: r.name, html: r.html };
}

/** Borra una conversación de la sesión. */
export async function deleteConversation(id: string, sessionId: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `DELETE FROM conversations WHERE id = $1 AND session_id = $2`,
    [id, sessionId],
  );
}
