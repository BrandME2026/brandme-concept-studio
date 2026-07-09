import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * WO-1 / AC-PF-016.6: el TTL de prompt caching debe setearse SIEMPRE explícito
 * (nunca el default del provider). Verificamos que getDesignModel y chatModel
 * configuran cache_control con el TTL esperado por modo.
 *
 * Estrategia: espiar la fábrica del provider OpenRouter para capturar las
 * opciones con que se construye cada modelo, sin hacer llamadas de red.
 */

const modelCalls: Array<{ model: string; options: Record<string, unknown> }> = [];

vi.mock("@openrouter/ai-sdk-provider", () => {
  // El provider es una función callable (openrouter(model, opts)) que además
  // expone .chat(model, opts). Capturamos ambas formas de construcción.
  const factory = (model: string, options: Record<string, unknown> = {}) => {
    modelCalls.push({ model, options });
    return { __model: model, __options: options };
  };
  factory.chat = (model: string, options: Record<string, unknown> = {}) => {
    modelCalls.push({ model, options });
    return { __model: model, __options: options };
  };
  return { createOpenRouter: () => factory };
});

describe("prompt caching — TTL explícito (AC-PF-016.6)", () => {
  beforeEach(() => {
    vi.resetModules();
    modelCalls.length = 0;
    process.env.OPENROUTER_API_KEY = "sk-or-test";
  });
  afterEach(() => {
    delete process.env.OPENROUTER_CACHE_TTL_INTERACTIVE;
    delete process.env.OPENROUTER_CACHE_TTL_BATCH;
  });

  it("getDesignModel interactivo usa cache_control ephemeral con TTL 5m", async () => {
    const { getDesignModel } = await import("./openrouter");
    await getDesignModel("alta", "interactive");
    const last = modelCalls.at(-1)!;
    expect(last.options.cache_control).toEqual({ type: "ephemeral", ttl: "5m" });
  });

  it("getDesignModel batch usa cache_control ephemeral con TTL 1h", async () => {
    const { getDesignModel } = await import("./openrouter");
    await getDesignModel("alta", "batch");
    const last = modelCalls.at(-1)!;
    expect(last.options.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("chatModel se construye con cache_control ephemeral (TTL interactivo)", async () => {
    await import("./openrouter");
    // chatModel se construye al importar el módulo; debe haber un call con cache_control.
    const withCache = modelCalls.filter(
      (c) => (c.options.cache_control as { type?: string })?.type === "ephemeral",
    );
    expect(withCache.length).toBeGreaterThan(0);
  });

  it("el TTL es configurable por env (nunca el default del provider)", async () => {
    process.env.OPENROUTER_CACHE_TTL_INTERACTIVE = "1h";
    const { getDesignModel } = await import("./openrouter");
    await getDesignModel("alta", "interactive");
    const last = modelCalls.at(-1)!;
    expect(last.options.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });
});
