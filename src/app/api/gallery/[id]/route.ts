import { NextResponse } from "next/server";
import { getPublicGeneration } from "@/lib/db/history";
import { getPublicConversationPage } from "@/lib/db/conversations";
import { isDbConfigured } from "@/lib/db/client";
import { isStripeConfigured } from "@/lib/stripe/client";
import { withSystemContext } from "@/lib/db/tenant-context";
import { captureError } from "@/lib/observability/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    // Primero en la galería (generations); si no, en conversaciones compartidas.
    // Con paywall activo NO se usa el fallback de conversations (sin gate propio),
    // mismo criterio que p/[slug]/route.ts.
    const enforce = isStripeConfigured();
    const rec = await withSystemContext(
      "galeria-detalle",
      async () =>
        (await getPublicGeneration(id, enforce)) ??
        (enforce ? null : await getPublicConversationPage(id)),
    );
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
    captureError(err, "[gallery/id] fallo");
    return NextResponse.json(
      { success: false, error: { code: "GALLERY_FAILED", message: "No se pudo cargar" } },
      { status: 500 },
    );
  }
}
