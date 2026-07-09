import { NextResponse } from "next/server";
import {
  getConversation,
  saveConversation,
  deleteConversation,
} from "@/lib/db/conversations";
import { isDbConfigured } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { tenantRoute } from "@/lib/api/tenant-route";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const noDb = () =>
  NextResponse.json(
    { success: false, error: { code: "NO_DB", message: "No disponible" } },
    { status: 404 },
  );

/** Carga una conversación (rehidratar el chat). RLS garantiza que es del tenant. */
const getHandler = tenantRoute<Ctx>(async (_req, { params }, { consultantId }) => {
  try {
    const { id } = await params;
    const rec = await withTenant(consultantId, () => getConversation(id));
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
});

export async function GET(req: Request, ctx: Ctx) {
  if (!isDbConfigured()) return noDb();
  return getHandler(req, ctx);
}

/** Guarda mensajes / estado de la conversación. */
const putHandler = tenantRoute<Ctx>(async (req, { params }, { consultantId }) => {
  try {
    const { id } = await params;
    const patch = await req.json().catch(() => ({}));
    await withTenant(consultantId, () => saveConversation(id, patch));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[conversations/id] PUT fallo", err);
    return NextResponse.json(
      { success: false, error: { code: "SAVE_FAILED", message: "No se pudo guardar" } },
      { status: 500 },
    );
  }
});

export async function PUT(req: Request, ctx: Ctx) {
  if (!isDbConfigured()) return NextResponse.json({ success: true });
  return putHandler(req, ctx);
}

/** Borra la conversación. */
const deleteHandler = tenantRoute<Ctx>(async (_req, { params }, { consultantId }) => {
  try {
    const { id } = await params;
    await withTenant(consultantId, () => deleteConversation(id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[conversations/id] DELETE fallo", err);
    return NextResponse.json(
      { success: false, error: { code: "DELETE_FAILED", message: "No se pudo borrar" } },
      { status: 500 },
    );
  }
});

export async function DELETE(req: Request, ctx: Ctx) {
  if (!isDbConfigured()) return NextResponse.json({ success: true });
  return deleteHandler(req, ctx);
}
