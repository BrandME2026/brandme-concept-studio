import { Client } from "pg";
import { TEST_DATABASE_URL_MIGRATIONS } from "./config";

/** Ejecuta fn con una conexión del rol migrator (owner, exento de contexto tenant). */
export async function withMigrator<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: TEST_DATABASE_URL_MIGRATIONS });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Deja la DB de test vacía: recrea el schema public (owner: brandme_migrator)
 * y restaura el USAGE del rol de app. Los GRANTs de tablas los ponen las migraciones.
 */
export async function resetDatabase(): Promise<void> {
  await withMigrator(async (client) => {
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT USAGE ON SCHEMA public TO brandme_app");
  });
}

/** true si la tabla existe en el schema public. */
export async function tableExists(table: string): Promise<boolean> {
  return withMigrator(async (client) => {
    const { rows } = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.' || $1) IS NOT NULL AS exists",
      [table],
    );
    return rows[0].exists;
  });
}
