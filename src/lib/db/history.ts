import { getPool } from "./client";
import { normalizeKey } from "@/lib/seo/slug";

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
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS whatsapp TEXT;
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS keywords TEXT;
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS faq TEXT;
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS css TEXT;
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS form_fields TEXT;
    -- Gate de publicación (pago). Las filas YA existentes se marcan publicadas (legacy
    -- público): el DEFAULT solo aplica a inserciones nuevas, así que el primer ALTER deja
    -- las viejas en true y luego cambiamos el default a false para las que vienen.
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE generations ALTER COLUMN published SET DEFAULT false;
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
  whatsapp?: string | null;
  email?: string | null;
  phone?: string | null;
  keywords?: string[] | null;
  faq?: { q: string; a: string }[] | null;
  css?: string | null;
  formFields?: string[] | null;
  /** Si true, la web nace publicada (sin paywall = comportamiento legacy gratis). */
  published?: boolean;
}): Promise<{ id: string; slug: string | null }> {
  await ensureSchema();
  const slug = input.slug ? await uniqueSlug(input.slug) : null;
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO generations (session_id, url, name, design_md, html, screenshot, interactions,
       slug, brand, city, meta_title, meta_description, whatsapp, email, phone, keywords, faq, css, form_fields, published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
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
      input.whatsapp ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.keywords?.length ? JSON.stringify(input.keywords) : null,
      input.faq?.length ? JSON.stringify(input.faq) : null,
      input.css ?? null,
      input.formFields?.length ? JSON.stringify(input.formFields) : null,
      input.published ?? false,
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

/**
 * Lista las generaciones para la galería pública. Solo webs ACTIVAS (publicadas + dueño
 * con suscripción, o legacy) cuando se aplica el paywall. Sin filtro de sesión.
 */
export async function listAllGenerations(
  limit = 60,
  enforcePaywall = false,
): Promise<GenerationListItem[]> {
  await ensureSchema();
  const { rows } = await getPool().query<GenerationListItem>(
    `SELECT g.id, g.url, g.name, g.screenshot, g.slug, g.created_at AS "createdAt"
     FROM generations g
     LEFT JOIN subscriptions s ON s.session_id = g.session_id
     WHERE ${publishGate(enforcePaywall)}
     ORDER BY g.created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

/**
 * Cláusula del gate de publicación para usar en queries públicas. Una web se sirve si
 * está `published` y, cuando se aplica el paywall, su dueño (session_id) tiene suscripción
 * activa O nunca pasó por subscriptions (legacy público). `g` y `s` son los alias de
 * generations y del LEFT JOIN subscriptions. Cuando enforce=false, solo exige published.
 */
function publishGate(enforce: boolean, g = "g", s = "s"): string {
  if (!enforce) return `${g}.published = true`;
  return `${g}.published = true AND (
    ${s}.session_id IS NULL
    OR (${s}.status IN ('active','trialing')
        AND (${s}.current_period_end IS NULL OR ${s}.current_period_end > now()))
  )`;
}

/** Página pública por SLUG (para /p/[slug]). Busca solo por slug. */
export async function getPublicGenerationBySlug(
  slug: string,
  enforcePaywall = false,
): Promise<{
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
  whatsapp: string | null;
  keywords: string[] | null;
  faq: { q: string; a: string }[] | null;
  css: string | null;
  formFields: string[] | null;
} | null> {
  await ensureSchema();
  const { rows } = await getPool().query<{
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
    whatsapp: string | null;
    keywords: string | null;
    faq: string | null;
    css: string | null;
    formFields: string | null;
  }>(
    `SELECT g.id, g.slug, g.url, g.name, g.html, g.screenshot,
            g.brand, g.city, g.meta_title AS "metaTitle", g.meta_description AS "metaDescription",
            g.whatsapp, g.keywords, g.faq, g.css, g.form_fields AS "formFields"
     FROM generations g
     LEFT JOIN subscriptions s ON s.session_id = g.session_id
     WHERE g.slug = $1 AND ${publishGate(enforcePaywall)} LIMIT 1`,
    [slug],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    ...r,
    keywords: safeJsonArray<string>(r.keywords),
    faq: safeJsonArray<{ q: string; a: string }>(r.faq),
    formFields: safeJsonArray<string>(r.formFields),
  };
}

/** Parsea un campo JSON-array guardado como texto; null/inválido → null. */
function safeJsonArray<T>(s: string | null): T[] | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : null;
  } catch {
    return null;
  }
}

/**
 * Busca una generación existente por marca (+ ciudad opcional), sin filtrar por sesión.
 * Anti-duplicado: si ya existe la misma marca+ciudad, reusamos esa página en vez de
 * generar otra clónica. La comparación usa normalizeKey (sin acentos ni puntuación) para
 * que "McDonald's", "McDonalds" y "mcdonald s" cuenten como la misma marca. El filtrado
 * se hace en memoria porque normalizar puntuación en SQL puro es frágil; el volumen de
 * marcas es bajo (decenas), así que es barato. city vacía ⇒ coincide con registros sin
 * ciudad o de la misma ciudad normalizada.
 */
export async function findGenerationByBrandCity(
  brand: string,
  city: string | null,
): Promise<{ id: string; slug: string | null } | null> {
  await ensureSchema();
  const bKey = normalizeKey(brand);
  if (!bKey) return null;
  const cKey = normalizeKey(city);
  const { rows } = await getPool().query<{
    id: string;
    slug: string | null;
    brand: string | null;
    city: string | null;
  }>(
    `SELECT id, slug, brand, city FROM generations
     WHERE brand IS NOT NULL ORDER BY created_at ASC`,
  );
  const match = rows.find(
    (r) => normalizeKey(r.brand) === bKey && normalizeKey(r.city) === cKey,
  );
  return match ? { id: match.id, slug: match.slug } : null;
}

/** Cuenta todas las generaciones (stat real "brands in registry"). */
export async function countAllGenerations(): Promise<number> {
  await ensureSchema();
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM generations`,
  );
  return Number(rows[0]?.count ?? 0);
}

/** Obtiene una generación por id SIN verificar sesión (vista pública /p/[id]). Aplica gate. */
export async function getPublicGeneration(
  id: string,
  enforcePaywall = false,
): Promise<GenerationRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().query<GenerationRecord & { slug: string | null }>(
    `SELECT g.id, g.session_id AS "sessionId", g.url, g.name, g.design_md AS "designMd",
            g.html, g.screenshot, g.interactions, g.slug, g.created_at AS "createdAt"
     FROM generations g
     LEFT JOIN subscriptions s ON s.session_id = g.session_id
     WHERE g.id = $1 AND ${publishGate(enforcePaywall)}`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Marca una web como publicada. Filtra por session_id: el dueño solo puede publicar lo
 * suyo (nunca una web ajena). Devuelve true si actualizó una fila.
 */
export async function publishGeneration(slug: string, sessionId: string): Promise<boolean> {
  await ensureSchema();
  const { rowCount } = await getPool().query(
    `UPDATE generations SET published = true WHERE slug = $1 AND session_id = $2`,
    [slug, sessionId],
  );
  return (rowCount ?? 0) > 0;
}

/** Devuelve si la web del slug pertenece a la sesión y su estado de publicación. */
export async function getOwnGenerationBySlug(
  slug: string,
  sessionId: string,
): Promise<{ slug: string; published: boolean } | null> {
  await ensureSchema();
  const { rows } = await getPool().query<{ slug: string; published: boolean }>(
    `SELECT slug, published FROM generations WHERE slug = $1 AND session_id = $2 LIMIT 1`,
    [slug, sessionId],
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
