#!/usr/bin/env node
// Puebla la galería generando páginas REALES vía el pipeline de producción
// (extract con Playwright → generate con LLM). No es mock: cada página sale del
// flujo real y se persiste sola en Postgres (saveGeneration). Uso puntual.
//
// Uso:  node scripts/seed-gallery.mjs [indiceInicio] [cuantas]
//   sin args = todas. Ej: `node scripts/seed-gallery.mjs 0 1` genera solo la 1ª.

const BASE =
  process.env.SEED_BASE ??
  "https://brandme-concept-studio-production.up.railway.app";

// Mix de 3 categorías, ciudades variadas de EEUU. brand = lo que el LLM resuelve
// a URL; city personaliza el SEO (h1, copy, JSON-LD local).
const FRANCHISES = [
  { brand: "McDonald's", city: "Miami", positioning: "QSR familiar, rapidez y valor" },
  { brand: "Subway", city: "Chicago", positioning: "sándwiches frescos al gusto" },
  { brand: "Domino's Pizza", city: "Dallas", positioning: "pizza a domicilio rápida" },
  { brand: "Anytime Fitness", city: "Austin", positioning: "gimnasio 24/7 de barrio" },
  { brand: "Orangetheory Fitness", city: "Los Angeles", positioning: "entrenamiento por intervalos guiado" },
  { brand: "Great Clips", city: "Phoenix", positioning: "peluquería sin cita, rápida y accesible" },
  { brand: "The UPS Store", city: "Seattle", positioning: "envíos, impresión y buzones para negocios" },
  { brand: "Planet Fitness", city: "Denver", positioning: "gimnasio económico sin juicios" },
];

async function postJSON(path, body, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(to);
  }
}

async function resolveBrand(brand) {
  const res = await postJSON("/api/resolve", { query: brand }, 40000);
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.success) throw new Error(`resolve falló: ${j?.error?.message ?? res.status}`);
  return j.data.url;
}

async function extract(url) {
  const res = await postJSON("/api/extract", { url }, 120000);
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.success) throw new Error(`extract falló: ${j?.error?.message ?? res.status}`);
  return j.data; // { tokens, screenshot, ... }
}

// Consume el stream NDJSON de /api/generate hasta el evento done.
async function generate({ tokens, screenshot, brand, city, positioning }) {
  const res = await postJSON(
    "/api/generate",
    {
      tokens,
      screenshot,
      brief: "Propón un diseño inspirado en esta web.",
      language: "es",
      images: [],
      quality: "alta",
      seo: { brand, city, positioning },
    },
    240000,
  );
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null);
    throw new Error(`generate falló: ${j?.error?.message ?? res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = null;
  for (;;) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let evt;
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }
      if (evt.type === "error") throw new Error(`generate error: ${evt.message}`);
      if (evt.type === "done") done = evt;
    }
  }
  if (!done) throw new Error("generate terminó sin evento done");
  return done; // { slug, brand, city, proposal, ... }
}

async function one(f, i, total) {
  const tag = `[${i + 1}/${total}] ${f.brand} (${f.city})`;
  const t0 = Date.now();
  console.log(`${tag} · resolviendo marca…`);
  const url = await resolveBrand(f.brand);
  console.log(`${tag} · url: ${url} · extrayendo…`);
  const data = await extract(url);
  console.log(`${tag} · extraído · generando (LLM, ~2-3min)…`);
  const done = await generate({
    tokens: data.tokens,
    screenshot: data.screenshot,
    brand: f.brand,
    city: f.city,
    positioning: f.positioning,
  });
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`${tag} · ✅ LISTA en ${secs}s · slug: ${done.slug ?? "(uuid)"} → ${BASE}/p/${done.slug ?? ""}`);
  return done;
}

async function main() {
  const start = Number(process.argv[2] ?? 0);
  const count = process.argv[3] ? Number(process.argv[3]) : FRANCHISES.length - start;
  const list = FRANCHISES.slice(start, start + count);
  console.log(`Generando ${list.length} franquicias contra ${BASE}\n`);
  const ok = [];
  const fail = [];
  for (let i = 0; i < list.length; i++) {
    try {
      const r = await one(list[i], start + i, FRANCHISES.length);
      ok.push({ brand: list[i].brand, slug: r.slug });
    } catch (err) {
      console.error(`[${start + i + 1}] ${list[i].brand} · ❌ ${err.message}`);
      fail.push({ brand: list[i].brand, error: err.message });
    }
  }
  console.log(`\n=== RESUMEN ===`);
  console.log(`OK: ${ok.length} · Fallos: ${fail.length}`);
  ok.forEach((o) => console.log(`  ✅ ${o.brand} → /p/${o.slug ?? "(uuid)"}`));
  fail.forEach((f) => console.log(`  ❌ ${f.brand}: ${f.error}`));
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
