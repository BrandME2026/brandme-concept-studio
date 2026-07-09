import { NextResponse } from "next/server";
import { listGenerations } from "@/lib/db/history";
import { isDbConfigured } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { tenantRoute } from "@/lib/api/tenant-route";

export const runtime = "nodejs";

const getHandler = tenantRoute(async (_req, _ctx, { consultantId }) => {
  try {
    const items = await withTenant(consultantId, () => listGenerations());
    return NextResponse.json({ success: true, data: items });
  } catch (err) {
    console.error("[history] fallo listando", err);
    return NextResponse.json(
      { success: false, error: { code: "HISTORY_FAILED", message: "No se pudo cargar el historial" } },
      { status: 500 },
    );
  }
});

export async function GET(req: Request, ctx: unknown) {
  if (!isDbConfigured()) {
    return NextResponse.json({ success: true, data: [] });
  }
  return getHandler(req, ctx);
}
