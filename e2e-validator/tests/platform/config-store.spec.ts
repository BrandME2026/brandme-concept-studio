import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import { MIGRATIONS_DB_URL } from "../../db-urls";

/**
 * COV_PF_CONFIG_001: Runtime Configuration — @platform @config (P1)
 *
 * .1 Un cambio en PlatformConfig aplica a las evaluaciones nuevas en <60s sin
 *    redeploy. El webServer corre con CONFIG_CACHE_TTL_MS=2000 (ver config) para
 *    observar la propagación en segundos; el contrato de producción es 60s.
 *
 * Vehículo: el cap `rate_limiting.leads_per_min` (default sembrado: 5). El rate
 * limit corre ANTES de validar el body, así que un POST vacío devuelve 400 si el
 * cap lo permite y 429 si no — perfecto para observar el cap vigente por IP.
 */

async function setLeadsCap(value: string | null): Promise<void> {
  const client = new Client({ connectionString: MIGRATIONS_DB_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE platform_config SET current_value = $1::jsonb, last_modified_at = now()
       WHERE feature_area = 'rate_limiting' AND config_key = 'leads_per_min'`,
      [value],
    );
  } finally {
    await client.end();
  }
}

/** POSTs a /api/leads desde una IP dada hasta recibir 429; devuelve cuántos pasaron. */
async function postsUntil429(ctx: APIRequestContext, ip: string, maxTries: number): Promise<number> {
  for (let i = 1; i <= maxTries; i++) {
    const res = await ctx.post("/api/leads", {
      headers: { "x-forwarded-for": ip },
      data: {},
    });
    if (res.status() === 429) return i - 1;
    expect(res.status(), "sin 429, el body vacío debe dar 400 (el rate limit va primero)").toBe(400);
  }
  return maxTries;
}

test.afterAll(async () => {
  await setLeadsCap(null); // restaurar: sin override de admin
});

test("@COV_PF_CONFIG_001.1 @platform @config — un cambio de config aplica en <60s sin redeploy", async ({}, testInfo) => {
  const ctx = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL! });

  // (a) El cap SEMBRADO en la DB gobierna la conducta: 5/min → el 6º request es 429.
  const allowedDefault = await postsUntil429(ctx, "10.99.0.1", 10);
  expect(allowedDefault, "con el default sembrado (5) deben pasar exactamente 5").toBe(5);

  // (b) Guardado de admin (UPDATE current_value=2) → aplica en <60s SIN redeploy.
  await setLeadsCap("2");
  const deadline = Date.now() + 55_000; // dentro del contrato de 60s
  let applied = false;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const allowed = await postsUntil429(ctx, `10.99.1.${attempt}`, 10); // IP fresca por intento
    if (allowed === 2) {
      applied = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  expect(applied, "el nuevo cap (2) debe gobernar dentro de la ventana de 60s").toBe(true);

  await ctx.dispose();
});
