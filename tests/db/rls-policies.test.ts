import { beforeAll, describe, expect, it } from "vitest";
import {
  asSystem,
  asTenant,
  createTenant,
  noContext,
  resetAndMigrate,
  seedTenantData,
  type SeededIds,
  type TenantFixture,
} from "./harness";

/**
 * Matriz núcleo de aislamiento (AC-PF-001.2/.3, AC-PF-002.2, COV_PF_TENANT_001):
 * dos tenants A/B, cada tabla tenant-scoped, en ambos modos de conexión
 * (AC-PF-015.2: pooled con SET LOCAL y direct con SET de sesión).
 */

const TENANT_TABLES = ["conversations", "generations", "leads", "subscriptions"] as const;
const MODES = ["pooled", "direct"] as const;

let A: TenantFixture;
let B: TenantFixture;
let seedB: SeededIds;

beforeAll(async () => {
  await resetAndMigrate();
  A = await createTenant("a");
  B = await createTenant("b");
  await seedTenantData(A, "a");
  seedB = await seedTenantData(B, "b");
});

describe.each(MODES)("aislamiento RLS (modo %s)", (mode) => {
  it.each(TENANT_TABLES)("A ve solo SUS filas en %s (y nada de B)", async (table) => {
    const rows = await asTenant(A, mode, async (h) => {
      const { rows } = await h.query<{ consultant_id: string }>(
        `SELECT consultant_id FROM ${table}`,
      );
      return rows;
    });
    expect(rows, `${table}: A debe tener exactamente 1 fila sembrada`).toHaveLength(1);
    for (const row of rows) expect(row.consultant_id).toBe(A.consultantId);
  });

  it("A no puede leer la conversación de B por id (0 filas, no error)", async () => {
    const rows = await asTenant(A, mode, async (h) => {
      const { rows } = await h.query(`SELECT id FROM conversations WHERE id = $1`, [
        seedB.conversationId,
      ]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("A no puede UPDATE ni DELETE filas de B (rowCount 0)", async () => {
    const { updated, deleted } = await asTenant(A, mode, async (h) => {
      const upd = await h.query(
        `UPDATE generations SET name = 'hacked' WHERE id = $1`,
        [seedB.generationId],
      );
      const del = await h.query(`DELETE FROM conversations WHERE id = $1`, [
        seedB.conversationId,
      ]);
      return { updated: upd.rowCount ?? 0, deleted: del.rowCount ?? 0 };
    });
    expect(updated).toBe(0);
    expect(deleted).toBe(0);
    // La fila de B sigue intacta (verificado con contexto de B).
    const name = await asTenant(B, mode, async (h) => {
      const { rows } = await h.query<{ name: string }>(
        `SELECT name FROM generations WHERE id = $1`,
        [seedB.generationId],
      );
      return rows[0]?.name;
    });
    expect(name).toBe("web de b");
  });

  it("INSERT bajo el contexto de A hereda consultant_id de A (default por GUC)", async () => {
    const inserted = await asTenant(A, mode, async (h) => {
      const { rows } = await h.query<{ id: string; consultant_id: string }>(
        `INSERT INTO conversations (session_id, title) VALUES ($1, 'nueva') RETURNING id, consultant_id`,
        [A.sessionId],
      );
      return rows[0];
    });
    expect(inserted.consultant_id).toBe(A.consultantId);
    // limpiar para no alterar los counts de otros tests del mismo modo
    await asTenant(A, mode, async (h) => {
      await h.query(`DELETE FROM conversations WHERE id = $1`, [inserted.id]);
    });
  });

  it("A no puede insertar filas A NOMBRE de B (WITH CHECK)", async () => {
    await expect(
      asTenant(A, mode, async (h) => {
        await h.query(
          `INSERT INTO conversations (session_id, consultant_id, title) VALUES ($1, $2, 'spoof')`,
          [A.sessionId, B.consultantId],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("system scope ve TODAS las generaciones (galería pública) pero no puede insertarlas", async () => {
    const count = await asSystem("test-galeria", mode, async (h) => {
      const { rows } = await h.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM generations`,
      );
      return Number(rows[0].count);
    });
    expect(count).toBe(2); // la de A y la de B
    await expect(
      asSystem("test-galeria", mode, async (h) => {
        await h.query(
          `INSERT INTO generations (session_id, consultant_id, url, name, design_md, html)
           VALUES ('sx', $1, 'https://x', 'n', 'md', '<html>')`,
          [A.consultantId],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("paridad pooled vs direct (COV_PF_TENANT_001.3)", () => {
  it("los mismos asserts devuelven resultados idénticos en ambos modos", async () => {
    const snapshot = async (mode: (typeof MODES)[number]) => {
      const perTable: Record<string, number> = {};
      for (const table of TENANT_TABLES) {
        perTable[table] = await asTenant(A, mode, async (h) => {
          const { rows } = await h.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM ${table}`,
          );
          return Number(rows[0].count);
        });
      }
      return perTable;
    };
    expect(await snapshot("pooled")).toEqual(await snapshot("direct"));
  });
});

describe("sin contexto (AC-PF-001.4 a nivel de datos)", () => {
  it("el rol de app sin GUC lee CERO filas de toda tabla tenant-scoped", async () => {
    for (const table of TENANT_TABLES) {
      const rows = await noContext(async (c) => {
        const { rows } = await c.query(`SELECT * FROM ${table}`);
        return rows;
      });
      expect(rows, `${table} sin contexto`).toHaveLength(0);
    }
  });

  it("el rol de app sin GUC no puede insertar en tablas tenant-scoped", async () => {
    await expect(
      noContext(async (c) => {
        await c.query(
          `INSERT INTO conversations (session_id, title) VALUES ('sess-evil', 'x')`,
        );
      }),
    ).rejects.toThrow(/row-level security|not-null/i);
  });
});
