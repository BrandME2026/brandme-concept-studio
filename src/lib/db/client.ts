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
    // En Railway usamos la URL PRIVADA (DATABASE_URL apunta a la red interna
    // *.railway.internal, no expuesta a internet → sin riesgo de MITM). Para esa
    // red Railway emite certs autofirmados; si se provee un CA, se verifica.
    const isLocal =
      connectionString.includes("localhost") ||
      connectionString.includes("127.0.0.1");
    const ca = process.env.DATABASE_CA_CERT;
    pool = new Pool({
      connectionString,
      ssl: isLocal
        ? undefined
        : ca
          ? { ca, rejectUnauthorized: true }
          : { rejectUnauthorized: false }, // red privada Railway (sin CA público)
      max: 5,
    });
  }
  return pool;
}

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
