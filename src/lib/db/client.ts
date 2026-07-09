import { Client, Pool } from "pg";

/**
 * Conexiones Postgres. El pool es interno a la capa de datos: el acceso de la
 * app pasa SIEMPRE por el contexto de tenant (src/lib/db/tenant-context.ts),
 * nunca por el pool crudo. DATABASE_URL la inyecta Railway en prod; en local
 * apunta al Docker de docker-compose.yml.
 */

type SslConfig = false | { ca?: string; rejectUnauthorized: boolean } | undefined;

function buildConfig(connectionString: string): { connectionString: string; ssl: SslConfig } {
  const host = (() => {
    try {
      return new URL(connectionString).hostname;
    } catch {
      return "";
    }
  })();
  const isLocal = host === "localhost" || host === "127.0.0.1";
  // La red privada de Railway (*.railway.internal) no sale a internet → sin
  // superficie MITM; ahí Railway usa certs autofirmados. Para cualquier otro
  // host exigimos verificación TLS real (CA del sistema o DATABASE_CA_CERT);
  // así no deshabilitamos TLS en conexiones públicas.
  const isRailwayInternal = host.endsWith(".railway.internal");
  const ca = process.env.DATABASE_CA_CERT;

  let ssl: SslConfig;
  if (isLocal) ssl = undefined;
  else if (ca) ssl = { ca, rejectUnauthorized: true };
  else if (isRailwayInternal) ssl = { rejectUnauthorized: false };
  else ssl = { rejectUnauthorized: true }; // host público → verificar con CA del sistema

  return { connectionString, ssl };
}

let pool: Pool | null = null;

/**
 * @internal Pool crudo — SOLO para tenant-context.ts y el drain de la test
 * suite. El código de la app usa db() dentro de withTenant()/withSystemContext().
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL no configurada");
    }
    pool = new Pool({ ...buildConfig(connectionString), max: 5 });
  }
  return pool;
}

/**
 * @internal Conexión directa (fuera del pool) para withTenant({mode:"direct"}).
 * El caller es responsable de end().
 */
export function createDirectClient(): Client {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no configurada");
  }
  return new Client(buildConfig(connectionString));
}

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
