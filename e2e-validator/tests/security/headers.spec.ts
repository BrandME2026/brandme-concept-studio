import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

/**
 * Gate anti-drift de headers de seguridad (WO-32, AC-SEC-002.4 / ADR-001 del
 * feature blueprint): estos asserts corren en cada deployment (WO-34 los mete
 * al merge gate). Quitar o debilitar un header ROMPE esta suite a propósito.
 */

let ctx: APIRequestContext;

test.beforeAll(async ({}, testInfo) => {
  ctx = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL! });
});

test.afterAll(async () => {
  await ctx?.dispose();
});

test("@platform @security — toda respuesta lleva el set base de headers", async () => {
  for (const path of ["/", "/api/gallery"]) {
    const res = await ctx.get(path, { headers: { accept: "text/html" } });
    const h = res.headers();
    expect(h["x-content-type-options"], `${path} nosniff`).toBe("nosniff");
    expect(h["referrer-policy"], `${path} referrer`).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], `${path} permissions`).toContain("camera=()");
    // HSTS (AC-SEC-002.2): 1 año mínimo + includeSubDomains + preload.
    const hsts = h["strict-transport-security"] ?? "";
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    expect(maxAge, `${path} HSTS max-age`).toBeGreaterThanOrEqual(31536000);
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toContain("preload");
  }
});

test("@platform @security — las páginas HTML llevan CSP con fuentes restringidas", async () => {
  const res = await ctx.get("/", { headers: { accept: "text/html" } });
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'");
  // Sin wildcard de scripts: solo los CDNs aprobados y documentados.
  expect(csp).not.toMatch(/script-src[^;]*\*/);
  expect(csp).toContain("cdn.tailwindcss.com");
});

test("@platform @security — /p/[slug] conserva su CSP sandbox propia", async () => {
  const res = await ctx.get("/p/no-existe-xyz");
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("sandbox allow-scripts");
});
