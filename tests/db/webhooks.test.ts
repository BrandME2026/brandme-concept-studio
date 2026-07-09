import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetAndMigrate } from "./harness";
import { withMigrator } from "./db-util";
import { invalidateConfigCache } from "../../src/lib/config/config-store";
import { handleWebhook, type WebhookAdapter } from "../../src/lib/webhooks/handler";

/**
 * WO-6 / REQ-PF-009: el primitivo REAL contra la DB REAL con un adapter fake.
 * Firma "válida" simulada por header x-sig (la estrategia de firma es del
 * adapter; el primitivo solo exige el contrato null→400).
 */

process.env.CONFIG_CACHE_TTL_MS = "150";

interface FakeEvent {
  id: string;
  payload?: string;
}

function makeAdapter(opts?: {
  processDelayMs?: number;
  failProcess?: () => boolean;
}): { adapter: WebhookAdapter<FakeEvent>; executions: FakeEvent[] } {
  const executions: FakeEvent[] = [];
  const adapter: WebhookAdapter<FakeEvent> = {
    vendor: "test-vendor",
    async verifyAndParse(rawBody, headers) {
      if (headers.get("x-sig") !== "valid") return null;
      const event = JSON.parse(rawBody) as FakeEvent;
      return { eventId: event.id, event };
    },
    async process(event) {
      if (opts?.processDelayMs) await new Promise((r) => setTimeout(r, opts.processDelayMs));
      if (opts?.failProcess?.()) throw new Error("negocio falló");
      executions.push(event);
    },
  };
  return { adapter, executions };
}

function webhookRequest(event: FakeEvent, sig = "valid"): Request {
  return new Request("http://test.local/webhook", {
    method: "POST",
    headers: { "x-sig": sig, "content-type": "application/json" },
    body: JSON.stringify(event),
  });
}

async function dedupRows(eventId: string) {
  const { rows } = await withMigrator((c) =>
    c.query(
      `SELECT vendor, event_id, expires_at FROM webhook_events WHERE vendor = 'test-vendor' AND event_id = $1`,
      [eventId],
    ),
  );
  return rows;
}

beforeAll(async () => {
  await resetAndMigrate();
});

beforeEach(() => {
  invalidateConfigCache();
});

describe("firma (AC-PF-009.3 / COV_PF_WEBHOOK_001.1)", () => {
  it("firma inválida → 400, sin negocio y sin registro de dedup", async () => {
    const { adapter, executions } = makeAdapter();
    const res = await handleWebhook(webhookRequest({ id: "evt_bad" }, "INVALIDA"), adapter);
    expect(res.status).toBe(400);
    expect(executions).toHaveLength(0);
    expect(await dedupRows("evt_bad")).toHaveLength(0);
  });
});

describe("dedup insert-before-process (AC-PF-009.2/.4 / COV_PF_WEBHOOK_001.2)", () => {
  it("evento válido → 200, ejecuta negocio y registra dedup con TTL de config (30d)", async () => {
    const { adapter, executions } = makeAdapter();
    const res = await handleWebhook(webhookRequest({ id: "evt_1" }), adapter);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, replay: false });
    expect(executions).toHaveLength(1);
    const rows = await dedupRows("evt_1");
    expect(rows).toHaveLength(1);
    const days = (new Date(rows[0].expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it("replay del mismo event_id → 200 reconocido SIN re-ejecutar", async () => {
    const { adapter, executions } = makeAdapter();
    await handleWebhook(webhookRequest({ id: "evt_replay" }), adapter);
    const res = await handleWebhook(
      webhookRequest({ id: "evt_replay", payload: "distinto" }),
      adapter,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, replay: true });
    expect(executions).toHaveLength(1);
  });

  it("dos entregas CONCURRENTES del mismo evento → exactamente una ejecución", async () => {
    const { adapter, executions } = makeAdapter({ processDelayMs: 150 });
    const [a, b] = await Promise.all([
      handleWebhook(webhookRequest({ id: "evt_conc" }), adapter),
      handleWebhook(webhookRequest({ id: "evt_conc" }), adapter),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(executions).toHaveLength(1);
    const replays = [(await a.json()).replay, (await b.json()).replay];
    expect(replays.filter(Boolean)).toHaveLength(1);
  });

  it("si el negocio falla → 500 y el dedup NO se consume; el reintento procesa", async () => {
    let fail = true;
    const { adapter, executions } = makeAdapter({ failProcess: () => fail });
    const first = await handleWebhook(webhookRequest({ id: "evt_retry" }), adapter);
    expect(first.status).toBe(500);
    expect(await dedupRows("evt_retry")).toHaveLength(0); // rollback: registro libre
    fail = false;
    const retry = await handleWebhook(webhookRequest({ id: "evt_retry" }), adapter);
    expect(retry.status).toBe(200);
    expect(executions).toHaveLength(1);
    expect(await dedupRows("evt_retry")).toHaveLength(1);
  });
});

describe("purga TTL", () => {
  it("los registros vencidos se purgan oportunistamente al procesar", async () => {
    await withMigrator((c) =>
      c.query(
        `INSERT INTO webhook_events (vendor, event_id, expires_at)
         VALUES ('test-vendor', 'evt_viejo', now() - interval '1 day')`,
      ),
    );
    const { adapter } = makeAdapter();
    await handleWebhook(webhookRequest({ id: "evt_nuevo" }), adapter);
    expect(await dedupRows("evt_viejo")).toHaveLength(0);
    expect(await dedupRows("evt_nuevo")).toHaveLength(1);
  });
});
