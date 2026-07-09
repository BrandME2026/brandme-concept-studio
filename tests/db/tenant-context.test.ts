import { beforeAll, describe, expect, it } from "vitest";
import {
  asTenant,
  createTenant,
  resetAndMigrate,
  type TenantFixture,
} from "./harness";
import { getPool } from "../../src/lib/db/client";
import {
  db,
  withSystemContext,
  withTenant,
  TenantContextError,
  TenantMismatchError,
} from "../../src/lib/db/tenant-context";
import { withMigrator } from "./db-util";

/**
 * Comportamiento del contexto (blueprint TenantIsolationLayer): limpieza del
 * GUC en el pool, rollback, anidamiento, rechazo sin contexto y concurrencia.
 */

let A: TenantFixture;
let B: TenantFixture;

beforeAll(async () => {
  await resetAndMigrate();
  A = await createTenant("ctx-a");
  B = await createTenant("ctx-b");
});

describe("rechazo sin contexto", () => {
  it("db() lanza TenantContextError antes de tocar la base", async () => {
    expect(() => db().query("SELECT 1")).toThrow(TenantContextError);
  });

  it("withTenant valida que el consultant_id sea UUID (fail fast)", async () => {
    await expect(withTenant("nope; DROP TABLE", async () => {})).rejects.toThrow(
      TenantContextError,
    );
  });

  it("withSystemContext exige un reason", async () => {
    await expect(withSystemContext("", async () => {})).rejects.toThrow(TenantContextError);
  });
});

describe("transacciones y limpieza (pooled)", () => {
  it("hace ROLLBACK si fn lanza: nada persiste", async () => {
    await expect(
      withTenant(A.consultantId, async () => {
        await db().query(
          `INSERT INTO conversations (session_id, title) VALUES ($1, 'se-revierte')`,
          [A.sessionId],
        );
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const persisted = await withMigrator(async (c) => {
      const { rows } = await c.query(`SELECT 1 FROM conversations WHERE title = 'se-revierte'`);
      return rows.length;
    });
    expect(persisted).toBe(0);
  });

  it("no deja el GUC pegado en NINGUNA conexión del pool (drena los 5 slots)", async () => {
    // Usar el contexto varias veces para tocar distintas conexiones del pool.
    for (let i = 0; i < 10; i++) {
      await asTenant(i % 2 ? A : B, "pooled", async (h) => {
        await h.query("SELECT 1");
      });
    }
    const pool = getPool();
    const clients = await Promise.all(Array.from({ length: 5 }, () => pool.connect()));
    try {
      for (const client of clients) {
        const { rows } = await client.query<{ guc: string | null }>(
          `SELECT current_setting('app.consultant_id', true) AS guc`,
        );
        expect(rows[0].guc ?? "").toBe("");
      }
    } finally {
      for (const client of clients) client.release();
    }
  });
});

describe("anidamiento", () => {
  it("mismo tenant anidado reusa la transacción (un solo BEGIN)", async () => {
    const txids = await withTenant(A.consultantId, async () => {
      const outer = await db().query<{ txid: string }>(
        `SELECT txid_current()::text AS txid`,
      );
      const inner = await withTenant(A.consultantId, async () => {
        const { rows } = await db().query<{ txid: string }>(
          `SELECT txid_current()::text AS txid`,
        );
        return rows[0].txid;
      });
      return { outer: outer.rows[0].txid, inner };
    });
    expect(txids.inner).toBe(txids.outer);
  });

  it("tenant distinto anidado lanza TenantMismatchError", async () => {
    await expect(
      withTenant(A.consultantId, async () => {
        await withTenant(B.consultantId, async () => {});
      }),
    ).rejects.toThrow(TenantMismatchError);
  });

  it("system dentro de tenant (y viceversa) lanza", async () => {
    await expect(
      withTenant(A.consultantId, async () => {
        await withSystemContext("mezcla", async () => {});
      }),
    ).rejects.toThrow(TenantContextError);
    await expect(
      withSystemContext("mezcla", async () => {
        await withTenant(A.consultantId, async () => {});
      }),
    ).rejects.toThrow(TenantContextError);
  });
});

describe("concurrencia sobre pool max 5", () => {
  it("25 contextos concurrentes con tenants distintos no se contaminan", async () => {
    const tenants = await Promise.all(
      Array.from({ length: 25 }, (_, i) => createTenant(`conc-${i}`)),
    );
    const results = await Promise.all(
      tenants.map((t) =>
        withTenant(t.consultantId, async () => {
          const { rows } = await db().query<{ guc: string }>(
            `SELECT current_setting('app.consultant_id', true) AS guc`,
          );
          await db().query(
            `INSERT INTO conversations (session_id, title) VALUES ($1, 'conc')`,
            [t.sessionId],
          );
          const { rows: mine } = await db().query<{ count: string }>(
            `SELECT count(*)::text AS count FROM conversations`,
          );
          return { guc: rows[0].guc, ownRows: Number(mine[0].count), expected: t.consultantId };
        }),
      ),
    );
    for (const r of results) {
      expect(r.guc).toBe(r.expected);
      expect(r.ownRows).toBe(1); // cada tenant ve SOLO su propia fila
    }
  });
});

describe("modo direct", () => {
  it("funciona end-to-end y el GUC no sobrevive fuera del contexto", async () => {
    const guc = await withTenant(
      A.consultantId,
      async () => {
        const { rows } = await db().query<{ guc: string }>(
          `SELECT current_setting('app.consultant_id', true) AS guc`,
        );
        return rows[0].guc;
      },
      { mode: "direct" },
    );
    expect(guc).toBe(A.consultantId);
  });
});
