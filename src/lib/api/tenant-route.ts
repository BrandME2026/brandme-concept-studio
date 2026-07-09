import { NextResponse } from "next/server";
import { TenantContextError } from "@/lib/db/tenant-context";
import { requireConsultantId } from "@/lib/tenant";

/**
 * Wrapper de route handlers autenticados (WO-3, AC-PF-001.4): resuelve el
 * tenant ANTES de ejecutar el handler; sin sesión → 401 sin tocar datos.
 * El handler decide dónde abrir withTenant() (bloques cortos: nunca abarcar
 * awaits no-DB como streaming LLM).
 */
export function tenantRoute<Ctx = unknown>(
  handler: (
    req: Request,
    ctx: Ctx,
    tenant: { consultantId: string },
  ) => Promise<Response>,
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    let consultantId: string;
    try {
      consultantId = await requireConsultantId();
    } catch (err) {
      if (err instanceof TenantContextError) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
      }
      throw err;
    }
    return handler(req, ctx, { consultantId });
  };
}
