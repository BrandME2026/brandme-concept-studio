import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAndMigrate } from "./harness";
import { withMigrator } from "./db-util";
import { invalidateConfigCache } from "../../src/lib/config/config-store";
import {
  captureError,
  currentObservabilityTags,
  scrubPii,
  setObservabilitySink,
  withObservabilityContext,
  __resetObservabilityForTests,
  type CapturedError,
  type RateAlert,
} from "../../src/lib/observability/observability";

/**
 * WO-8 / REQ-PF-008: wrapper de observabilidad con sink fake. En proyecto db
 * porque el umbral de alerta es EP-07 (ConfigStore → Postgres).
 */

process.env.CONFIG_CACHE_TTL_MS = "150";

let captured: CapturedError[];
let alerts: RateAlert[];

beforeAll(async () => {
  await resetAndMigrate();
});

beforeEach(() => {
  __resetObservabilityForTests();
  invalidateConfigCache();
  captured = [];
  alerts = [];
  setObservabilitySink({
    capture: (p) => captured.push(p),
    alert: (a) => alerts.push(a),
  });
});

describe("tags EP-04 automáticos (AC-PF-008.1)", () => {
  it("deriva los tags del contexto; los callers no los setean", () => {
    withObservabilityContext(
      { surface: "/api/test", consultant_id: "c-1", role: "consultant" },
      () => captureError(new Error("boom")),
    );
    expect(captured[0].tags).toEqual({
      surface: "/api/test",
      consultant_id: "c-1",
      role: "consultant",
    });
  });

  it("los contextos anidados se mergean (ruta → wrapper LLM)", () => {
    withObservabilityContext({ surface: "/api/agent", consultant_id: "c-1" }, () =>
      withObservabilityContext({ agent_id: "agent-07", model_alias: "fast" }, () => {
        expect(currentObservabilityTags()).toEqual({
          surface: "/api/agent",
          consultant_id: "c-1",
          agent_id: "agent-07",
          model_alias: "fast",
        });
        captureError(new Error("x"));
      }),
    );
    expect(captured[0].tags.agent_id).toBe("agent-07");
    expect(captured[0].tags.surface).toBe("/api/agent");
  });

  it("sin contexto: tags vacíos, sin crash", () => {
    captureError("string plano");
    expect(captured[0].tags).toEqual({});
    expect(captured[0].message).toBe("string plano");
  });
});

describe("scrubbing de PII (AC-PF-008.2)", () => {
  it("elimina emails y teléfonos de message, note y stack", () => {
    const err = new Error("fallo enviando a shawn@getbrandme.ai desde +52 55 1234 5678");
    err.stack = `Error: contacto juan.perez@x.mx tel 5512345678\n    at route.ts:10:5`;
    withObservabilityContext({ surface: "/api/leads" }, () =>
      captureError(err, "lead de maria@y.com no guardado"),
    );
    const p = captured[0];
    const all = `${p.message} ${p.note} ${p.stack}`;
    expect(all).not.toMatch(/@getbrandme|@x\.mx|@y\.com/);
    expect(all).not.toMatch(/5512345678|1234 5678/);
    expect(p.message).toContain("[email]");
    expect(p.message).toContain("[tel]");
    expect(p.stack).toContain("route.ts"); // el stack sigue siendo útil
  });

  it("scrubPii es directamente utilizable", () => {
    expect(scrubPii("mail a@b.co tel +5215512345678 fin")).toBe("mail [email] tel [tel] fin");
  });
});

describe("alerta por tasa (AC-PF-008.3)", () => {
  it("dispara UNA alerta por ventana cuando la surface supera el umbral de ConfigStore", async () => {
    await withMigrator((c) =>
      c.query(
        `UPDATE platform_config SET current_value = '3'::jsonb
         WHERE feature_area = 'observability' AND config_key = 'error_rate_threshold_per_min'`,
      ),
    );
    invalidateConfigCache();
    withObservabilityContext({ surface: "/api/critica" }, () => {
      for (let i = 0; i < 5; i++) captureError(new Error(`e${i}`));
    });
    await vi.waitFor(() => expect(alerts.length).toBeGreaterThan(0), { timeout: 2_000 });
    expect(alerts).toHaveLength(1); // una por ventana, no una por error
    expect(alerts[0].surface).toBe("/api/critica");
    expect(alerts[0].count).toBeGreaterThanOrEqual(3);
    await withMigrator((c) =>
      c.query(
        `UPDATE platform_config SET current_value = NULL
         WHERE feature_area = 'observability' AND config_key = 'error_rate_threshold_per_min'`,
      ),
    );
  });

  it("bajo el umbral no alerta", async () => {
    withObservabilityContext({ surface: "/api/tranquila" }, () => {
      captureError(new Error("solo uno"));
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(alerts).toHaveLength(0);
  });
});
