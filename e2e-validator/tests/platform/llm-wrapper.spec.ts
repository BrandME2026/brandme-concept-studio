import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { APP_DB_URL } from "../../db-urls";

/**
 * COV_PF_LLM_016: LLM Wrapper — @platform @ai @cost (P0)
 *
 * Nivel de integración: se ejercita el LLMWrapper REAL contra la base REAL
 * (rol de app, telemetría incluida) con TRANSPORTE mock (MockLanguageModelV3
 * inyectado vía la interfaz AIModelProvider/EP-05) — cero tokens gastados y
 * cero dependencia de OPENROUTER_API_KEY. Ninguna ruta del prototipo usa el
 * wrapper aún (out of scope del WO-4): no existe superficie HTTP que ejercitar.
 */

process.env.DATABASE_URL = APP_DB_URL;
process.env.CONFIG_CACHE_TTL_MS = "1000";

import { MockLanguageModelV3 } from "ai/test";
import type { AIModelProvider, ModelRequestOptions } from "../../../src/lib/ai/model-provider";
import {
  invokeLLM,
  LLMStaticPromptError,
} from "../../../src/lib/ai/llm-wrapper";

interface CapturedCall {
  modelName: string;
  opts: ModelRequestOptions;
}

function makeFakeProvider(calls: CapturedCall[]): AIModelProvider {
  return {
    name: "fake-e2e",
    languageModel(modelName, opts) {
      calls.push({ modelName, opts });
      return new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: "stop" as const, raw: undefined },
          usage: {
            inputTokens: { total: 200, noCache: 150, cacheRead: 50, cacheWrite: 25 },
            outputTokens: { total: 80, text: 80, reasoning: 0 },
          },
          content: [{ type: "text" as const, text: "ok e2e" }],
          warnings: [],
        }),
      });
    },
  };
}

const BASE = {
  system: "Instrucciones estáticas del agente de prueba.",
  prompt: "Contexto específico va aquí.",
};

test("@COV_PF_LLM_016.1 @platform @ai @cost — toda llamada lleva cache_control TTL explícito por modo", async () => {
  const calls: CapturedCall[] = [];
  const provider = makeFakeProvider(calls);
  await invokeLLM({ ...BASE, alias: "fast", mode: "realtime", provider });
  await invokeLLM({ ...BASE, alias: "fast", mode: "batch", provider });
  expect(calls[0].opts.cacheTtl).toBe("5m");
  expect(calls[1].opts.cacheTtl).toBe("1h");
  // Ninguna llamada sin TTL explícito (jamás el default del provider).
  for (const call of calls) expect(["5m", "1h"]).toContain(call.opts.cacheTtl);
});

test("@COV_PF_LLM_016.2 @platform @ai — un system prompt con datos de tenant se rechaza ANTES de invocar el modelo", async () => {
  const calls: CapturedCall[] = [];
  const provider = makeFakeProvider(calls);
  await expect(
    invokeLLM({
      alias: "fast",
      system: "Responde como asistente del consultor con email juan@franquicias.mx",
      prompt: "hola",
      provider,
    }),
  ).rejects.toThrow(LLMStaticPromptError);
  expect(calls, "el provider nunca debe ser invocado").toHaveLength(0);
});

test("@COV_PF_LLM_016.3 @platform @cost — cada invocación escribe su LLMInvocation", async () => {
  const calls: CapturedCall[] = [];
  const provider = makeFakeProvider(calls);
  const r = await invokeLLM({ ...BASE, alias: "large", agentId: "e2e-agent", provider });

  const client = new Client({ connectionString: APP_DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT resolved_model_name, input_tokens, output_tokens, cache_read_tokens,
              cache_write_tokens, invocation_mode, agent_id
       FROM llm_invocations WHERE id = $1`,
      [r.invocationId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      resolved_model_name: r.resolvedModel,
      input_tokens: 200,
      output_tokens: 80,
      cache_read_tokens: 50,
      cache_write_tokens: 25,
      invocation_mode: "realtime",
      agent_id: "e2e-agent",
    });
  } finally {
    await client.end();
  }
});
