import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Regresión: assertOpenRouterConfigured debe lanzar cuando falta la key,
 * para que las rutas la conviertan en un 503 estructurado (no un 500 crudo).
 */
describe("assertOpenRouterConfigured", () => {
  const original = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    process.env.OPENROUTER_API_KEY = original;
  });

  it("lanza si no hay OPENROUTER_API_KEY", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { assertOpenRouterConfigured } = await import("./openrouter");
    expect(() => assertOpenRouterConfigured()).toThrow(/OPENROUTER_API_KEY/);
  });

  it("no lanza si la key está presente", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const { assertOpenRouterConfigured } = await import("./openrouter");
    expect(() => assertOpenRouterConfigured()).not.toThrow();
  });
});
