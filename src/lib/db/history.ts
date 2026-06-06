import { getPool } from "./client";

export interface GenerationRecord {
  id: string;
  sessionId: string;
  url: string;
  name: string;
  designMd: string;
  html: string;
  screenshot: string | null;
  interactions: string | null;
  createdAt: string;
  slug?: string | null;
}

export interface GenerationListItem {
  id: string;
  url: string;
  name: string;
  screenshot: string | null;
  createdAt: string;
  slug?: string | null;
}

let schemaReady = false;

/** Crea la tabla si no existe (idempotente). Se llama perezosamente. */
async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS generations (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id   TEXT NOT NULL,
      url          TEXT NOT NULL,
      name         TEXT NOT NULL,
      design_md    TEXT NOT NULL,
      html         TEXT NOT NULL,
      screenshot   TEXT,
      interactions TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_generations_session
      ON generations (session_id, created_at DESC);
    -- Campos SEO (idempotente sobre tablas ya creadas en prod).
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS slug TEXT;
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS brand TEXT;
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS city TEXT;
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS meta_title TEXT;
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS meta_description TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_generations_slug
      ON generations (slug) WHERE slug IS NOT NULL;
  `);
  schemaReady = true;
}

/** Reserva un slug único para `slug` base, añadiendo -2, -3… si ya existe. */
async function uniqueSlug(base: string): Promise<string> {
  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const { rows } = await getPool().query(
      `SELECT 1 FROM generations WHERE slug = $1 LIMIT 1`,
      [candidate],
    );
    if (rows.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

/** Guarda una generación y devuelve {id, slug}. */
export async function saveGeneration(input: {
  sessionId: string;
  url: string;
  name: string;
  designMd: string;
  html: string;
  screenshot?: string | null;
  interactions?: string | null;
  slug?: string | null;
  brand?: string | null;
  city?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
}): Promise<{ id: string; slug: string | null }> {
  await ensureSchema();
  const slug = input.slug ? await uniqueSlug(input.slug) : null;
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO generations (session_id, url, name, design_md, html, screenshot, interactions,
       slug, brand, city, meta_title, meta_description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      input.sessionId,
      input.url,
      input.name,
      input.designMd,
      input.html,
      input.screenshot ?? null,
      input.interactions ?? null,
      slug,
      input.brand ?? null,
      input.city ?? null,
      input.metaTitle ?? null,
      input.metaDescription ?? null,
    ],
  );
  return { id: rows[0].id, slug };
}

/** Lista las generaciones de una sesión (sin el HTML pesado). */
export async function listGenerations(
  sessionId: string,
  limit = 50,
): Promise<GenerationListItem[]> {
  await ensureSchema();
  const { rows } = await getPool().query<GenerationListItem>(
    `SELECT id, url, name, screenshot, created_at AS "createdAt"
     FROM generations WHERE session_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [sessionId, limit],
  );
  return rows;
}

/** Lista TODAS las generaciones (galería pública de referencia), sin filtro de sesión. */
export async function listAllGenerations(limit = 60): Promise<GenerationListItem[]> {
  await ensureSchema();
  const { rows } = await getPool().query<GenerationListItem>(
    `SELECT id, url, name, screenshot, slug, created_at AS "createdAt"
     FROM generations ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

/** Página pública por SLUG (para /p/[slug]). Busca solo por slug. */
export async function getPublicGenerationBySlug(slug: string): Promise<{
  id: string;
  slug: string | null;
  url: string;
  name: string;
  html: string;
  screenshot: string | null;
  brand: string | null;
  city: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
} | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, slug, url, name, html, screenshot,
            brand, city, meta_title AS "metaTitle", meta_description AS "metaDescription"
     FROM generations WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  return rows[0] ?? null;
}

/** Cuenta todas las generaciones (stat real "brands in registry"). */
export async function countAllGenerations(): Promise<number> {
  await ensureSchema();
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM generations`,
  );
  return Number(rows[0]?.count ?? 0);
}

/** Obtiene una generación por id SIN verificar sesión (vista pública /p/[id]). */
export async function getPublicGeneration(id: string): Promise<GenerationRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().query<GenerationRecord & { slug: string | null }>(
    `SELECT id, session_id AS "sessionId", url, name, design_md AS "designMd",
            html, screenshot, interactions, slug, created_at AS "createdAt"
     FROM generations WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Obtiene una generación completa (verificando que pertenece a la sesión). */
export async function getGeneration(
  id: string,
  sessionId: string,
): Promise<GenerationRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().query<GenerationRecord>(
    `SELECT id, session_id AS "sessionId", url, name, design_md AS "designMd",
            html, screenshot, interactions, created_at AS "createdAt"
     FROM generations WHERE id = $1 AND session_id = $2`,
    [id, sessionId],
  );
  return rows[0] ?? null;
}
