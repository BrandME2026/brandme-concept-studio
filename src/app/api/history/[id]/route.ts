import { NextResponse } from "next/server";
import { getGeneration } from "@/lib/db/history";
import { isDbConfigured } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { tenantRoute } from "@/lib/api/tenant-route";
import { captureError } from "@/lib/observability/observability";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const getHandler = tenantRoute<Ctx>(async (_req, { params }, { consultantId }) => {
  try {
    const { id } = await params;
    const record = await withTenant(consultantId, () => getGeneration(id));
    if (!record) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "No encontrado" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: record });
  } catch (err) {
    captureError(err, "[history] fallo obteniendo");
    return NextResponse.json(
      { success: false, error: { code: "HISTORY_FAILED", message: "Error" } },
      { status: 500 },
    );
  }
});

export async function GET(req: Request, ctx: Ctx) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { success: false, error: { code: "NO_DB", message: "Historial no disponible" } },
      { status: 404 },
    );
  }
  return getHandler(req, ctx);
}
