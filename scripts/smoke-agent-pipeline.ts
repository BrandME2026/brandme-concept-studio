/**
 * Smoke test E2E del pipeline de agentes con TRANSPORTES REALES (WO-13+WO-15):
 * scraper Playwright real contra un sitio público de franquicias + LLM real
 * (OpenRouter, alias large) → BrandExtraction → BrandMePage publicada.
 *
 * Uso: npx tsx scripts/smoke-agent-pipeline.ts <brand-url>
 * Requiere: docker DB de test arriba (pnpm db:up) + OPENROUTER_API_KEY en .env.local.
 * Costo real: ~2 invocaciones LLM (Agente 02 + Agente 04) ≈ centavos de USD.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Cargar .env.local (OPENROUTER_*) sin dependencias extra.
for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
process.env.DATABASE_URL = "postgres://brandme_app:app@localhost:54329/brandme";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Uso: npx tsx scripts/smoke-agent-pipeline.ts <brand-url>");
    process.exit(1);
  }

  const { Client } = await import("pg");
  const { runBrandExtraction } = await import("../src/lib/extraction/pipeline");
  const { generateBrandMePage } = await import("../src/lib/brandmepage/generation-pipeline");
  const { approvePage } = await import("../src/lib/brandmepage/lifecycle");

  // Consultant de smoke (vía migrator: seed de identidad).
  const migrator = new Client({
    connectionString: "postgres://brandme_migrator:migrator@localhost:54329/brandme",
  });
  await migrator.connect();
  const { rows } = await migrator.query<{ id: string }>(
    `INSERT INTO consultants (firebase_uid) VALUES (NULL) RETURNING id`,
  );
  const uid = `smoke-${Date.now().toString(36)}`;
  await migrator.query(`INSERT INTO users (id, display_name) VALUES ($1, 'Junior Rojas')`, [uid]);
  await migrator.query(`UPDATE consultants SET firebase_uid = $1 WHERE id = $2`, [uid, rows[0].id]);
  await migrator.end();
  const consultantId = rows[0].id;
  console.log(`→ consultant de smoke: ${consultantId}`);

  console.log(`→ Agente 02 (extracción REAL): ${url}`);
  const t0 = Date.now();
  const extraction = await runBrandExtraction({ url, consultantId });
  console.log(
    `   status=${extraction.status} degradation=${extraction.degradationFlag} failure=${extraction.failureClass} (${Math.round((Date.now() - t0) / 1000)}s)`,
  );
  if (extraction.status === "failed") {
    console.error("   La extracción falló terminal — revisa el health record.");
    process.exit(2);
  }

  console.log(`→ Agente 04 (generación REAL de la página)`);
  const t1 = Date.now();
  const page = await generateBrandMePage({
    consultantId,
    brandId: extraction.brandId,
    publish: true,
  });
  console.log(
    `   state=${page.state} slugs=/${page.consultantSlug}/${page.brandSlug} (${Math.round((Date.now() - t1) / 1000)}s)`,
  );

  if (page.state === "pending_approval") {
    await approvePage(page.pageId);
    console.log(`   aprobada → published`);
  }

  console.log(`\n✅ Pipeline completo OK`);
  console.log(`   Página:  http://localhost:3105/${page.consultantSlug}/${page.brandSlug}`);
  console.log(`   Preview: http://localhost:3105/preview/${page.previewToken}`);
  console.log(`   llms:    http://localhost:3105/${page.consultantSlug}/${page.brandSlug}/llms.txt`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Smoke test falló:", err);
  process.exit(1);
});
