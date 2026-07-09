import { randomUUID } from "node:crypto";
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { Client, Pool } from "pg";
import { APP_DB_URL, MIGRATIONS_DB_URL } from "../../db-urls";

/**
 * COV_PF_TENANT_001: Tenant Isolation — @security @multitenant (P0)
 *
 * .1 Consultant A no puede leer datos de Consultant B en ningún endpoint tenant.
 * .2 Una query sin contexto de tenant se rechaza con 401 y cero filas leídas.
 * .3 El scoping RLS es idéntico en conexión pooled (SET LOCAL) y directa (SET).
 *
 * La app corre con el rol brandme_app (sin BYPASSRLS); las fixtures se siembran
 * con el rol migrator. Las sesiones se acuñan por el middleware real (GET / con
 * Accept: text/html), igual que un navegador.
 */

interface Tenant {
  ctx: APIRequestContext;
  sessionId: string;
  consultantId: string;
  conversationId: string;
  generationId: string;
  slug: string;
  leadName: string;
}

async function withMigrator<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: MIGRATIONS_DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Acuña sesión real vía middleware + siembra un juego de datos completo. */
async function provisionTenant(baseURL: string, label: string): Promise<Tenant> {
  const ctx = await pwRequest.newContext({ baseURL });
  const home = await ctx.get("/", { headers: { accept: "text/html" } });
  expect(home.ok(), "la home debe responder").toBeTruthy();
  const cookie = (await ctx.storageState()).cookies.find((c) => c.name === "bmc_session");
  if (!cookie) throw new Error("el middleware no acuñó bmc_session");
  const sessionId = cookie.value;

  // La conversación se crea por la API real (ejercita tenantRoute + withTenant + RLS).
  const convRes = await ctx.post("/api/conversations");
  expect(convRes.ok()).toBeTruthy();
  const conversationId = (await convRes.json()).data.id as string;
  expect(conversationId, "la API debe crear la conversación").toBeTruthy();

  // El resto de fixtures se siembra por DB (generate exige LLM real, fuera de scope e2e).
  const slug = `e2e-${label}-${randomUUID().slice(0, 8)}`;
  const leadName = `Lead de ${label}`;
  const { consultantId, generationId } = await withMigrator(async (c) => {
    const mapped = await c.query<{ consultant_id: string }>(
      `SELECT consultant_id FROM consultant_sessions WHERE session_id = $1`,
      [sessionId],
    );
    const consultantId = mapped.rows[0]?.consultant_id;
    if (!consultantId) throw new Error(`la sesión ${sessionId} no tiene consultant mapeado`);
    const gen = await c.query<{ id: string }>(
      `INSERT INTO generations (session_id, consultant_id, url, name, design_md, html, slug, brand, city, published)
       VALUES ($1, $2, 'https://e2e', $3, 'md', '<html>', $4, $5, 'CDMX', true) RETURNING id`,
      [sessionId, consultantId, `web ${label}`, slug, `Brand-${label}`],
    );
    await c.query(
      `INSERT INTO leads (slug, consultant_id, name, email, source)
       VALUES ($1, $2, $3, 'e2e@x.com', 'form')`,
      [slug, consultantId, leadName],
    );
    // Suscripción activa: el server e2e corre con Stripe configurado (paywall
    // activo por COV_PF_WEBHOOK_001) y el flujo de publish exige suscripción.
    await c.query(
      `INSERT INTO subscriptions (session_id, consultant_id, stripe_customer_id, status)
       VALUES ($1, $2, $3, 'active')`,
      [sessionId, consultantId, `cus_e2e_${slug}`],
    );
    return { consultantId, generationId: gen.rows[0].id };
  });

  return { ctx, sessionId, consultantId, conversationId, generationId, slug, leadName };
}

let A: Tenant;
let B: Tenant;

test.beforeAll(async ({}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL!;
  A = await provisionTenant(baseURL, "a");
  B = await provisionTenant(baseURL, "b");
});

test.afterAll(async () => {
  await A?.ctx.dispose();
  await B?.ctx.dispose();
});

