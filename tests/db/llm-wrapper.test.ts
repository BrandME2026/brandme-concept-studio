import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { resetAndMigrate } from "./harness";
import { withMigrator } from "./db-util";
import { invalidateConfigCache } from "../../src/lib/config/config-store";
import type { AIModelProvider, ModelRequestOptions } from "../../src/lib/ai/model-provider";
import { llmBudgetBreaker } from "../../src/lib/ai/llm-budget-breaker";
import {
  invokeLLM,
  LLMBudgetExceededError,
  LLMStaticPromptError,
  LLMTelemetryError,
  LLMUnknownAliasError,
} from "../../src/lib/ai/llm-wrapper";

/**
 * WO-4 / REQ-PF-016: el wrapper REAL contra la DB REAL, con transporte fake
 * (MockLanguageModelV3 — cero tokens gastados). El provider fake captura el
 * modelo y las opciones (fallbacks/TTL) que el wrapper le pide.
 */

process.env.CONFIG_CACHE_TTL_MS = "150";

interface CapturedCall {
  modelName: string;
  opts: ModelRequestOptions;
}

function makeFakeProvider(calls: CapturedCall[]): AIModelProvider {
  return {
    name: "fake",
    languageModel(modelName, opts) {
      calls.push({ modelName, opts });
      return new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: "stop" as const, raw: undefined },
          usage: {
            inputTokens: { total: 120, noCache: 75, cacheRead: 30, cacheWrite: 15 },
            outputTokens: { total: 45, text: 45, reasoning: 0 },
          },
          content: [{ type: "text" as const, text: "respuesta fake" }],
          warnings: [],
        }),
      });
    },
  };
}

async function setLlmConfig(key: string, valueJson: string | null) {
  await withMigrator((c) =>
    c.query(
      `UPDATE platform_config SET current_value = $2::jsonb WHERE feature_area = 'llm' AND config_key = $1`,
      [key, valueJson],
    ),
  );
}

let calls: CapturedCall[];
let provider: AIModelProvider;

beforeAll(async () => {
  await resetAndMigrate();
});

beforeEach(() => {
  calls = [];
  provider = makeFakeProvider(calls);
  invalidateConfigCache();
  llmBudgetBreaker.__resetForTests();
});

const BASE = {
  system: "Eres un asistente de pruebas. Instrucciones estáticas.",
  prompt: "Contexto del consultor va aquí: hola",
};

describe("aliases (AC-PF-016.1/.2)", () => {
  it("resuelve large/fast desde ConfigStore (defaults sembrados)", async () => {
    const large = await invokeLLM({ ...BASE, alias: "large", provider });
    expect(large.resolvedModel).toBe("anthropic/claude-sonnet-4.6");
    const fast = await invokeLLM({ ...BASE, alias: "fast", provider });
    expect(fast.resolvedModel).toBe("anthropic/claude-haiku-4.5");
    expect(calls.map((c) => c.modelName)).toEqual([
      "anthropic/claude-sonnet-4.6",
      "anthropic/claude-haiku-4.5",
    ]);
  });

  it("un remap de alias por admin aplica sin deploy", async () => {
    await setLlmConfig("alias_fast", '"deepseek/deepseek-v4-flash"');
    invalidateConfigCache();
    const r = await invokeLLM({ ...BASE, alias: "fast", provider });
    expect(r.resolvedModel).toBe("deepseek/deepseek-v4-flash");
    await setLlmConfig("alias_fast", null);
  });

  it("alias desconocido → error temprano sin invocar el provider", async () => {
    await expect(
      invokeLLM({ ...BASE, alias: "gigante" as never, provider }),
    ).rejects.toThrow(LLMUnknownAliasError);
    expect(calls).toHaveLength(0);
  });
});

describe("cache_control explícito (AC-PF-016.6 / COV_PF_LLM_016.1)", () => {
  it("realtime → TTL 5m; batch → TTL 1h (nunca el default del provider)", async () => {
    await invokeLLM({ ...BASE, alias: "large", mode: "realtime", provider });
    await invokeLLM({ ...BASE, alias: "large", mode: "batch", provider });
    expect(calls[0].opts.cacheTtl).toBe("5m");
    expect(calls[1].opts.cacheTtl).toBe("1h");
  });

  it("los TTLs vienen de ConfigStore (cambiables sin deploy)", async () => {
    await setLlmConfig("cache_ttl_interactive", '"1h"');
    invalidateConfigCache();
    await invokeLLM({ ...BASE, alias: "fast", mode: "realtime", provider });
    expect(calls[0].opts.cacheTtl).toBe("1h");
    await setLlmConfig("cache_ttl_interactive", null);
  });
});

