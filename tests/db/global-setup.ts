import { Client } from "pg";
import { TEST_DATABASE_URL_MIGRATIONS } from "./config";

/**
 * Gate del proyecto vitest "db": exige un Postgres de test vivo. Fail fast con
 * mensaje accionable — nunca skip silencioso (regla: no ocultar fallos).
 */
export default async function globalSetup(): Promise<void> {
  const client = new Client({
    connectionString: TEST_DATABASE_URL_MIGRATIONS,
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
  } catch (err) {
    throw new Error(
      `No hay Postgres de test accesible en ${TEST_DATABASE_URL_MIGRATIONS}.\n` +
        `Levántalo con "pnpm db:up" y reintenta. Causa: ${(err as Error).message}`,
    );
  } finally {
    await client.end().catch(() => {});
  }
}
