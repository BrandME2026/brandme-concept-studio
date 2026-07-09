import { Client } from "pg";
import { runMigrations } from "../scripts/db-migrate";
import { MIGRATIONS_DB_URL } from "./db-urls";

/** Deja la DB de test limpia y migrada antes de levantar la app. Fail fast. */
export default async function globalSetup(): Promise<void> {
  const client = new Client({
    connectionString: MIGRATIONS_DB_URL,
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT USAGE ON SCHEMA public TO brandme_app");
  } catch (err) {
    throw new Error(
      `No hay Postgres de test en ${MIGRATIONS_DB_URL}. Corre "pnpm db:up" primero. Causa: ${(err as Error).message}`,
    );
  } finally {
    await client.end().catch(() => {});
  }
  await runMigrations(MIGRATIONS_DB_URL);
}
