import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { resetAndMigrate } from "./harness";
import { withMigrator } from "./db-util";
import { invalidateConfigCache } from "../../src/lib/config/config-store";
import {
  setObservabilitySink,
  __resetObservabilityForTests,
  type RateAlert,
} from "../../src/lib/observability/observability";
import {
  checkConsultantRateLimit,
  checkRateLimit,
} from "../../src/lib/security/rate-limit";

/**
 * WO-9 / REQ-PF-019: dual-key (IP + consultant_id simultáneos), caps EP-07 y
 * alerta de breach vía ObservabilityWrapper en CADA breach.
 */

process.env.CONFIG_CACHE_TTL_MS = "150";

let alerts: RateAlert[];

async function setCap(name: string, value: string | null) {
  await withMigrator((c) =>
    c.query(
      `UPDATE platform_config SET current_value = $2::jsonb
       WHERE feature_area = 'rate_limiting' AND config_key = $1`,
      [`${name}_per_min`, value],
    ),
  );
  invalidateConfigCache();
}

beforeAll(async () => {
  await resetAndMigrate();
});

beforeEach(() => {
  __resetObservabilityForTests();
  alerts = [];
  setObservabilitySink({ capture: () => {}, alert: (a) => alerts.push(a) });
});

describe("dimensión IP (AC-PF-019.2)", () => {
  it("supera el cap → ok=false con retryAfter > 0", async () => {
    await setCap("leads", "2");
    const key = `leads:ip-test-${randomUUID().slice(0, 6)}`;
    expect((await checkRateLimit("leads", key)).ok).toBe(true);
    expect((await checkRateLimit("leads", key)).ok).toBe(true);
    const third = await checkRateLimit("leads", key);
    expect(third.ok).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
    await setCap("leads", null);
  });
});

describe("dimensión consultant_id (AC-PF-019.5)", () => {
  it("el cap del consultant corta aunque otras claves estén libres, y es independiente por consultant", async () => {
    await setCap("checkout", "2");
    const A = randomUUID();
    const B = randomUUID();
    expect((await checkConsultantRateLimit("checkout", A)).ok).toBe(true);
    expect((await checkConsultantRateLimit("checkout", A)).ok).toBe(true);
    expect((await checkConsultantRateLimit("checkout", A)).ok).toBe(false); // A alcanzado
    expect((await checkConsultantRateLimit("checkout", B)).ok).toBe(true); // B libre
    // La dimensión IP del mismo surface sigue libre (claves separadas).
    expect((await checkRateLimit("checkout", `checkout:ip-x-${A.slice(0, 6)}`)).ok).toBe(true);
    await setCap("checkout", null);
  });
});

describe("alerta de breach (AC-PF-019.4)", () => {
  it("emite alerta con surface, requester y count en CADA breach", async () => {
    await setCap("agent", "1");
    const key = `agent:ip-alert-${randomUUID().slice(0, 6)}`;
    await checkRateLimit("agent", key); // dentro del cap
    await checkRateLimit("agent", key); // breach 1
    await checkRateLimit("agent", key); // breach 2
    expect(alerts).toHaveLength(2); // cada breach alerta (contrato del blueprint)
    expect(alerts[0].surface).toBe("agent");
    expect(alerts[0].message).toContain(key);
    expect(alerts[0].count).toBe(2);
    expect(alerts[1].count).toBe(3);

    const cid = randomUUID();
    await checkConsultantRateLimit("agent", cid);
    await checkConsultantRateLimit("agent", cid); // breach consultant
    expect(alerts).toHaveLength(3);
    expect(alerts[2].message).toContain(`consultant:${cid}`);
    await setCap("agent", null);
  });
});
