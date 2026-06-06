import { NextResponse } from "next/server";
import { getPublicGeneration } from "@/lib/db/history";
import { isDbConfigured } from "@/lib/db/client";

export const runtime = "nodejs";

/** Página generada pública (referencia). Sin verificación de sesión. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isDbConfigured()) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "No encontrada" } },
      { status: 404 },
    );
  }
  try {
    const rec = await getPublicGeneration(id);
    if (!rec) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "No encontrada" } },
        { status: 404 },
      );
    }
    // Solo lo necesario para mostrar el preview (no exponemos session_id).
    return NextResponse.json({
      success: true,
      data: { id: rec.id, url: rec.url, name: rec.name, html: rec.html },
    });
  } catch (err) {
    console.error("[gallery/id] fallo", err);
    return NextResponse.json(
      { success: false, error: { code: "GALLERY_FAILED", message: "No se pudo cargar" } },
      { status: 500 },
    );
  }
}
