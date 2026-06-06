import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/session";
import {
  getConversation,
  saveConversation,
  deleteConversation,
} from "@/lib/db/conversations";
import { isDbConfigured } from "@/lib/db/client";

export const runtime = "nodejs";

const noDb = () =>
  NextResponse.json(
    { success: false, error: { code: "NO_DB", message: "No disponible" } },
    { status: 404 },
  );

/** Carga una conversación (rehidratar el chat). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDbConfigured()) return noDb();
  try {
    const { id } = await params;
    const sessionId = await getSessionId();
    const rec = await getConversation(id, sessionId);
    if (!rec) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "No encontrada" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: rec });
  } catch (err) {
    console.error("[conversations/id] GET fallo", err);
    return NextResponse.json(
      { success: false, error: { code: "GET_FAILED", message: "No se pudo cargar" } },
      { status: 500 },
    );
  }
}

/** Guarda mensajes / estado de la conversación. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDbConfigured()) return NextResponse.json({ success: true });
  try {
    const { id } = await params;
    const sessionId = await getSessionId();
    const patch = await req.json().catch(() => ({}));
    await saveConversation(id, sessionId, patch);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[conversations/id] PUT fallo", err);
    return NextResponse.json(
      { success: false, error: { code: "SAVE_FAILED", message: "No se pudo guardar" } },
      { status: 500 },
    );
  }
}

/** Borra la conversación. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDbConfigured()) return NextResponse.json({ success: true });
  try {
    const { id } = await params;
    const sessionId = await getSessionId();
    await deleteConversation(id, sessionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[conversations/id] DELETE fallo", err);
    return NextResponse.json(
      { success: false, error: { code: "DELETE_FAILED", message: "No se pudo borrar" } },
      { status: 500 },
    );
  }
}
