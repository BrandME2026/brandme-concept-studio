import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTE_MANIFEST } from "../../src/lib/api/route-manifest";

/**
 * AC-PF-002.3: "cuando un cambio introduce un endpoint sin tenant filtering, la
 * suite falla con un error descriptivo identificando el endpoint desprotegido".
 * Implementación: todo route.ts/sitemap.ts de src/app y toda página server que
 * importe la capa db DEBE tener una entrada en ROUTE_MANIFEST. Un endpoint nuevo
 * sin clasificar rompe CI nombrándolo.
 */

// Override SOLO para el drill del merge gate (e2e-validator/tests/ci): permite
// correr el registro contra una COPIA del árbol con un endpoint ofensor, sin
// mutar src/ (mutarlo en vivo tumba el dev server del e2e).
const APP_DIR =
  process.env.ENDPOINT_REGISTRY_APP_DIR ?? join(__dirname, "..", "..", "src", "app");

function discoverEndpoints(): string[] {
  const files = readdirSync(APP_DIR, { recursive: true }) as string[];
  const endpoints = new Set<string>();
  for (const file of files) {
    const normalized = file.split("\\").join("/");
    if (/(^|\/)route\.ts$/.test(normalized)) {
      endpoints.add(normalized.replace(/\/?route\.ts$/, "").replace(/\/$/, ""));
    } else if (normalized === "sitemap.ts") {
      endpoints.add("sitemap");
    }
  }
  return [...endpoints].filter(Boolean).sort();
}

/** Páginas server que tocan la capa db (se mantienen a mano; el grep del review las audita). */
const DB_PAGES = [
  "c/[conversationId]",
  "webs",
  "[consultantSlug]/[brandSlug]", // BrandMePage pública (WO-15)
  "preview/[token]", // preview time-limited (WO-15)
];

describe("registro de endpoints (manifiesto de aislamiento)", () => {
  it("todo endpoint descubierto está clasificado en ROUTE_MANIFEST (reporta por nombre)", () => {
    const known = new Set(ROUTE_MANIFEST.map((e) => e.route));
    const missing = [...discoverEndpoints(), ...DB_PAGES].filter((e) => !known.has(e));
    expect(
      missing,
      `Endpoints SIN clasificación de aislamiento (añádelos a src/lib/api/route-manifest.ts con una decisión tenant/public-system/no-db): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("el manifiesto no tiene entradas huérfanas (rutas que ya no existen)", () => {
    const discovered = new Set([...discoverEndpoints(), ...DB_PAGES]);
    const orphans = ROUTE_MANIFEST.filter((e) => !discovered.has(e.route)).map((e) => e.route);
    expect(orphans, `Entradas del manifiesto sin ruta real: ${orphans.join(", ")}`).toEqual([]);
  });

  it("no hay rutas duplicadas en el manifiesto", () => {
    const seen = new Set<string>();
    const dupes = ROUTE_MANIFEST.filter((e) => {
      if (seen.has(e.route)) return true;
      seen.add(e.route);
      return false;
    }).map((e) => e.route);
    expect(dupes).toEqual([]);
  });
});
