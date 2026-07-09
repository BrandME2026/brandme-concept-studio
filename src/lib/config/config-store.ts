import { isDbConfigured } from "@/lib/db/client";
import { db, withSystemContext } from "@/lib/db/tenant-context";

/**
 * ConfigStore (WO-7, EP-07): read path canónico de la configuración runtime.
 * Ningún código de la app lee valores EP-07 de constantes o env — todo pasa por
 * aquí. Lee platform_config (current_value ?? default_value ?? fallback) con
 * cache local de 60s: un guardado del admin aplica en <60s sin deploy
 * (REQ-PF-020.3). Los SECRETS nunca viven aquí (env/secret storage).
 *
 * Degradación deliberada: sin DATABASE_URL o ante error de lectura devuelve el
 * fallback (los fallbacks son los defaults de producción) y loggea — un fallo
 * de config no debe tumbar superficies públicas. El write path admin es Build 6;
 * invalidateConfigCache() queda como hook para ese momento y para tests.
 */

// 60s por contrato EP-07; override SOLO para tests/e2e (no es un valor EP-07,
// es infraestructura de la cache).
function ttlMs(): number {
  const n = Number(process.env.CONFIG_CACHE_TTL_MS);
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

interface CacheEntry {
  value: unknown; // undefined = miss confirmado (fila inexistente)
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Vacía la cache local. Hook del write path admin (Build 6) y de tests. */
export function invalidateConfigCache(): void {
  cache.clear();
}

async function readRaw(featureArea: string, configKey: string): Promise<unknown> {
  const cacheKey = `${featureArea}.${configKey}`;
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.value;

  let value: unknown = undefined;
  try {
    value = await withSystemContext("config-store", async () => {
      const { rows } = await db().query<{ value: unknown }>(
        `SELECT COALESCE(current_value, default_value) AS value
         FROM platform_config
         WHERE feature_area = $1 AND config_key = $2`,
        [featureArea, configKey],
      );
      return rows.length ? rows[0].value : undefined;
    });
  } catch (err) {
    console.error(`[config-store] fallo leyendo ${cacheKey}; usando fallback`, err);
    return undefined; // sin cachear el error: el próximo intento reintenta
  }
  cache.set(cacheKey, { value, expiresAt: now + ttlMs() });
  return value;
}

/** Valor crudo (jsonb) o fallback si no hay fila/DB. */
export async function getConfigValue<T>(
  featureArea: string,
  configKey: string,
  fallback: T,
): Promise<T> {
  if (!isDbConfigured()) return fallback;
  const value = await readRaw(featureArea, configKey);
  return value === undefined || value === null ? fallback : (value as T);
}

/** Número EP-07 (caps, ventanas, topes). Tipo inválido → fallback + warn. */
export async function getConfigNumber(
  featureArea: string,
  configKey: string,
  fallback: number,
): Promise<number> {
  const value = await getConfigValue<unknown>(featureArea, configKey, fallback);
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    console.warn(
      `[config-store] ${featureArea}.${configKey} no es número (${JSON.stringify(value)}); usando fallback ${fallback}`,
    );
    return fallback;
  }
  return n;
}

/** String EP-07 (aliases de modelo, identificadores). Tipo inválido → fallback + warn. */
export async function getConfigString(
  featureArea: string,
  configKey: string,
  fallback: string,
): Promise<string> {
  const value = await getConfigValue<unknown>(featureArea, configKey, fallback);
  if (typeof value !== "string" || value.length === 0) {
    console.warn(
      `[config-store] ${featureArea}.${configKey} no es string (${JSON.stringify(value)}); usando fallback`,
    );
    return fallback;
  }
  return value;
}
