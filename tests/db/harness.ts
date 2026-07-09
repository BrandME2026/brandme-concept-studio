import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { TEST_DATABASE_URL, TEST_DATABASE_URL_MIGRATIONS } from "./config";
import { resetDatabase, withMigrator } from "./db-util";
import { runMigrations } from "../../scripts/db-migrate";

/**
 * Test harness del TenantIsolationLayer (entry point exigido por el blueprint):
 * simula tenants arbitrarios SIN credenciales vivas. Los tests corren la capa
 * real (withTenant/db()) apuntando la app al Postgres Docker con el ROL DE APP
 * (brandme_app, sin BYPASSRLS); las fixtures se siembran con el rol migrator.
 */

// La capa de app (src/lib/db/*) lee DATABASE_URL. Apuntarla a la DB de test
// ANTES de que cualquier import cree el pool (getPool es lazy, esto basta).
process.env.DATABASE_URL = TEST_DATABASE_URL;

import { db, withSystemContext, withTenant, type ConnectionMode, type DbHandle } from "../../src/lib/db/tenant-context";

export interface TenantFixture {
  consultantId: string;
  sessionId: string;
}

/** Recrea la DB desde cero y aplica todas las migraciones. */
export async function resetAndMigrate(): Promise<void> {
  await resetDatabase();
  await runMigrations(TEST_DATABASE_URL_MIGRATIONS);
}

/** Crea un tenant simulado (consultant + sesión mapeada), vía migrator. */
export async function createTenant(label = "t"): Promise<TenantFixture> {
  const sessionId = `sess-${label}-${randomUUID().slice(0, 8)}`;
  return withMigrator(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO consultants (firebase_uid) VALUES (NULL) RETURNING id`,
    );
    const consultantId = rows[0].id;
    await c.query(
      `INSERT INTO consultant_sessions (session_id, consultant_id) VALUES ($1, $2)`,
      [sessionId, consultantId],
    );
    return { consultantId, sessionId };
  });
}

export interface SeededIds {
  conversationId: string;
  generationId: string;
  slug: string;
  leadId: string;
}

/** Siembra un juego de datos completo (1 fila por tabla tenant-scoped) para un tenant. */
export async function seedTenantData(t: TenantFixture, label = "seed"): Promise<SeededIds> {
  const slug = `${label}-${randomUUID().slice(0, 8)}`;
  return withMigrator(async (c) => {
    const conv = await c.query<{ id: string }>(
      `INSERT INTO conversations (session_id, consultant_id, title)
       VALUES ($1, $2, $3) RETURNING id`,
      [t.sessionId, t.consultantId, `conv de ${label}`],
    );
    const gen = await c.query<{ id: string }>(
      `INSERT INTO generations (session_id, consultant_id, url, name, design_md, html, slug, brand, city, published)
       VALUES ($1, $2, 'https://x', $3, 'md', '<html>', $4, $5, 'CDMX', true) RETURNING id`,
      [t.sessionId, t.consultantId, `web de ${label}`, slug, `Brand-${label}`],
    );
    const lead = await c.query<{ id: string }>(
      `INSERT INTO leads (slug, consultant_id, name, source)
       VALUES ($1, $2, $3, 'form') RETURNING id`,
      [slug, t.consultantId, `lead de ${label}`],
    );
    await c.query(
      `INSERT INTO subscriptions (session_id, consultant_id, stripe_customer_id, status)
       VALUES ($1, $2, $3, 'active')`,
      [t.sessionId, t.consultantId, `cus_${slug}`],
    );
    return {
      conversationId: conv.rows[0].id,
      generationId: gen.rows[0].id,
      slug,
      leadId: lead.rows[0].id,
    };
  });
}

/** Ejecuta fn con el contexto RLS del tenant, en el modo de conexión indicado. */
export function asTenant<T>(
  t: TenantFixture,
  mode: ConnectionMode,
  fn: (handle: DbHandle) => Promise<T>,
): Promise<T> {
  return withTenant(t.consultantId, () => fn(db()), { mode });
}

/** Ejecuta fn bajo system scope (superficies públicas). */
export function asSystem<T>(
  reason: string,
  mode: ConnectionMode,
  fn: (handle: DbHandle) => Promise<T>,
): Promise<T> {
  return withSystemContext(reason, () => fn(db()), { mode });
}

/**
 * Cliente con el ROL DE APP pero SIN contexto (sin GUC): simula código que
 * llegara a la DB saltándose withTenant. RLS debe devolver cero filas y
 * rechazar writes.
 */
export async function noContext<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
