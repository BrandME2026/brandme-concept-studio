import { NextResponse } from "next/server";
import { TenantContextError } from "@/lib/db/tenant-context";
import { requireConsultant } from "@/lib/tenant";
import { withObservabilityContext } from "@/lib/observability/observability";
import { checkConsultantRateLimit, tooMany, type LimitName } from "@/lib/security/rate-limit";
import { corsHeadersFor, isSameOrigin } from "@/lib/security/cors";

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
    // CORS (WO-32, AC-SEC-003.1): en endpoints autenticados, un origin cross
    // fuera de la allowlist no recibe ni headers CORS ni datos — 403 ANTES de
    // resolver identidad. Same-origin / sin Origin pasa directo.
    let corsHeaders: Record<string, string> | null = null;
    const origin = req.headers.get("origin");
    if (origin && !isSameOrigin(req)) {
      corsHeaders = await corsHeadersFor(origin);
      if (!corsHeaders) {
        return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
      }
    }

    let consultantId: string;
    try {
      const identity = await requireConsultant();
      // Gating del lifecycle (WO-5): una cuenta 'pending' (Stage 1 sin password)
      // no accede a superficies autenticadas; el portal redirige a la claim
      // screen con este código. Los consultants anónimos nacen 'active'.
      if (identity.accountState === "pending") {
        return NextResponse.json(
          { error: "Cuenta pendiente de activación", code: "ACCOUNT_PENDING" },
          { status: 403 },
        );
      }
      consultantId = identity.consultantId;
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
    const response = await withObservabilityContext(
      {
        surface: new URL(req.url).pathname,
        consultant_id: consultantId,
        role: "consultant",
      },
      () => handler(req, ctx, { consultantId }),
    );
    if (corsHeaders) {
      for (const [k, v] of Object.entries(corsHeaders)) response.headers.set(k, v);
    }
    return response;
  };
}
