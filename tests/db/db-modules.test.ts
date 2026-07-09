import { beforeAll, describe, expect, it } from "vitest";
import {
  createTenant,
  resetAndMigrate,
  seedTenantData,
  type SeededIds,
  type TenantFixture,
} from "./harness";
import { withSystemContext, withTenant, TenantContextError } from "../../src/lib/db/tenant-context";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  saveConversation,
} from "../../src/lib/db/conversations";
import {
  findGenerationByBrandCity,
  getOwnGenerationBySlug,
  getPublicGenerationBySlug,
  listAllGenerations,
  listGenerations,
  publishGeneration,
} from "../../src/lib/db/history";
import { listLeadsForConsultant, saveLead, slugExists } from "../../src/lib/db/leads";
import {
  applySubscriptionEvent,
  getSubscriptionForTenant,
  isSubscriptionActive,
} from "../../src/lib/db/subscriptions";
import { upsertUserAndLinkSession } from "../../src/lib/db/users";
import { withMigrator } from "./db-util";

/** Query puntual con el rol migrator (BYPASSRLS) para inspeccionar estado. */
function withMigratorQuery<R extends Record<string, unknown>>(sql: string, params: unknown[]) {
  return withMigrator((c) => c.query<R>(sql, params as never));
}

/**
 * AC-PF-002.2 a nivel de módulos: cada función pública de la capa db, ejecutada
 * como A, jamás devuelve/toca datos de B; y ejecutada SIN contexto lanza
 * TenantContextError (nunca llega a la base).
 */

let A: TenantFixture;
let B: TenantFixture;
let seedA: SeededIds;
let seedB: SeededIds;

beforeAll(async () => {
  await resetAndMigrate();
  A = await createTenant("ma");
  B = await createTenant("mb");
  seedA = await seedTenantData(A, "ma");
  seedB = await seedTenantData(B, "mb");
});

describe("conversations", () => {
  it("listConversations devuelve solo las de A", async () => {
    const list = await withTenant(A.consultantId, () => listConversations());
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(seedA.conversationId);
  });

  it("getConversation con id de B devuelve null para A", async () => {
    const found = await withTenant(A.consultantId, () => getConversation(seedB.conversationId));
    expect(found).toBeNull();
  });

  it("saveConversation/deleteConversation sobre una conversación de B no hacen nada", async () => {
    await withTenant(A.consultantId, () =>
      saveConversation(seedB.conversationId, { title: "hacked" }),
    );
    await withTenant(A.consultantId, () => deleteConversation(seedB.conversationId));
    const intact = await withTenant(B.consultantId, () => getConversation(seedB.conversationId));
    expect(intact?.title).toBe("conv de mb");
  });

  it("createConversation hereda el tenant del contexto", async () => {
    const id = await withTenant(A.consultantId, () => createConversation(A.sessionId));
    const own = await withTenant(A.consultantId, () => getConversation(id));
    expect(own?.id).toBe(id);
    const foreign = await withTenant(B.consultantId, () => getConversation(id));
    expect(foreign).toBeNull();
    await withTenant(A.consultantId, () => deleteConversation(id));
  });
});

describe("generations (history)", () => {
  it("listGenerations devuelve solo las de A", async () => {
    const list = await withTenant(A.consultantId, () => listGenerations());
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(seedA.generationId);
  });

  it("findGenerationByBrandCity no cruza tenants (la marca de B no existe para A)", async () => {
    const found = await withTenant(A.consultantId, () =>
      findGenerationByBrandCity("Brand-mb", "CDMX"),
    );
    expect(found).toBeNull();
    const own = await withTenant(A.consultantId, () =>
      findGenerationByBrandCity("Brand-ma", "CDMX"),
    );
    expect(own?.id).toBe(seedA.generationId);
  });

  it("publishGeneration/getOwnGenerationBySlug del slug de B fallan para A", async () => {
    const published = await withTenant(A.consultantId, () => publishGeneration(seedB.slug));
    expect(published).toBe(false);
    const own = await withTenant(A.consultantId, () => getOwnGenerationBySlug(seedB.slug));
    expect(own).toBeNull();
  });

  it("las superficies públicas (system) ven ambas generaciones", async () => {
    const all = await withSystemContext("test-galeria", () => listAllGenerations());
    expect(all.length).toBe(2);
    const pageB = await withSystemContext("test-p-slug", () =>
      getPublicGenerationBySlug(seedB.slug),
    );
    expect(pageB?.id).toBe(seedB.generationId);
  });
});

