import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import { MIGRATIONS_DB_URL } from "../../db-urls";

/**
 * COV_ASK_001: Discoverability Content — @platform @seo (P2)
 *
 * .1 llms.txt se renderiza POR FASE: refleja PLATFORM_PHASE (ConfigStore, sin
 *    deploy) y lista la sección Developer Access. + El index de skills gatea
 *    por fase y los accesos quedan en el crawler access log (REQ-SKL-001).
 */

async function setPhase(valueJson: string | null): Promise<void> {
  const client = new Client({ connectionString: MIGRATIONS_DB_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE platform_config SET current_value = $1::jsonb
       WHERE feature_area = 'discoverability' AND config_key = 'platform_phase'`,
      [valueJson],
    );
  } finally {
    await client.end();
  }
}

let ctx: APIRequestContext;

test.beforeAll(async ({}, testInfo) => {
  ctx = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL! });
});

test.afterAll(async () => {
  await setPhase(null);
  await ctx?.dispose();
});

test("@COV_ASK_001.1 @platform @seo — llms.txt refleja la fase y lista Developer Access", async () => {
  // Fase default sembrada: closed_development.
  const initial = await (await ctx.get("/llms.txt")).text();
  expect(initial).toContain("Instructions for AI Agents");
  expect(initial).toContain("closed development");
  expect(initial).toContain("## Developer Access");
  expect(initial).toContain("/.well-known/skills/index.json");

  // Cambio de fase por el admin (UPDATE) → aplica sin deploy en <60s
  // (CONFIG_CACHE_TTL_MS=2000 en el server e2e; poll acotado).
  await setPhase('"friendly_beta"');
  await expect
    .poll(
      async () => (await (await ctx.get("/llms.txt")).text()).includes("friendly beta"),
      { timeout: 15_000, intervals: [1_000] },
    )
    .toBe(true);
});

test("@platform @seo — /.well-known/skills gatea por fase y registra el acceso", async () => {
  await setPhase(null); // closed_development
  await expect
    .poll(
      async () => {
        const idx = await (
          await ctx.get("/.well-known/skills/index.json", {
            headers: { "user-agent": "Claude-SearchBot/1.0 (+https://anthropic.com)" },
          })
        ).json();
        return idx.platform_phase;
      },
      { timeout: 15_000, intervals: [1_000] },
    )
    .toBe("closed_development");

  const index = await (
    await ctx.get("/.well-known/skills/index.json", {
      headers: { "user-agent": "Claude-SearchBot/1.0 (+https://anthropic.com)" },
    })
  ).json();
  expect(index.skills).toEqual([]); // gate: nada publicado en closed_development
  const missing = await ctx.get("/.well-known/skills/ama.md");
  expect(missing.status()).toBe(404);

  // El acceso quedó clasificado en el crawler access log (REQ-SKL-001).
  const client = new Client({ connectionString: MIGRATIONS_DB_URL });
  await client.connect();
  try {
    await expect
      .poll(async () => {
        const { rows } = await client.query(
          `SELECT count(*)::int AS n FROM crawler_access_logs
           WHERE crawler_name = 'Claude-SearchBot' AND path LIKE '/.well-known/skills/%'`,
        );
        return rows[0].n;
      }, { timeout: 10_000 })
      .toBeGreaterThan(0);
  } finally {
    await client.end();
  }
});
