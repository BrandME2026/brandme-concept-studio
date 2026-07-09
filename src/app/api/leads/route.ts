import { NextResponse } from "next/server";
import { z } from "zod";
import { saveLead, slugExists, listLeadsForConsultant } from "@/lib/db/leads";
import { isDbConfigured } from "@/lib/db/client";
import { withSystemContext, withTenant } from "@/lib/db/tenant-context";
import { tenantRoute } from "@/lib/api/tenant-route";
import { checkRateLimit, clientKey, tooMany } from "@/lib/security/rate-limit";
import { captureError } from "@/lib/observability/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista los leads de las páginas del consultor (tenant de la sesión). Privado. */
const getHandler = tenantRoute(async (_req, _ctx, { consultantId }) => {
  try {
    const leads = await withTenant(consultantId, () => listLeadsForConsultant());
    return NextResponse.json({ success: true, data: leads });
  } catch (err) {
    captureError(err, "[leads] fallo listando");
    return NextResponse.json({ success: true, data: [] });
  }
});

export async function GET(req: Request, ctx: unknown) {
  if (!isDbConfigured()) {
    return NextResponse.json({ success: true, data: [] });
  }
  return getHandler(req, ctx);
}

// Captura de interesados desde una página pública. SIN sesión (el visitante es
// anónimo): corre bajo withSystemContext y el lead se asigna al dueño del slug.
const leadSchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().default(""),
  // email opcional, pero si viene debe tener formato válido (string vacío permitido).
  email: z
    .string()
    .trim()
    .max(160)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Correo no válido")
    .optional()
    .default(""),
  message: z.string().trim().max(2000).optional().default(""),
  source: z.enum(["form", "agent"]).default("form"),
  // Honeypot anti-bot: campo oculto que un humano deja vacío. No lo validamos con max(0)
  // a propósito (eso daría pistas al bot); si viene relleno, respondemos 200 silencioso.
  website: z.string().optional().default(""),
});

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

export async function POST(request: Request) {
  // Rate-limit PRIMERO (frena el abuso aunque la DB esté caída).
  const rl = await checkRateLimit("leads", `leads:${clientKey(request)}`);
  if (!rl.ok) return tooMany(rl.retryAfter);

  if (!isDbConfigured()) return fail("NO_DB", "No disponible", 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("BAD_JSON", "Cuerpo inválido", 400);
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return fail("INVALID", parsed.error.issues[0]?.message ?? "Datos inválidos", 400);
  }
  const data = parsed.data;

  // Honeypot relleno → es un bot. Respondemos 200 para no darle pistas, pero no guardamos.
  if (data.website) return NextResponse.json({ success: true, data: { ok: true } });

  // Hace falta al menos un medio de contacto real.
  if (!data.phone && !data.email) {
    return fail("NO_CONTACT", "Deja un teléfono o un correo", 400);
  }

  try {
    const saved = await withSystemContext("lead-capture", async () => {
      if (!(await slugExists(data.slug))) return false;
      await saveLead({
        slug: data.slug,
        brand: null,
        city: null,
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        message: data.message || null,
        source: data.source,
      });
      return true;
    });
    if (!saved) return fail("NOT_FOUND", "Página no encontrada", 404);
    return NextResponse.json({ success: true, data: { ok: true } });
  } catch (err) {
    captureError(err, "[leads] fallo guardando");
    return fail("SAVE_FAILED", "No se pudo registrar", 500);
  }
}
