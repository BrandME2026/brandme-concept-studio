import { getPool } from "./client";

/**
 * Leads (interesados) capturados desde las páginas públicas de franquicia. Datos REALES
 * que deja el visitante en el formulario embebido. Enlaza a la generación por slug.
 */
export interface LeadInput {
  slug: string;
  brand: string | null;
  city: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  source: string; // "form" | "agent"
}

export interface LeadRecord {
  id: string;
  slug: string;
  brand: string | null;
  city: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  source: string;
  createdAt: string;
}

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS leads (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug        TEXT NOT NULL,
      brand       TEXT,
      city        TEXT,
      name        TEXT NOT NULL,
      phone       TEXT,
      email       TEXT,
      message     TEXT,
      source      TEXT NOT NULL DEFAULT 'form',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_leads_slug ON leads (slug, created_at DESC);
  `);
  schemaReady = true;
}

/** Guarda un lead capturado en una página pública. Sin sesión (el visitante es anónimo). */
export async function saveLead(input: LeadInput): Promise<{ id: string }> {
  await ensureSchema();
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO leads (slug, brand, city, name, phone, email, message, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      input.slug,
      input.brand,
      input.city,
      input.name,
      input.phone,
      input.email,
      input.message,
      input.source,
    ],
  );
  return { id: rows[0].id };
}

/**
 * Lista los leads de las páginas que pertenecen a una sesión (el consultor). Join con
 * generations por slug + filtro de session_id → cada consultor ve solo SUS interesados.
 */
export async function listLeadsForSession(
  sessionId: string,
  limit = 200,
): Promise<LeadRecord[]> {
  await ensureSchema();
  const { rows } = await getPool().query<LeadRecord>(
    `SELECT l.id, l.slug, l.brand, l.city, l.name, l.phone, l.email, l.message, l.source,
            l.created_at AS "createdAt"
     FROM leads l
     JOIN generations g ON g.slug = l.slug
     WHERE g.session_id = $1
     ORDER BY l.created_at DESC
     LIMIT $2`,
    [sessionId, limit],
  );
  return rows;
}

/** Comprueba que un slug existe (validación antes de aceptar un lead público). */
export async function slugExists(slug: string): Promise<boolean> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT 1 FROM generations WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  return rows.length > 0;
}
