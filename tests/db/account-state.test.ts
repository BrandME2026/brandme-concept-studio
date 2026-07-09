import { beforeAll, describe, expect, it } from "vitest";
import { resetAndMigrate, createTenant, asSystem } from "./harness";
import { withMigrator } from "./db-util";
import {
  createPendingConsultant,
  getAccountState,
  signalAccountState,
} from "../../src/lib/auth/account-state-machine";

/**
 * WO-5 / COV_PF_AUTH_002.2: AccountStateMachine contra la DB REAL. La máquina es
 * el ÚNICO escritor de consultants.account_state (trigger a nivel BD) y los
 * milestones de onboarding_sessions son write-once.
 */

beforeAll(async () => {
  await resetAndMigrate();
});

/** Lectura del estado bajo system scope (getAccountState usa el db() ambiental). */
function readState(consultantId: string) {
  return asSystem("test-read-state", "pooled", () => getAccountState(consultantId));
}

async function onboardingRow(consultantId: string) {
  const { rows } = await withMigrator((c) =>
    c.query<{
      stage1_submitted_at: Date | null;
      stage2_password_set_at: Date | null;
      checkout_completed_at: Date | null;
    }>(
      `SELECT stage1_submitted_at, stage2_password_set_at, checkout_completed_at
       FROM onboarding_sessions WHERE consultant_id = $1`,
      [consultantId],
    ),
  );
  return rows[0] ?? null;
}

describe("estados base", () => {
  it("un consultant nuevo (flujo anónimo actual) nace 'active'", async () => {
    const t = await createTenant("estado-default");
    expect(await readState(t.consultantId)).toBe("active");
  });

  it("createPendingConsultant crea 'pending' con el milestone de Stage 1", async () => {
    const id = await asSystem("test-stage1", "pooled", () => createPendingConsultant());
    expect(await readState(id)).toBe("pending");
    const ob = await onboardingRow(id);
    expect(ob?.stage1_submitted_at).toBeInstanceOf(Date);
    expect(ob?.stage2_password_set_at).toBeNull();
  });

  it("consultant inexistente → not_found sin lanzar", async () => {
    const r = await asSystem("test-notfound", "pooled", () =>
      signalAccountState("00000000-0000-4000-8000-000000000000", "password_set"),
    );
    expect(r).toMatchObject({ applied: false, reason: "not_found" });
  });
});

describe("el camino permitido completo (AC del WO)", () => {
  it("pending → active → subscribed → active_post_cancel, con milestones", async () => {
    const id = await asSystem("test-path", "pooled", () => createPendingConsultant());

    const activated = await asSystem("test-path", "pooled", () =>
      signalAccountState(id, "password_set"),
    );
    expect(activated).toMatchObject({ applied: true, state: "active" });

    const subscribed = await asSystem("test-path", "pooled", () =>
      signalAccountState(id, "checkout_completed"),
    );
    expect(subscribed).toMatchObject({ applied: true, state: "subscribed" });

    const canceled = await asSystem("test-path", "pooled", () =>
      signalAccountState(id, "subscription_deleted"),
    );
    expect(canceled).toMatchObject({ applied: true, state: "active_post_cancel" });

    const ob = await onboardingRow(id);
    expect(ob?.stage1_submitted_at).toBeInstanceOf(Date);
    expect(ob?.stage2_password_set_at).toBeInstanceOf(Date);
    expect(ob?.checkout_completed_at).toBeInstanceOf(Date);
  });

  it("re-suscripción: active_post_cancel → subscribed (re-entrada documentada)", async () => {
    const id = await asSystem("test-resub", "pooled", () => createPendingConsultant());
    for (const signal of ["password_set", "checkout_completed", "subscription_deleted"] as const) {
      await asSystem("test-resub", "pooled", () => signalAccountState(id, signal));
    }
    const r = await asSystem("test-resub", "pooled", () =>
      signalAccountState(id, "checkout_completed"),
    );
    expect(r).toMatchObject({ applied: true, state: "subscribed" });
  });

  it("funciona igual en modo direct (set_config atómico en el statement)", async () => {
    const id = await asSystem("test-direct", "pooled", () => createPendingConsultant());
    const r = await asSystem("test-direct", "direct", () =>
      signalAccountState(id, "password_set"),
    );
    expect(r).toMatchObject({ applied: true, state: "active" });
  });
});

describe("señales repetidas e inválidas (webhooks reintentan: jamás lanzar)", () => {
  it("señal repetida = no-op silencioso y el milestone NO se sobrescribe", async () => {
    const id = await asSystem("test-noop", "pooled", () => createPendingConsultant());
    await asSystem("test-noop", "pooled", () => signalAccountState(id, "password_set"));
    await asSystem("test-noop", "pooled", () => signalAccountState(id, "checkout_completed"));
    const first = (await onboardingRow(id))!.checkout_completed_at;

    const repeat = await asSystem("test-noop", "pooled", () =>
      signalAccountState(id, "checkout_completed"),
    );
    expect(repeat).toMatchObject({ applied: false, state: "subscribed", reason: "noop" });
    expect((await onboardingRow(id))!.checkout_completed_at).toEqual(first);
  });

  it("password_set sobre una cuenta ya activa (re-login) = no-op", async () => {
    const t = await createTenant("relogin");
    const r = await asSystem("test-relogin", "pooled", () =>
      signalAccountState(t.consultantId, "password_set"),
    );
    expect(r).toMatchObject({ applied: false, state: "active", reason: "noop" });
  });

  it("transición inválida (pending + checkout_completed) = no-op sin escribir", async () => {
    const id = await asSystem("test-invalid", "pooled", () => createPendingConsultant());
    const r = await asSystem("test-invalid", "pooled", () =>
      signalAccountState(id, "checkout_completed"),
    );
    expect(r).toMatchObject({ applied: false, reason: "invalid_transition" });
    expect(await readState(id)).toBe("pending");
  });
});

describe("single-writer a nivel BD (ADR-001 del blueprint)", () => {
  it("UPDATE directo de account_state → excepción del trigger (incluso migrator)", async () => {
    const t = await createTenant("direct-write");
    await expect(
      withMigrator((c) =>
        c.query(`UPDATE consultants SET account_state = 'subscribed' WHERE id = $1`, [
          t.consultantId,
        ]),
      ),
    ).rejects.toThrow(/AccountStateMachine/);
  });

  it("INSERT directo con estado ≠ 'active' → excepción del trigger", async () => {
    await expect(
      withMigrator((c) =>
        c.query(`INSERT INTO consultants (firebase_uid, account_state) VALUES (NULL, 'pending')`),
      ),
    ).rejects.toThrow(/AccountStateMachine/);
  });

  it("los milestones de onboarding_sessions son write-once a nivel BD", async () => {
    const id = await asSystem("test-once", "pooled", () => createPendingConsultant());
    await expect(
      withMigrator((c) =>
        c.query(
          `UPDATE onboarding_sessions SET stage1_submitted_at = now() WHERE consultant_id = $1`,
          [id],
        ),
      ),
    ).rejects.toThrow(/write-once/);
  });
});
