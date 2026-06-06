import { NextResponse } from "next/server";
import { listAllGenerations, countAllGenerations } from "@/lib/db/history";
import { isDbConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
// Lee la DB en runtime — sin esto Next hornea la respuesta en build (sin DATABASE_URL
// → items vacíos cacheados). El sitemap ya usa este mismo flag por la misma razón.
export const dynamic = "force-dynamic";

/**
 * Galería pública: todas las páginas generadas (referencia). Sin sesión. La home
 * nunca falla: sin DB devuelve vacío.
 */
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ success: true, data: { items: [], total: 0 } });
  }
  try {
    // count es secundario: si falla, no debe vaciar la galería (defensa en profundidad).
    const items = await listAllGenerations();
    const total = await countAllGenerations().catch(() => items.length);
    return NextResponse.json({ success: true, data: { items, total } });
  } catch (err) {
    console.error("[gallery] fallo listando", err);
    // La galería es decorativa en la home: ante fallo, vacío en vez de romper.
    return NextResponse.json({ success: true, data: { items: [], total: 0 } });
  }
}
