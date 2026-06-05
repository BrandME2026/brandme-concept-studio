import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/session";
import { getGeneration } from "@/lib/db/history";
import { isDbConfigured } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { success: false, error: { code: "NO_DB", message: "Historial no disponible" } },
      { status: 404 },
    );
  }
  try {
    const { id } = await params;
    const sessionId = await getSessionId();
    const record = await getGeneration(id, sessionId);
    if (!record) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "No encontrado" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: record });
  } catch (err) {
    console.error("[history] fallo obteniendo", err);
    return NextResponse.json(
      { success: false, error: { code: "HISTORY_FAILED", message: "Error" } },
      { status: 500 },
    );
  }
}
