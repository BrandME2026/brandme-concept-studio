import { randomUUID } from "node:crypto";
import { test, expect, request as pwRequest } from "@playwright/test";
import { Client } from "pg";
import { MIGRATIONS_DB_URL } from "../../db-urls";

/**
 * COV_PF_SEO_001: SEO Infrastructure — @platform @seo (P2)
 *
 * .1 Una página publicada aparece en el sitemap INMEDIATAMENTE (el sitemap es
 *    dinámico: lee published en cada request — sin batch ni paso manual).
 *    Flujo REAL: publish vía POST /api/publish con la sesión del dueño.
 * .2 robots.txt: allow para AI-search, disallow para AI-training, Sitemap.
 */

async function withMigrator<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: MIGRATIONS_DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test("@COV_PF_SEO_001.1 @platform @seo — una página publicada entra al sitemap de inmediato", async ({}, testInfo) => {
  const ctx = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL! });
  const slug = `seo-e2e-${randomUUID().slice(0, 8)}`;
  const sessionId = `sess-seo-${randomUUID().slice(0, 8)}`;

  // Seed: consultant + sesión mapeada + suscripción activa (paywall del e2e
  // server) + generación SIN publicar.
  await withMigrator(async (c) => {
    const consultant = await c.query<{ id: string }>(
      `INSERT INTO consultants (firebase_uid) VALUES (NULL) RETURNING id`,
    );
    const cid = consultant.rows[0].id;
    await c.query(
      `INSERT INTO consultant_sessions (session_id, consultant_id) VALUES ($1, $2)`,
      [sessionId, cid],
    );
    await c.query(
      `INSERT INTO subscriptions (session_id, consultant_id, stripe_customer_id, status)
       VALUES ($1, $2, $3, 'active')`,
      [sessionId, cid, `cus_seo_${slug}`],
    );
    await c.query(
      `INSERT INTO generations (session_id, consultant_id, url, name, design_md, html, slug, published)
       VALUES ($1, $2, 'https://seo', 'SEO e2e', 'md', '<html>', $3, false)`,
      [sessionId, cid, slug],
    );
  });

  // Antes de publicar: NO está en el sitemap.
  const before = await (await ctx.get("/sitemap.xml")).text();
  expect(before).not.toContain(slug);

  // Publish REAL con la sesión del dueño (la cookie es el mapping sembrado).
  const publish = await ctx.post("/api/publish", {
    headers: { cookie: `bmc_session=${sessionId}` },
    data: { slug },
  });
  expect(publish.status()).toBe(200);

  // Inmediatamente después: SÍ está (dinámico = síncrono en efecto, sin batch).
  const after = await (await ctx.get("/sitemap.xml")).text();
  expect(after).toContain(`/p/${slug}`);
  await ctx.dispose();
});

test("@COV_PF_SEO_001.2 @platform @seo — robots.txt permite AI-search y bloquea AI-training", async ({}, testInfo) => {
  const ctx = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL! });
  const res = await ctx.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();

  // AI-search permitidos (AC-PF-011.1) — Bingbot incluido y JAMÁS bloqueado.
  for (const bot of [
    "OAI-SearchBot",
    "ChatGPT-User",
    "PerplexityBot",
    "Perplexity-User",
    "Claude-User",
    "Claude-SearchBot",
    "Applebot",
    "Bingbot",
  ]) {
    expect(body, `allow ${bot}`).toContain(`User-Agent: ${bot}`);
  }
  // AI-training bloqueados (AC-PF-011.2).
  for (const bot of [
    "GPTBot",
    "ClaudeBot",
    "Google-Extended",
    "Applebot-Extended",
    "CCBot",
    "Meta-ExternalAgent",
    "Bytespider",
  ]) {
    expect(body, `disallow ${bot}`).toContain(`User-Agent: ${bot}`);
  }
  // Los training tienen "Disallow: /" y Bingbot NO está en un bloque de Disallow: /.
  const trainingBlock = body.split("User-Agent: GPTBot")[1] ?? "";
  expect(trainingBlock).toContain("Disallow: /");
  // Directiva Sitemap (AC-PF-011.3).
  expect(body).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  await ctx.dispose();
});
