import { compile } from "tailwindcss";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { captureError } from "@/lib/observability/observability";

/**
 * Compila el CSS de Tailwind para un HTML concreto, EN EL SERVIDOR al generar la página.
 * Así el documento público sirve CSS puro en un <style> en vez del CDN-JIT de Tailwind
 * (que compila en el navegador y dispara el LCP). Mejora directa de Core Web Vitals/SEO.
 *
 * El motor base de Tailwind se reutiliza entre invocaciones (su carga es lo caro). Cada
 * build() es rápido. Si algo falla, devuelve null → el documento cae al CDN (fallback).
 */

const TW_ROOT = path.resolve(process.cwd(), "node_modules/tailwindcss");

async function loadStylesheet(id: string, base: string) {
  if (id === "tailwindcss") {
    return { path: "tailwindcss", base, content: await readFile(path.join(TW_ROOT, "index.css"), "utf-8") };
  }
  // imports internos del paquete (theme.css, utilities.css, preflight.css…)
  const rel = id.replace(/^tailwindcss\//, "");
  const file = path.resolve(TW_ROOT, rel);
  return { path: file, base, content: await readFile(file, "utf-8") };
}

// Cache del compilador base (independiente del HTML): se construye una vez por proceso.
let compilerPromise: ReturnType<typeof compile> | null = null;
function getCompiler() {
  if (!compilerPromise) {
    compilerPromise = compile('@import "tailwindcss";', {
      base: process.cwd(),
      loadStylesheet,
    });
  }
  return compilerPromise;
}

/** Extrae los candidatos de clase de los atributos class="..." del HTML. */
function extractCandidates(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) set.add(c);
  }
  return [...set];
}

/**
 * Devuelve el CSS mínimo para el HTML, o null si falla (el caller usa el CDN como fallback).
 */
export async function compileTailwindForHtml(html: string): Promise<string | null> {
  try {
    const candidates = extractCandidates(html);
    if (candidates.length === 0) return null;
    const compiler = await getCompiler();
    const css = compiler.build(candidates);
    return css && css.length > 0 ? css : null;
  } catch (err) {
    captureError(err, "[compile-css] fallo compilando Tailwind, se usará el CDN");
    return null;
  }
}
