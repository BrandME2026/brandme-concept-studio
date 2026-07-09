import { AsyncLocalStorage } from "node:async_hooks";
import type { Client, PoolClient, QueryResult, QueryResultRow } from "pg";
import { createDirectClient, getPool } from "./client";

/**
 * TenantIsolationLayer (WO-3, blueprint f4fa0000). Todo acceso a datos de la
 * app corre dentro de un contexto explícito:
 *
 *  - withTenant(consultantId, fn): transacción + SET LOCAL app.consultant_id
 *    (pooled) o SET de sesión con limpieza (direct). Las políticas RLS filtran
 *    por ese GUC — cross-tenant es imposible a nivel de base de datos.
 *  - withSystemContext(reason, fn): GUC app.scope='system' para las superficies
 *    públicas enumeradas (galería, /p/[slug], leads anónimos, webhook Stripe,
 *    resolución de tenant). NO es BYPASSRLS: cada tabla declara qué comandos
 *    permite bajo system scope.
 *  - db(): handle ligado al contexto vigente. Sin contexto lanza
 *    TenantContextError ANTES de tocar el socket (la capa API lo mapea a 401).
 *
 * REGLA DURA: un contexto nunca debe abarcar awaits que no sean de DB (p.ej.
 * streaming LLM). El pool tiene max 5 conexiones: mantener una transacción
 * abierta durante una llamada de red externa produce inanición. Abre varios
 * bloques cortos por request en su lugar.
 */

export class TenantContextError extends Error {}
export class TenantMismatchError extends TenantContextError {}

export type ConnectionMode = "pooled" | "direct";

export interface DbHandle {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>>;
}

type TenantCtx = { kind: "tenant"; consultantId: string; client: PoolClient | Client };
type SystemCtx = { kind: "system"; reason: string; client: PoolClient | Client };
type Ctx = TenantCtx | SystemCtx;

const storage = new AsyncLocalStorage<Ctx>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Handle de datos del contexto vigente. Lanza (síncrono al query) sin contexto. */
export function db(): DbHandle {
  return {
    query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
      const ctx = storage.getStore();
      if (!ctx) {
        throw new TenantContextError(
          "Query sin contexto de tenant: envuelve el acceso en withTenant()/withSystemContext()",
        );
      }
      return ctx.client.query<R>(text, params as never);
    },
  };
}

export function currentContext():
  | { kind: "tenant"; consultantId: string }
  | { kind: "system"; reason: string }
  | null {
  const ctx = storage.getStore();
  if (!ctx) return null;
  return ctx.kind === "tenant"
    ? { kind: "tenant", consultantId: ctx.consultantId }
    : { kind: "system", reason: ctx.reason };
}

/** Ejecuta fn con RLS activo para consultantId. */
export function withTenant<T>(
  consultantId: string,
  fn: () => Promise<T>,
  opts: { mode?: ConnectionMode } = {},
): Promise<T> {
  if (!UUID_RE.test(consultantId)) {
    return Promise.reject(
      new TenantContextError(`consultant_id inválido (se esperaba UUID): ${consultantId}`),
    );
  }
  return runInContext(
    (client) => ({ kind: "tenant", consultantId, client }),
    [{ name: "app.consultant_id", value: consultantId }],
    fn,
    opts.mode ?? "pooled",
  );
}

/** Contexto de sistema para superficies públicas enumeradas. reason se exige para auditoría. */
export function withSystemContext<T>(
  reason: string,
  fn: () => Promise<T>,
  opts: { mode?: ConnectionMode } = {},
): Promise<T> {
  if (!reason) {
    return Promise.reject(new TenantContextError("withSystemContext requiere un reason"));
  }
  return runInContext(
    (client) => ({ kind: "system", reason, client }),
    [{ name: "app.scope", value: "system" }],
    fn,
    opts.mode ?? "pooled",
  );
}

type Guc = { name: string; value: string };

async function runInContext<T>(
  makeCtx: (client: PoolClient | Client) => Ctx,
  gucs: Guc[],
  fn: () => Promise<T>,
  mode: ConnectionMode,
): Promise<T> {
  const existing = storage.getStore();
  if (existing) {
    const next = makeCtx(existing.client);
    if (existing.kind !== next.kind) {
      throw new TenantContextError(
        `Contextos no mezclables: ya hay un contexto ${existing.kind} activo`,
      );
    }
    if (
      existing.kind === "tenant" &&
      next.kind === "tenant" &&
      existing.consultantId !== next.consultantId
    ) {
      throw new TenantMismatchError(
        "withTenant anidado con un consultant distinto al del contexto activo",
      );
    }
    // Mismo contexto → reusar cliente/transacción (sin BEGIN anidado).
    return fn();
  }

  if (mode === "pooled") {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      try {
        for (const guc of gucs) {
          // set_config(..., true) = semántica SET LOCAL: el GUC muere con la
          // transacción → cero fuga al devolver la conexión al pool.
          await client.query("SELECT set_config($1, $2, true)", [guc.name, guc.value]);
        }
        const result = await storage.run(makeCtx(client), fn);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    } finally {
      client.release();
    }
  }

  // direct: conexión dedicada fuera del pool (COV_PF_TENANT_001.3 exige validar
  // ambos modos). SET de sesión + limpieza explícita en finally + end().
  const client = createDirectClient();
  await client.connect();
  try {
    for (const guc of gucs) {
      await client.query("SELECT set_config($1, $2, false)", [guc.name, guc.value]);
    }
    return await storage.run(makeCtx(client), fn);
  } finally {
    for (const guc of gucs) {
      await client.query("SELECT set_config($1, '', false)", [guc.name]).catch(() => {});
    }
    await client.end();
  }
}
