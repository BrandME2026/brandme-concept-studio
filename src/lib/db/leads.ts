import { randomUUID } from "node:crypto";
import { db } from "./tenant-context";

/**
 * Leads (interesados) capturados desde las páginas públicas de franquicia. Datos
 * REALES que deja el visitante en el formulario embebido. El visitante es
 * anónimo: saveLead corre bajo withSystemContext y asigna el lead al consultant
 * dueño de la página (lookup por slug). La lectura es tenant-scoped vía RLS.
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

/**
 * Guarda un lead capturado en una página pública (usar bajo withSystemContext).
 * El consultant_id sale del dueño del slug; slug sin generación = error (fail fast,
 * un lead sin dueño sería dato huérfano invisible para todos).
 */
export async function saveLead(input: LeadInput): Promise<{ id: string }> {
  const owner = await db().query<{ consultant_id: string }>(
    `SELECT consultant_id FROM generations WHERE slug = $1 LIMIT 1`,
    [input.slug],
  );
  const consultantId = owner.rows[0]?.consultant_id;
  if (!consultantId) {
    throw new Error(`saveLead: el slug "${input.slug}" no tiene generación dueña`);
  }
  // Sin RETURNING: la fila nueva no es VISIBLE bajo system scope (no hay
  // system_select en leads, a propósito — mínima superficie) y RETURNING
  // exige visibilidad SELECT. El id se genera en la app.
  const id = randomUUID();
  await db().query(
    `INSERT INTO leads (id, slug, consultant_id, brand, city, name, phone, email, message, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      input.slug,
      consultantId,
      input.brand,
      input.city,
      input.name,
      input.phone,
      input.email,
      input.message,
      input.source,
    ],
  );
  return { id };
}

/** Lista los leads del consultor del contexto. RLS filtra; ya no hace falta el join. */
export async function listLeadsForConsultant(limit = 200): Promise<LeadRecord[]> {
  const { rows } = await db().query<LeadRecord>(
    `SELECT id, slug, brand, city, name, phone, email, message, source,
            created_at AS "createdAt"
     FROM leads
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

/** Comprueba que un slug existe (validación pública; usar bajo withSystemContext). */
export async function slugExists(slug: string): Promise<boolean> {
  const { rows } = await db().query(`SELECT 1 FROM generations WHERE slug = $1 LIMIT 1`, [slug]);
  return rows.length > 0;
}