describe("system prompt estático (AC-PF-016.5 / COV_PF_LLM_016.2)", () => {
  it("rechaza system con el consultant_id de la llamada, sin invocar el modelo", async () => {
    const cid = "0b0e8a34-1111-2222-3333-444455556666";
    await expect(
      invokeLLM({
        alias: "fast",
        system: `Eres el asistente del consultor ${cid}.`,
        prompt: "hola",
        consultantId: cid,
        provider,
      }),
    ).rejects.toThrow(LLMStaticPromptError);
    expect(calls).toHaveLength(0);
  });

  it("rechaza system con UUID o email (señales de contenido tenant-scoped)", async () => {
    await expect(
      invokeLLM({ ...BASE, alias: "fast", system: "Usa el vault 9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f", provider }),
    ).rejects.toThrow(LLMStaticPromptError);
    await expect(
      invokeLLM({ ...BASE, alias: "fast", system: "Escribe a shawn@getbrandme.ai", provider }),
    ).rejects.toThrow(LLMStaticPromptError);
    expect(calls).toHaveLength(0);
  });
});

describe("telemetría LLMInvocation (AC-PF-016.3 / COV_PF_LLM_016.3)", () => {
  it("cada invocación escribe una fila con modelo resuelto y token buckets", async () => {
    const r = await invokeLLM({
      ...BASE,
      alias: "large",
      mode: "batch",
      agentId: "agent-test",
      provider,
    });
    const { rows } = await withMigrator((c) =>
      c.query(
        `SELECT model_alias, resolved_model_name, input_tokens, output_tokens,
                cache_read_tokens, cache_write_ttl_variant, invocation_mode, agent_id,
                latency_ms, estimated_cost_usd::float8 AS cost
         FROM llm_invocations WHERE id = $1`,
        [r.invocationId],
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model_alias: "large",
      resolved_model_name: "anthropic/claude-sonnet-4.6",
      input_tokens: 120,
      output_tokens: 45,
      cache_read_tokens: 30,
      cache_write_ttl_variant: "1hour",
      invocation_mode: "batch",
      agent_id: "agent-test",
    });
    const { rows: cw } = await withMigrator((c) =>
      c.query<{ cache_write_tokens: number }>(
        `SELECT cache_write_tokens FROM llm_invocations WHERE id = $1`,
        [r.invocationId],
      ),
    );
    expect(cw[0].cache_write_tokens).toBe(15);
    expect(rows[0].cost).toBe(0); // sin pricing configurado (Cost Model pendiente)
  });

  it("el costo se calcula con rates de ConfigStore cuando existen", async () => {
    await setLlmConfig(
      "pricing",
      '{"anthropic/claude-haiku-4.5": {"input_per_mtok": 1, "output_per_mtok": 5, "cache_read_per_mtok": 0.1}}',
    );
    invalidateConfigCache();
    const r = await invokeLLM({ ...BASE, alias: "fast", provider });
    // 120/1M*1 + 45/1M*5 + 30/1M*0.1 = 0.000120 + 0.000225 + 0.000003 = 0.000348
    expect(r.estimatedCostUsd).toBeCloseTo(0.000348, 6);
    await setLlmConfig("pricing", null);
  });

  it("si la escritura de telemetría falla, la invocación es un hard error", async () => {
    await withMigrator((c) => c.query(`REVOKE INSERT ON llm_invocations FROM brandme_app`));
    try {
      await expect(invokeLLM({ ...BASE, alias: "fast", provider })).rejects.toThrow(
        LLMTelemetryError,
      );
    } finally {
      await withMigrator((c) => c.query(`GRANT INSERT ON llm_invocations TO brandme_app`));
    }
  });
});

describe("LLMBudgetBreaker (techo de gasto diario)", () => {
  it("sin cap configurado (null) no gatea", async () => {
    llmBudgetBreaker.track(999);
    await expect(invokeLLM({ ...BASE, alias: "fast", provider })).resolves.toBeTruthy();
  });

  it("con cap alcanzado rechaza ANTES de invocar el provider", async () => {
    await setLlmConfig("daily_cost_cap_usd", "0.5");
    invalidateConfigCache();
    llmBudgetBreaker.track(0.6); // gasto simulado del día
    await expect(invokeLLM({ ...BASE, alias: "fast", provider })).rejects.toThrow(
      LLMBudgetExceededError,
    );
    expect(calls).toHaveLength(0);
    await setLlmConfig("daily_cost_cap_usd", null);
  });
});