describe("leads", () => {
  it("listLeadsForConsultant devuelve solo los leads de A", async () => {
    const list = await withTenant(A.consultantId, () => listLeadsForConsultant());
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(seedA.leadId);
  });

  it("saveLead (visitante anónimo, system) asigna el consultant dueño del slug", async () => {
    const { id } = await withSystemContext("test-lead", () =>
      saveLead({
        slug: seedB.slug,
        brand: null,
        city: null,
        name: "Visitante",
        phone: null,
        email: null,
        message: null,
        source: "form",
      }),
    );
    const ofB = await withTenant(B.consultantId, () => listLeadsForConsultant());
    expect(ofB.map((l) => l.id)).toContain(id);
    const ofA = await withTenant(A.consultantId, () => listLeadsForConsultant());
    expect(ofA.map((l) => l.id)).not.toContain(id);
  });

  it("slugExists funciona bajo system", async () => {
    expect(await withSystemContext("test-slug", () => slugExists(seedA.slug))).toBe(true);
    expect(await withSystemContext("test-slug", () => slugExists("no-existe"))).toBe(false);
  });
});

describe("subscriptions", () => {
  it("getSubscriptionForTenant/isSubscriptionActive ven solo la suscripción propia", async () => {
    const sub = await withTenant(A.consultantId, () => getSubscriptionForTenant());
    expect(sub?.stripeCustomerId).toBe(`cus_${seedA.slug}`);
    expect(await withTenant(A.consultantId, () => isSubscriptionActive())).toBe(true);
  });

  it("applySubscriptionEvent (webhook, system) actualiza por customer sin contexto de tenant", async () => {
    await withSystemContext("test-webhook", () =>
      applySubscriptionEvent({
        customerId: `cus_${seedB.slug}`,
        subscriptionId: "sub_123",
        status: "canceled",
        currentPeriodEnd: null,
      }),
    );
    const subB = await withTenant(B.consultantId, () => getSubscriptionForTenant());
    expect(subB?.status).toBe("canceled");
    const subA = await withTenant(A.consultantId, () => getSubscriptionForTenant());
    expect(subA?.status).toBe("active");
  });
});

describe("merge de login (auth-link-merge)", () => {
  it("primer login: el consultant provisional de la sesión pasa a ser canónico", async () => {
    const Q = await createTenant("login-q");
    await seedTenantData(Q, "login-q");
    await withSystemContext("auth-link-merge", () =>
      upsertUserAndLinkSession({ id: "uid-nuevo", email: "n@x.com" }, Q.sessionId),
    );
    const { rows } = await withMigratorQuery<{ firebase_uid: string | null }>(
      `SELECT firebase_uid FROM consultants WHERE id = $1`,
      [Q.consultantId],
    );
    expect(rows[0].firebase_uid).toBe("uid-nuevo");
  });

  it("login en sesión nueva: se reasigna al canónico y el historial provisional se conserva", async () => {
    // C = consultant canónico ya logueado antes (uid-merge) con su historial.
    const C = await createTenant("login-c");
    await seedTenantData(C, "login-c");
    await withSystemContext("auth-link-merge", () =>
      upsertUserAndLinkSession({ id: "uid-merge" }, C.sessionId),
    );
    // P = sesión anónima nueva (otro navegador) que generó historial y LUEGO se loguea.
    const P = await createTenant("login-p");
    const seedP = await seedTenantData(P, "login-p");
    await withSystemContext("auth-link-merge", () =>
      upsertUserAndLinkSession({ id: "uid-merge" }, P.sessionId),
    );

    // La sesión de P apunta ahora al canónico C.
    const { rows: mapped } = await withMigratorQuery<{ consultant_id: string }>(
      `SELECT consultant_id FROM consultant_sessions WHERE session_id = $1`,
      [P.sessionId],
    );
    expect(mapped[0].consultant_id).toBe(C.consultantId);

    // C ve el historial de ambos; el provisional P quedó vacío.
    const ofC = await withTenant(C.consultantId, () => listGenerations());
    expect(ofC.map((g) => g.id)).toContain(seedP.generationId);
    const ofP = await withTenant(P.consultantId, () => listGenerations());
    expect(ofP).toHaveLength(0);
  });
});

describe("sin contexto: toda función pública lanza TenantContextError", () => {
  it("rechaza antes de tocar la base", async () => {
    await expect(listConversations()).rejects.toThrow(TenantContextError);
    await expect(listGenerations()).rejects.toThrow(TenantContextError);
    await expect(listLeadsForConsultant()).rejects.toThrow(TenantContextError);
    await expect(getSubscriptionForTenant()).rejects.toThrow(TenantContextError);
    await expect(getConversation(seedA.conversationId)).rejects.toThrow(TenantContextError);
  });
});
