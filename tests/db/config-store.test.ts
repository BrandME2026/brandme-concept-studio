import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetAndMigrate } from "./harness";
import { withMigrator } from "./db-util";
import {
  getConfigNumber,
  getConfigString,
  invalidateConfigCache,
} from "../../src/lib/config/config-store";

/**
 * WO-7 / REQ-PF-020: read path de configuración EP-07. La migración 0004 siembra
 * los tunables actuales; ConfigStore resuelve current_value ?? default_value ??
 * fallback con cache local (TTL corto en tests vía CONFIG_CACHE_TTL_MS).
 */

process.env.CONFIG_CACHE_TTL_MS = "150";

async function setCurrentValue(area: string, key: string, valueJson: string | null) {
  await withMigrator((c) =>
    c.query(
      `UPDATE platform_config SET current_value = $3::jsonb, last_modified_at = now()
       WHERE feature_area = $1 AND config_key = $2`,
      [area, key, valueJson],
    ),
  );
}

beforeAll(async () => {
  await resetAndMigrate();
});

beforeEach(() => {
  invalidateConfigCache();
});

describe("migración 0004 (seeds)", () => {
  it("siembra los tunables actuales con default_value y current_value NULL", async () => {
    const { rows } = await withMigrator((c) =>
      c.query<{ feature_area: string; config_key: string; current: unknown; def: unknown }>(
        `SELECT feature_area, config_key, current_value AS current, default_value AS def
         FROM platform_config ORDER BY feature_area, config_key`,
      ),
    );
    const keys = rows.map((r) => `${r.feature_area}.${r.config_key}`);
    for (const expected of [
      "rate_limiting.generate_per_min",
      "rate_limiting.leads_per_min",
      "rate_limiting.speech_per_min",
      "llm.daily_cap",
      "llm.model_alias_alta",
      "llm.model_alias_rapido",
      "extract.max_concurrent",
    ]) {
      expect(keys, `seed ${expected}`).toContain(expected);
    }
    for (const row of rows) {
      expect(row.current, `${row.config_key} current_value inicial`).toBeNull();
      // Excepción documentada: daily_cost_cap_usd tiene default jsonb null =
      // "sin techo" hasta que el Cost Model se recalcule (WO-4).
      if (`${row.feature_area}.${row.config_key}` === "llm.daily_cost_cap_usd") continue;
      expect(row.def, `${row.config_key} default_value`).not.toBeNull();
    }
  });

  it("(feature_area, config_key) es único", async () => {
    await expect(
      withMigrator((c) =>
        c.query(
          `INSERT INTO platform_config (feature_area, config_key, default_value)
           VALUES ('llm', 'daily_cap', '1'::jsonb)`,
        ),
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe("ConfigStore", () => {
  it("devuelve el default sembrado cuando no hay current_value", async () => {
    expect(await getConfigNumber("llm", "daily_cap", 999)).toBe(300);
    expect(await getConfigString("llm", "model_alias_alta", "x")).toBe("openai/gpt-5.5");
  });

  it("current_value (guardado por admin) manda sobre el default", async () => {
    await setCurrentValue("rate_limiting", "leads_per_min", "2");
    invalidateConfigCache();
    expect(await getConfigNumber("rate_limiting", "leads_per_min", 5)).toBe(2);
    await setCurrentValue("rate_limiting", "leads_per_min", null); // restaurar
  });

  it("la cache sirve el valor viejo hasta expirar el TTL; luego aplica el nuevo (REQ-PF-020.3)", async () => {
    expect(await getConfigNumber("llm", "daily_cap", 999)).toBe(300); // calienta cache
    await setCurrentValue("llm", "daily_cap", "42");
    // Con cache caliente sigue el viejo (sin invalidate explícito).
    expect(await getConfigNumber("llm", "daily_cap", 999)).toBe(300);
    // Tras el TTL (150ms en tests; 60s en prod) el nuevo valor aplica SIN invalidate.
    await new Promise((r) => setTimeout(r, 200));
    expect(await getConfigNumber("llm", "daily_cap", 999)).toBe(42);
    await setCurrentValue("llm", "daily_cap", null);
  });

  it("clave inexistente → fallback (y no revienta)", async () => {
    expect(await getConfigNumber("nada", "no_existe", 7)).toBe(7);
    expect(await getConfigString("nada", "no_existe", "def")).toBe("def");
  });

  it("valor de tipo inválido → fallback con warning (fail predecible)", async () => {
    await setCurrentValue("llm", "daily_cap", '"no-soy-numero"');
    invalidateConfigCache();
    expect(await getConfigNumber("llm", "daily_cap", 300)).toBe(300);
    await setCurrentValue("llm", "daily_cap", null);
  });
});
