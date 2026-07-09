import { db } from "./tenant-context";

/**
 * Conversaciones del consultor. El aislamiento lo pone RLS vía el contexto
 * (withTenant en la ruta): aquí ya NO se filtra por session_id — la columna se
 * conserva solo como dato de trazabilidad. Las funciones "public*" se usan bajo
 * withSystemContext (superficies públicas /p/[id], galería).
 */

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

/** Crea una conversación vacía y devuelve su id (consultant_id lo pone el GUC del contexto). */
export async function createConversation(sessionId: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO conversations (session_id) VALUES ($1) RETURNING id`,
    [sessionId],
  );
  return rows[0].id;
}

/** Lista las conversaciones del tenant del contexto (sin payload pesado). */
export async function listConversations(limit = 50): Promise<ConversationListItem[]> {
  const { rows } = await db().query<ConversationListItem>(
    `SELECT id, title, updated_at AS "updatedAt"
     FROM conversations
     ORDER BY updated_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

/** Obtiene una conversación completa (RLS garantiza que es del tenant). */
export async function getConversation(id: string): Promise<ConversationRecord | null> {
  const { rows } = await db().query<ConversationRecord>(
    `SELECT id, session_id AS "sessionId", title, messages, url,
            generated_html AS "generatedHtml", design_md AS "designMd", name,
            screenshot, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM conversations WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Guarda/actualiza una conversación del tenant. Solo toca los campos provistos. */
export async function saveConversation(
  id: string,
  patch: {
    title?: string;
    messages?: unknown[];
    url?: string | null;
    generatedHtml?: string | null;
    designMd?: string | null;
    name?: string | null;
    screenshot?: string | null;
    slug?: string | null;
    brand?: string | null;
    city?: string | null;
    metaTitle?: string | null;
    metaDescription?: string | null;
  },
): Promise<void> {
  await db().query(
    `UPDATE conversations SET
       title            = COALESCE($2, title),
       messages         = COALESCE($3::jsonb, messages),
       url              = COALESCE($4, url),
       generated_html   = COALESCE($5, generated_html),
       design_md        = COALESCE($6, design_md),
       name             = COALESCE($7, name),
       screenshot       = COALESCE($8, screenshot),
       slug             = COALESCE($9, slug),
       brand            = COALESCE($10, brand),
       city             = COALESCE($11, city),
       meta_title       = COALESCE($12, meta_title),
       meta_description = COALESCE($13, meta_description),
       updated_at       = now()
     WHERE id = $1`,
    [
      id,
      patch.title ?? null,
      patch.messages ? JSON.stringify(patch.messages) : null,
      patch.url ?? null,
      patch.generatedHtml ?? null,
      patch.designMd ?? null,
      patch.name ?? null,
      patch.screenshot ?? null,
      patch.slug ?? null,
      patch.brand ?? null,
      patch.city ?? null,
      patch.metaTitle ?? null,
      patch.metaDescription ?? null,
    ],
  );
}

/** Página generada por id, superficie pública /p/[id] (usar bajo withSystemContext). */
export async function getPublicConversationPage(
  id: string,
): Promise<{ id: string; url: string | null; name: string | null; html: string } | null> {
  const { rows } = await db().query<{
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

export interface PublicPage {
  id: string;
  slug: string | null;
  url: string | null;
  name: string | null;
  html: string;
  screenshot: string | null;
  brand: string | null;
  city: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

/** Página generada por SLUG, superficie pública /p/[slug] (usar bajo withSystemContext). */
export async function getPublicConversationBySlug(slug: string): Promise<PublicPage | null> {
  const { rows } = await db().query<PublicPage & { html: string | null }>(
    `SELECT id, slug, url, name, generated_html AS html, screenshot,
            brand, city, meta_title AS "metaTitle", meta_description AS "metaDescription"
     FROM conversations WHERE slug = $1 AND generated_html IS NOT NULL LIMIT 1`,
    [slug],
  );
  const r = rows[0];
  if (!r || !r.html) return null;
  return { ...r, html: r.html };
}

/** Borra una conversación del tenant. */
export async function deleteConversation(id: string): Promise<void> {
  await db().query(`DELETE FROM conversations WHERE id = $1`, [id]);
}
