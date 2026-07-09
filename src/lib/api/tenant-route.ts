import { NextResponse } from "next/server";
import { TenantContextError } from "@/lib/db/tenant-context";
import { requireConsultantId } from "@/lib/tenant";
import { withObservabilityContext } from "@/lib/observability/observability";
import { checkConsultantRateLimit, tooMany, type LimitName } from "@/lib/security/rate-limit";

/**
 * Wrapper de route handlers autenticados (WO-3, AC-PF-001.4): resuelve el
 * tenant ANTES de ejecutar el handler; sin sesión → 401 sin tocar datos.
 * El handler decide dónde abrir withTenant() (bloques cortos: nunca abarcar
 * awaits no-DB como streaming LLM).
 *
 * opts.limit (WO-9, AC-PF-019.5): aplica la dimensión consultant_id del rate
 * limit tras resolver la identidad — la dimensión IP corre en la entrada de la
 * ruta; ambas aplican al mismo request y la primera alcanzada corta con 429.
 */
export function tenantRoute<Ctx = unknown>(
  handler: (
    req: Request,
    ctx: Ctx,
    tenant: { consultantId: string },
  ) => Promise<Response>,
  opts: { limit?: LimitName } = {},
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
    if (opts.limit) {
      const rl = await checkConsultantRateLimit(opts.limit, consultantId);
      if (!rl.ok) return tooMany(rl.retryAfter);
    }
    // Tags EP-04 automáticos (WO-8): todo captureError dentro del handler
    // hereda surface + consultant + role sin que el caller los setee.
    return withObservabilityContext(
      {
        surface: new URL(req.url).pathname,
        consultant_id: consultantId,
        role: "consultant",
      },
      () => handler(req, ctx, { consultantId }),
    );
  };
}