test("@COV_PF_TENANT_001.1 @security @multitenant — A no lee datos de B en ningún endpoint", async () => {
  // Listados: la respuesta de A no contiene NINGÚN identificador de B.
  const listEndpoints = ["/api/conversations", "/api/history", "/api/leads"];
  for (const path of listEndpoints) {
    const res = await A.ctx.get(path);
    expect(res.status(), `${path} debe responder 200 para A`).toBe(200);
    const body = JSON.stringify(await res.json());
    expect(body, `${path} no debe contener la conversación de B`).not.toContain(
      B.conversationId,
    );
    expect(body, `${path} no debe contener la generación de B`).not.toContain(B.generationId);
    expect(body, `${path} no debe contener el slug de B`).not.toContain(B.slug);
    expect(body, `${path} no debe contener el lead de B`).not.toContain(B.leadName);
  }

  // A sí ve lo suyo (el test no pasa por listas vacías).
  const own = JSON.stringify(await (await A.ctx.get("/api/history")).json());
  expect(own).toContain(A.generationId);
  const ownLeads = JSON.stringify(await (await A.ctx.get("/api/leads")).json());
  expect(ownLeads).toContain(A.leadName);

  // Detalle cruzado por id: 404 (cero filas), nunca datos de B.
  expect((await A.ctx.get(`/api/conversations/${B.conversationId}`)).status()).toBe(404);
  expect((await A.ctx.get(`/api/history/${B.generationId}`)).status()).toBe(404);

  // Escrituras cruzadas: publicar la web de B como A → 404; borrar conversación de B no borra.
  const publish = await A.ctx.post("/api/publish", { data: { slug: B.slug } });
  expect(publish.status()).toBe(404);
  await A.ctx.delete(`/api/conversations/${B.conversationId}`);
  const stillThere = await B.ctx.get(`/api/conversations/${B.conversationId}`);
  expect(stillThere.status(), "la conversación de B sigue viva tras el DELETE de A").toBe(200);
});

test("@COV_PF_TENANT_001.2 @security @multitenant — sin sesión: 401 y cero filas leídas", async ({
  playwright,
}, testInfo) => {
  const anon = await pwRequest.newContext({
    baseURL: testInfo.project.use.baseURL!,
  });
  // Endpoints tenant SIN cookie → 401 antes de tocar datos. (subscription/checkout/
  // generate cortan antes por config ausente —Stripe/OpenRouter—, sin tocar DB.)
  const cases: Array<[string, "get" | "post" | "put" | "delete"]> = [
    ["/api/conversations", "get"],
    ["/api/conversations", "post"],
    [`/api/conversations/${A.conversationId}`, "get"],
    [`/api/conversations/${A.conversationId}`, "put"],
    [`/api/conversations/${A.conversationId}`, "delete"],
    ["/api/history", "get"],
    [`/api/history/${A.generationId}`, "get"],
    ["/api/leads", "get"],
    ["/api/publish", "post"],
  ];
  for (const [path, method] of cases) {
    const res = await anon[method](path);
    expect(res.status(), `${method.toUpperCase()} ${path} sin cookie debe ser 401`).toBe(401);
  }
  await anon.dispose();

  // Cero filas: el rol de app SIN GUC no lee nada de ninguna tabla tenant-scoped.
  const raw = new Client({ connectionString: APP_DB_URL });
  await raw.connect();
  try {
    for (const table of ["conversations", "generations", "leads", "subscriptions"]) {
      const { rows } = await raw.query(`SELECT * FROM ${table}`);
      expect(rows, `${table} sin contexto debe devolver 0 filas`).toHaveLength(0);
    }
  } finally {
    await raw.end();
  }
});

test("@COV_PF_TENANT_001.3 @security @multitenant — aislamiento idéntico en pooled y direct", async () => {
  const tables = ["conversations", "generations", "leads"] as const;

  /** Cuenta filas visibles para A en cada tabla, en modo pooled (SET LOCAL en transacción). */
  async function snapshotPooled(): Promise<Record<string, number>> {
    const pool = new Pool({ connectionString: APP_DB_URL, max: 2 });
    const client = await pool.connect();
    const out: Record<string, number> = {};
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.consultant_id', $1, true)", [A.consultantId]);
      for (const t of tables) {
        const { rows } = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`);
        out[t] = Number(rows[0].n);
      }
      await client.query("COMMIT");
    } finally {
      client.release();
      await pool.end();
    }
    return out;
  }

  /** Igual pero en conexión directa con SET de sesión + limpieza. */
  async function snapshotDirect(): Promise<Record<string, number>> {
    const client = new Client({ connectionString: APP_DB_URL });
    await client.connect();
    const out: Record<string, number> = {};
    try {
      await client.query("SELECT set_config('app.consultant_id', $1, false)", [A.consultantId]);
      for (const t of tables) {
        const { rows } = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`);
        out[t] = Number(rows[0].n);
      }
    } finally {
      await client.query("SELECT set_config('app.consultant_id', '', false)").catch(() => {});
      await client.end();
    }
    return out;
  }

  const pooled = await snapshotPooled();
  const direct = await snapshotDirect();
  expect(pooled, "pooled y direct deben ver EXACTAMENTE lo mismo").toEqual(direct);
  // Y lo que ven es solo lo de A (1 generación, 1 lead, ≥1 conversación propia).
  expect(pooled.generations).toBe(1);
  expect(pooled.leads).toBe(1);
  expect(pooled.conversations).toBeGreaterThanOrEqual(1);
});
