import { describe, it, expect } from "vitest";
import { TEST_DATABASE_URL_MIGRATIONS } from "./config";
import { resetDatabase, tableExists, withMigrator } from "./db-util";
import { runMigrations } from "../../scripts/db-migrate";

/**
 * Migraciones versionadas (drizzle/*.sql aplicadas por scripts/db-migrate.ts).
 * 0000 = baseline (SQL exacto de los ensureSchema históricos)
 * 0001 = consultants/consultant_sessions + columnas consultant_id (nullable)
 * 0002 = backfill desde session_id/user_sessions (idempotente, asserts fail-fast)
 * 0003 = SET NOT NULL + RLS (ENABLE+FORCE) + políticas + GRANTs a brandme_app
 */

const BASELINE_TABLES = [
  "conversations",
  "generations",
  "leads",
  "subscriptions",
  "users",
  "user_sessions",
] as const;

const TENANT_TABLES = ["conversations", "generations", "leads", "subscriptions"] as const;

describe("baseline (0000)", () => {
  it("crea el esquema actual sobre una DB vacía", async () => {
    await resetDatabase();
    await runMigrations(TEST_DATABASE_URL_MIGRATIONS, { upTo: "0000" });
    for (const table of BASELINE_TABLES) {
      expect(await tableExists(table), `tabla ${table}`).toBe(true);
    }
  });

  it("el runner es idempotente: la segunda pasada no aplica nada", async () => {
    await resetDatabase();
    const first = await runMigrations(TEST_DATABASE_URL_MIGRATIONS, { upTo: "0000" });
    expect(first.applied.length).toBeGreaterThan(0);
    const second = await runMigrations(TEST_DATABASE_URL_MIGRATIONS, { upTo: "0000" });
    expect(second.applied).toEqual([]);
  });
});

describe("tenants + backfill (0001–0003)", () => {
  /** Fixture legacy: datos como existen HOY en prod (solo session_id, sin consultants). */
  async function seedLegacyAndMigrate() {
    await resetDatabase();
    await runMigrations(TEST_DATABASE_URL_MIGRATIONS, { upTo: "0000" });
    await withMigrator(async (c) => {
      // Un user Firebase con DOS sesiones (debe colapsar a UN consultant)
      await c.query(`INSERT INTO users (id, email) VALUES ('uid-1', 'a@x.com')`);
      await c.query(
        `INSERT INTO user_sessions (session_id, user_id) VALUES ('sess-a','uid-1'), ('sess-b','uid-1')`,
      );
      // Una sesión huérfana (sin login) → consultant propio
      await c.query(
        `INSERT INTO conversations (session_id, title) VALUES ('sess-a','ca'), ('sess-b','cb'), ('sess-c','cc')`,
      );
      await c.query(
        `INSERT INTO generations (session_id, url, name, design_md, html, slug) VALUES
           ('sess-a','https://a','A','md','<html>','brand-a'),
           ('sess-c','https://c','C','md','<html>','brand-c')`,
      );
      await c.query(
        `INSERT INTO subscriptions (session_id, stripe_customer_id) VALUES ('sess-a','cus_1')`,
      );
      // Leads enlazan por slug (visitante anónimo, sin sesión propia)
      await c.query(
        `INSERT INTO leads (slug, name) VALUES ('brand-a','Lead A'), ('brand-c','Lead C')`,
      );
    });
    await runMigrations(TEST_DATABASE_URL_MIGRATIONS);
  }

  it("dos sesiones del mismo user colapsan a un consultant; huérfanas tienen el suyo", async () => {
    await seedLegacyAndMigrate();
    await withMigrator(async (c) => {
      const { rows: mapping } = await c.query<{ session_id: string; consultant_id: string }>(
        `SELECT session_id, consultant_id FROM consultant_sessions ORDER BY session_id`,
      );
      const byId = Object.fromEntries(mapping.map((m) => [m.session_id, m.consultant_id]));
      expect(Object.keys(byId).sort()).toEqual(["sess-a", "sess-b", "sess-c"]);
      expect(byId["sess-a"]).toBe(byId["sess-b"]);
      expect(byId["sess-c"]).not.toBe(byId["sess-a"]);

      const { rows: consultants } = await c.query<{ id: string; firebase_uid: string | null }>(
        `SELECT id, firebase_uid FROM consultants`,
      );
      expect(consultants).toHaveLength(2);
      const ofUser = consultants.find((r) => r.firebase_uid === "uid-1");
      expect(ofUser?.id).toBe(byId["sess-a"]);
      const orphan = consultants.find((r) => r.firebase_uid === null);
      expect(orphan?.id).toBe(byId["sess-c"]);
    });
  });

  it("backfillea consultant_id en cada tabla tenant-scoped (leads vía slug)", async () => {
    await seedLegacyAndMigrate();
    await withMigrator(async (c) => {
      const consultantOf = async (session: string) => {
        const { rows } = await c.query<{ consultant_id: string }>(
          `SELECT consultant_id FROM consultant_sessions WHERE session_id = $1`,
          [session],
        );
        return rows[0].consultant_id;
      };
      const [ca, cc] = [await consultantOf("sess-a"), await consultantOf("sess-c")];

      const { rows: convs } = await c.query<{ session_id: string; consultant_id: string }>(
        `SELECT session_id, consultant_id FROM conversations`,
      );
      expect(convs, "el migrator (BYPASSRLS) debe ver todas las filas").toHaveLength(3);
      for (const row of convs) {
        expect(row.consultant_id).toBe(await consultantOf(row.session_id));
      }

      const { rows: leads } = await c.query<{ slug: string; consultant_id: string }>(
        `SELECT slug, consultant_id FROM leads ORDER BY slug`,
      );
      expect(leads).toEqual([
        { slug: "brand-a", consultant_id: ca },
        { slug: "brand-c", consultant_id: cc },
      ]);

      const { rows: subs } = await c.query<{ consultant_id: string }>(
        `SELECT consultant_id FROM subscriptions WHERE session_id = 'sess-a'`,
      );
      expect(subs[0].consultant_id).toBe(ca);
    });
  });

  it("deja consultant_id NOT NULL y RLS ENABLE+FORCE con política tenant en las 4 tablas", async () => {
    await seedLegacyAndMigrate();
    await withMigrator(async (c) => {
      for (const table of TENANT_TABLES) {
        const { rows: cols } = await c.query<{ is_nullable: string }>(
          `SELECT is_nullable FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'consultant_id'`,
          [table],
        );
        expect(cols[0]?.is_nullable, `${table}.consultant_id NOT NULL`).toBe("NO");

        const { rows: rls } = await c.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
          `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
           WHERE oid = ('public.' || $1)::regclass`,
          [table],
        );
        expect(rls[0].relrowsecurity, `${table} RLS enabled`).toBe(true);
        expect(rls[0].relforcerowsecurity, `${table} RLS forced (aplica al owner)`).toBe(true);

        const { rows: policies } = await c.query<{ policyname: string }>(
          `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = $1`,
          [table],
        );
        expect(policies.map((p) => p.policyname), `${table} políticas`).toContain("tenant_all");
      }
    });
  });

  it("las migraciones completas son idempotentes (re-run aplica 0)", async () => {
    await seedLegacyAndMigrate();
    const again = await runMigrations(TEST_DATABASE_URL_MIGRATIONS);
    expect(again.applied).toEqual([]);
  });
});
