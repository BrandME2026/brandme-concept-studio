import { NextResponse } from "next/server";
import { z } from "zod";
import { saveLead, slugExists, listLeadsForSession } from "@/lib/db/leads";
import { isDbConfigured } from "@/lib/db/client";
import { getSessionId } from "@/lib/session";
import { rateLimit, clientKey, tooMany, LIMITS } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista los leads de las páginas del consultor (sesión actual). Privado. */
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ success: true, data: [] });
  }
  try {
    const sessionId = await getSessionId();
    const leads = await listLeadsForSession(sessionId);
    return NextResponse.json({ success: true, data: leads });
  } catch (err) {
    console.error("[leads] fallo listando", err);
    return NextResponse.json({ success: true, data: [] });
  }
}

// Captura de interesados desde una página pública. SIN sesión (el visitante es anónimo).
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
  const rl = rateLimit(`leads:${clientKey(request)}`, LIMITS.leads);
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
    if (!(await slugExists(data.slug))) return fail("NOT_FOUND", "Página no encontrada", 404);
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
    return NextResponse.json({ success: true, data: { ok: true } });
  } catch (err) {
    console.error("[leads] fallo guardando", err);
    return fail("SAVE_FAILED", "No se pudo registrar", 500);
  }
}
