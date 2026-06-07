import { NextResponse } from "next/server";
import { urlInputSchema } from "@/lib/schemas";
import { extractDesign } from "@/lib/extract/extract-design";
import { assertSafeUrl } from "@/lib/extract/ssrf-guard";
import {
  rateLimit,
  clientKey,
  llmBudget,
  tooMany,
  budgetExceeded,
  LIMITS,
  acquireExtractSlot,
  releaseExtractSlot,
} from "@/lib/security/rate-limit";

// Playwright requiere el runtime de Node (no edge).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  // Anti-abuso: rate-limit por IP + tope diario (es pesado en RAM) + semáforo de concurrencia.
  const rl = rateLimit(`extract:${clientKey(request)}`, LIMITS.extract);
  if (!rl.ok) return tooMany(rl.retryAfter);
  if (!llmBudget.tryConsume()) {
    console.warn("[extract] tope diario alcanzado", llmBudget.status());
    return budgetExceeded();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "BAD_JSON", message: "Cuerpo inválido" } },
      { status: 400 },
    );
  }

  const parsed = urlInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_URL",
          message: parsed.error.issues[0]?.message ?? "URL no válida",
        },
      },
      { status: 400 },
    );
  }

  // SSRF: resolver DNS y bloquear si la URL apunta (directa o por rebinding) a la red interna.
  try {
    await assertSafeUrl(parsed.data.url);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: "BLOCKED_HOST", message: "Esa URL no está permitida." },
      },
      { status: 400 },
    );
  }

  // Semáforo: limita los browsers de Playwright simultáneos (protege la RAM).
  if (!acquireExtractSlot()) {
    return NextResponse.json(
      { success: false, error: { code: "BUSY", message: "Servicio ocupado, intenta en unos segundos." } },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }
  try {
    const data = await extractDesign(parsed.data.url);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[extract] fallo extrayendo", parsed.data.url, err);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "EXTRACTION_FAILED",
          message:
            "No se pudo analizar la web. Puede bloquear bots o tardar demasiado.",
        },
      },
      { status: 502 },
    );
  } finally {
    releaseExtractSlot();
  }
}
