import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/session";
import { createConversation, listConversations } from "@/lib/db/conversations";
import { isDbConfigured } from "@/lib/db/client";

export const runtime = "nodejs";

/** Lista las conversaciones de la sesión. */
export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ success: true, data: [] });
  try {
    const sessionId = await getSessionId();
    const items = await listConversations(sessionId);
    return NextResponse.json({ success: true, data: items });
  } catch (err) {
    console.error("[conversations] fallo listando", err);
    return NextResponse.json(
      { success: false, error: { code: "LIST_FAILED", message: "No se pudo cargar" } },
      { status: 500 },
    );
  }
}

/** Crea una conversación nueva y devuelve su id. */
export async function POST() {
  if (!isDbConfigured()) {
    return NextResponse.json({ success: true, data: { id: null } });
  }
  try {
    const sessionId = await getSessionId();
    const id = await createConversation(sessionId);
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error("[conversations] fallo creando", err);
    return NextResponse.json(
      { success: false, error: { code: "CREATE_FAILED", message: "No se pudo crear" } },
      { status: 500 },
    );
  }
}
