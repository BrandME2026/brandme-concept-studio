import { db } from "./tenant-context";
import { normalizeKey } from "@/lib/seo/slug";

/**
 * Generaciones (webs publicables). Lecturas del consultor van tenant-scoped vía
 * RLS (withTenant); las superficies públicas (galería, /p/[slug], sitemap) usan
 * withSystemContext y mantienen el publishGate en SQL — el gate de pago NO se
 * codifica en políticas RLS (ver drizzle/0003_rls.sql).
 */

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

/**
 * Reserva un slug único para `base`, añadiendo -2, -3… si ya existe. La unicidad
 * es GLOBAL entre tenants: úsalo bajo withSystemContext (bajo tenant solo verías
 * tus propios slugs). El índice único idx_generations_slug es la red final ante
 * un race.
 */
export async function uniqueSlug(base: string): Promise<string> {
  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const { rows } = await db().query(`SELECT 1 FROM generations WHERE slug = $1 LIMIT 1`, [
      candidate,
    ]);
    if (rows.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

/**
 * Guarda una generación (bajo withTenant; consultant_id lo pone el GUC).
 * `slug` debe venir YA único — resuélvelo antes con uniqueSlug() bajo system scope.
 */
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
  const { rows } = await db().query<{ id: string }>(
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
      input.slug ?? null,
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
  return { id: rows[0].id, slug: input.slug ?? null };
}

/** Lista las generaciones del tenant del contexto (sin el HTML pesado). */
export async function listGenerations(limit = 50): Promise<GenerationListItem[]> {
  const { rows } = await db().query<GenerationListItem>(
    `SELECT id, url, name, screenshot, created_at AS "createdAt"
     FROM generations
     ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

/**
 * Galería pública (usar bajo withSystemContext). Solo webs ACTIVAS (publicadas +
 * dueño con suscripción, o legacy) cuando se aplica el paywall.
 */
export async function listAllGenerations(
  limit = 60,
  enforcePaywall = false,
): Promise<GenerationListItem[]> {
  const { rows } = await db().query<GenerationListItem>(
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
 * Cláusula del gate de publicación para queries públicas. Una web se sirve si
 * está `published` y, cuando se aplica el paywall, su dueño tiene suscripción
 * activa O nunca pasó por subscriptions (legacy público). `g` y `s` son los
 * alias de generations y del LEFT JOIN subscriptions.
 */
function publishGate(enforce: boolean, g = "g", s = "s"): string {
  if (!enforce) return `${g}.published = true`;
  return `${g}.published = true AND (
    ${s}.session_id IS NULL
    OR (${s}.status IN ('active','trialing')
        AND (${s}.current_period_end IS NULL OR ${s}.current_period_end > now()))
  )`;
}

/** Página pública por SLUG para /p/[slug] (usar bajo withSystemContext). */
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
  const { rows } = await db().query<{
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
 * Busca una generación existente del MISMO consultor por marca (+ ciudad).
 * Anti-duplicado POR TENANT (RLS limita al contexto): un consultor no regenera
 * su propia marca+ciudad, pero consultores distintos SÍ pueden tener cada uno la
 * suya. Comparación con normalizeKey (sin acentos ni puntuación); el filtrado se
 * hace en memoria (volumen por tenant es bajo).
 */
export async function findGenerationByBrandCity(
  brand: string,
  city: string | null,
): Promise<{ id: string; slug: string | null } | null> {
  const bKey = normalizeKey(brand);
  if (!bKey) return null;
  const cKey = normalizeKey(city);
  const { rows } = await db().query<{
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

/** Cuenta todas las generaciones (stat público "brands in registry"; bajo withSystemContext). */
export async function countAllGenerations(): Promise<number> {
  const { rows } = await db().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM generations`,
  );
  return Number(rows[0]?.count ?? 0);
}

/** Generación por id para la vista pública /p/[id] (bajo withSystemContext). Aplica gate. */
export async function getPublicGeneration(
  id: string,
  enforcePaywall = false,
): Promise<GenerationRecord | null> {
  const { rows } = await db().query<GenerationRecord & { slug: string | null }>(
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
 * Marca una web como publicada. RLS garantiza que el tenant solo publica lo
 * suyo. Devuelve true si actualizó una fila.
 */
export async function publishGeneration(slug: string): Promise<boolean> {
  const { rowCount } = await db().query(
    `UPDATE generations SET published = true WHERE slug = $1`,
    [slug],
  );
  return (rowCount ?? 0) > 0;
}

/** Devuelve si la web del slug pertenece al tenant y su estado de publicación. */
export async function getOwnGenerationBySlug(
  slug: string,
): Promise<{ slug: string; published: boolean } | null> {
  const { rows } = await db().query<{ slug: string; published: boolean }>(
    `SELECT slug, published FROM generations WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  return rows[0] ?? null;
}

/** Obtiene una generación completa del tenant del contexto. */
export async function getGeneration(id: string): Promise<GenerationRecord | null> {
  const { rows } = await db().query<GenerationRecord>(
    `SELECT id, session_id AS "sessionId", url, name, design_md AS "designMd",
            html, screenshot, interactions, created_at AS "createdAt"
     FROM generations WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}
