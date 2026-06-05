import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/session";
import { listGenerations } from "@/lib/db/history";
import { isDbConfigured } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ success: true, data: [] });
  }
  try {
    const sessionId = await getSessionId();
    const items = await listGenerations(sessionId);
    return NextResponse.json({ success: true, data: items });
  } catch (err) {
    console.error("[history] fallo listando", err);
    return NextResponse.json(
      { success: false, error: { code: "HISTORY_FAILED", message: "No se pudo cargar el historial" } },
      { status: 500 },
    );
  }
}
