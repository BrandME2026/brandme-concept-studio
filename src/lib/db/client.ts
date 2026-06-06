import { Pool } from "pg";

/**
 * Pool de conexiones Postgres (Railway). Singleton para reusar entre invocaciones
 * en el runtime de Node. DATABASE_URL la inyecta Railway como referencia al servicio.
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL no configurada");
    }
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

    let ssl: false | { ca?: string; rejectUnauthorized: boolean } | undefined;
    if (isLocal) ssl = undefined;
    else if (ca) ssl = { ca, rejectUnauthorized: true };
    else if (isRailwayInternal) ssl = { rejectUnauthorized: false };
    else ssl = { rejectUnauthorized: true }; // host público → verificar con CA del sistema

    pool = new Pool({ connectionString, ssl, max: 5 });
  }
  return pool;
}

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
