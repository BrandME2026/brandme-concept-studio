import { NextResponse } from "next/server";
import { readSessionId } from "@/lib/session";
import { createConversation, listConversations } from "@/lib/db/conversations";
import { isDbConfigured } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { tenantRoute } from "@/lib/api/tenant-route";

export const runtime = "nodejs";

/** Lista las conversaciones del consultor (tenant de la sesión). */
const getHandler = tenantRoute(async (_req, _ctx, { consultantId }) => {
  try {
    const items = await withTenant(consultantId, () => listConversations());
    return NextResponse.json({ success: true, data: items });
  } catch (err) {
    console.error("[conversations] fallo listando", err);
    return NextResponse.json(
      { success: false, error: { code: "LIST_FAILED", message: "No se pudo cargar" } },
      { status: 500 },
    );
  }
});

export async function GET(req: Request, ctx: unknown) {
  if (!isDbConfigured()) return NextResponse.json({ success: true, data: [] });
  return getHandler(req, ctx);
}

/** Crea una conversación nueva y devuelve su id. */
const postHandler = tenantRoute(async (_req, _ctx, { consultantId }) => {
  try {
    const sessionId = (await readSessionId())!; // tenantRoute garantiza cookie
    const id = await withTenant(consultantId, () => createConversation(sessionId));
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error("[conversations] fallo creando", err);
    return NextResponse.json(
      { success: false, error: { code: "CREATE_FAILED", message: "No se pudo crear" } },
      { status: 500 },
    );
  }
});

export async function POST(req: Request, ctx: unknown) {
  if (!isDbConfigured()) {
    return NextResponse.json({ success: true, data: { id: null } });
  }
  return postHandler(req, ctx);
}
