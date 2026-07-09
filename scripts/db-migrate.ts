import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

/**
 * Runner de migraciones versionadas: aplica drizzle/*.sql en orden lexicográfico,
 * cada una en su transacción, y registra las aplicadas en `_migrations`.
 *
 * Corre SIEMPRE con el rol migrator (owner, DDL) — nunca con el rol de app.
 * Decisión deliberada (WO-3): runner propio determinista en vez del journal de
 * drizzle-kit, porque el baseline debe aplicar limpio sobre la DB de Railway ya
 * existente (todo el SQL es idempotente con IF NOT EXISTS). drizzle-kit queda
 * configurado (drizzle.config.ts + src/lib/db/schema.ts) para generar futuras
 * migraciones por diff; los .sql generados se aplican con este mismo runner.
 */

// Relativo al cwd (raíz del repo en los tres consumidores: pnpm db:migrate,
// vitest y playwright). Sin import.meta/__dirname: el archivo debe cargar igual
// como ESM (vitest/tsx) y como CJS (transform de Playwright).
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? join(process.cwd(), "drizzle");

export interface MigrateResult {
  applied: string[];
}

export function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
}

export async function runMigrations(
  connectionString: string,
  opts: { upTo?: string } = {},
): Promise<MigrateResult> {
  const files = listMigrationFiles().filter(
    (f) => !opts.upTo || f.slice(0, 4) <= opts.upTo,
  );
  const client = new Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    // Exclusión entre runners concurrentes (deploys solapados): el lock vive
    // hasta el final de la sesión; el segundo proceso espera y al despertar ve
    // las migraciones ya registradas.
    await client.query(`SELECT pg_advisory_lock(hashtext('brandme_migrations'))`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS _migrations (
         name       TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<{ name: string }>(`SELECT name FROM _migrations`);
    const done = new Set(rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO _migrations (name) VALUES ($1)`, [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migración ${file} falló (rollback aplicado): ${(err as Error).message}`);
      }
      applied.push(file);
    }
  } finally {
    await client.end();
  }
  return { applied };
}

// CLI: pnpm db:migrate — exige DATABASE_URL_MIGRATIONS explícita, sin fallback
// silencioso a DATABASE_URL (el rol de app no tiene DDL y no debe intentarlo).
// Detección de CLI sin import.meta: en ESM (vitest) el typeof corta antes de
// evaluar require/module; en CJS (tsx CLI) funciona como require.main clásico.
const isCli =
  typeof require !== "undefined" && typeof module !== "undefined" && require.main === module;

if (isCli) {
  const url = process.env.DATABASE_URL_MIGRATIONS;
  if (!url) {
    console.error(
      "DATABASE_URL_MIGRATIONS no configurada. Para el Docker local:\n" +
        '  DATABASE_URL_MIGRATIONS="postgres://brandme_migrator:migrator@localhost:54329/brandme" pnpm db:migrate',
    );
    process.exit(1);
  }
  runMigrations(url)
    .then(({ applied }) => {
      console.log(
        applied.length
          ? `Aplicadas ${applied.length} migraciones:\n  ${applied.join("\n  ")}`
          : "Sin migraciones pendientes.",
      );
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
