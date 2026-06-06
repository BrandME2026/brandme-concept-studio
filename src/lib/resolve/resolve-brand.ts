import { generateObject } from "ai";
import { designModel } from "@/lib/ai/openrouter";
import { BRAND_RESOLVE_PROMPT } from "@/lib/ai/prompts";
import { resolveResultSchema } from "@/lib/schemas";
import { assertSafeUrl } from "@/lib/extract/ssrf-guard";

const VERIFY_TIMEOUT_MS = 8_000;

export type ResolveOutcome = { url: string } | { error: string };

/**
 * Verifica que la URL responde de verdad. HEAD primero (barato); si el servidor
 * no lo soporta, reintenta con GET. Sigue redirects y devuelve la URL final.
 * Devuelve la URL efectiva si responde (status < 400), o null si no.
 */
async function verifyReachable(url: string): Promise<string | null> {
  for (const method of ["HEAD", "GET"] as const) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
      });
      if (res.status < 400) return res.url || url;
      // 4xx/5xx con HEAD puede ser bloqueo de método; deja que GET lo intente.
    } catch {
      // timeout / DNS / TLS — prueba el siguiente método y, si no, falla.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Resuelve el nombre de una marca/cadena a la URL de su sitio oficial.
 * El LLM propone el dominio; se valida contra SSRF y se verifica que responde.
 * Sin fallback silencioso: si algo falla, devuelve { error } claro.
 */
export async function resolveBrandToUrl(query: string): Promise<ResolveOutcome> {
  let domain: string;
  let confidence: "high" | "low";
  try {
    const { object } = await generateObject({
      model: designModel,
      schema: resolveResultSchema,
      system: BRAND_RESOLVE_PROMPT,
      prompt: `Marca/cadena: "${query}"`,
    });
    domain = object.domain.trim();
    confidence = object.confidence;
  } catch (err) {
    console.error("[resolve] fallo del modelo", query, err);
    return { error: "No se pudo identificar la web. Intenta con la URL." };
  }

  if (confidence === "low" || !domain) {
    return { error: `No identifiqué la web oficial de "${query}". Pega su URL.` };
  }

  // El modelo devuelve solo el host; nosotros construimos la URL https.
  const candidate = `https://${domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;

  try {
    await assertSafeUrl(candidate);
  } catch {
    return { error: `No identifiqué la web oficial de "${query}". Pega su URL.` };
  }

  const reachable = await verifyReachable(candidate);
  if (!reachable) {
    return { error: `No pude abrir la web de "${query}". Pega su URL.` };
  }

  // La URL final tras redirects también debe ser segura (puede saltar de host).
  try {
    await assertSafeUrl(reachable);
  } catch {
    return { error: `No identifiqué la web oficial de "${query}". Pega su URL.` };
  }

  return { url: reachable };
}
