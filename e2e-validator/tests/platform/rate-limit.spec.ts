import { randomUUID } from "node:crypto";
import { test, expect, request as pwRequest } from "@playwright/test";
import { Client } from "pg";
import { MIGRATIONS_DB_URL } from "../../db-urls";

/**
 * COV_PF_RATE_001: Rate Limiting — @platform @ratelimit (P1)
 *
 * .1 Exceder el cap de una surface devuelve 429 con Retry-After y NO ejecuta
 *    lógica de negocio. Contra la ruta real POST /api/leads (cap sembrado
 *    5/min por IP): los bodies son inválidos a propósito — si el rate limit
 *    dejara pasar, la ruta respondería 400 tras validar; el 429 llega ANTES.
 */

async function leadsCount(): Promise<number> {
  const client = new Client({ connectionString: MIGRATIONS_DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM leads`);
    return Number(rows[0].n);
  } finally {
    await client.end();
  }
}

test("@COV_PF_RATE_001.1 @platform @ratelimit — exceder el cap: 429 + Retry-After y cero negocio", async ({}, testInfo) => {
  // config-store.spec corre antes y manipula el cap de leads; el server cachea
  // config con CONFIG_CACHE_TTL_MS=2000 — esperar a que expire para leer el
  // default sembrado (5/min) y que el test sea determinista.
  await new Promise((r) => setTimeout(r, 2_500));
  const ctx = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL! });
  const ip = `10.77.0.${Math.floor(Math.random() * 200) + 1}-${randomUUID().slice(0, 4)}`;
  const before = await leadsCount();

  // Cap default de leads = 5/min por IP. Las primeras 5 pasan el rate limit
  // (400 por body inválido = la validación corrió); la 6ª debe ser 429.
  for (let i = 1; i <= 5; i++) {
    const res = await ctx.post("/api/leads", {
      headers: { "x-forwarded-for": ip },
      data: {},
    });
    expect(res.status(), `petición ${i} dentro del cap`).toBe(400);
  }
  const sixth = await ctx.post("/api/leads", {
    headers: { "x-forwarded-for": ip },
    data: {},
  });
  expect(sixth.status()).toBe(429);
  const retryAfter = sixth.headers()["retry-after"];
  expect(retryAfter, "429 debe llevar Retry-After").toBeTruthy();
  expect(Number(retryAfter)).toBeGreaterThan(0);

  // Cero lógica de negocio: ninguna fila nueva en leads en todo el test.
  expect(await leadsCount()).toBe(before);
  await ctx.dispose();
});
