import { NextResponse } from "next/server";
import { listAllGenerations, countAllGenerations } from "@/lib/db/history";
import { isDbConfigured } from "@/lib/db/client";

export const runtime = "nodejs";

/**
 * Galería pública: todas las páginas generadas (referencia). Sin sesión. La home
 * nunca falla: sin DB devuelve vacío.
 */
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ success: true, data: { items: [], total: 0 } });
  }
  try {
    const [items, total] = await Promise.all([
      listAllGenerations(),
      countAllGenerations(),
    ]);
    return NextResponse.json({ success: true, data: { items, total } });
  } catch (err) {
    console.error("[gallery] fallo listando", err);
    // La galería es decorativa en la home: ante fallo, vacío en vez de romper.
    return NextResponse.json({ success: true, data: { items: [], total: 0 } });
  }
}
