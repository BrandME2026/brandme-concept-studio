import { NextResponse } from "next/server";
import { resolveInputSchema } from "@/lib/schemas";
import { resolveBrandToUrl } from "@/lib/resolve/resolve-brand";
import { assertOpenRouterConfigured } from "@/lib/ai/openrouter";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    assertOpenRouterConfigured();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "NOT_CONFIGURED",
          message: "El servicio de IA no está configurado (falta OPENROUTER_API_KEY).",
        },
      },
      { status: 503 },
    );
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

  const parsed = resolveInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_QUERY",
          message: parsed.error.issues[0]?.message ?? "Consulta no válida",
        },
      },
      { status: 400 },
    );
  }

  const result = await resolveBrandToUrl(parsed.data.query);
  if ("error" in result) {
    return NextResponse.json(
      { success: false, error: { code: "UNRESOLVED", message: result.error } },
      { status: 422 },
    );
  }

  return NextResponse.json({ success: true, data: { url: result.url } });
}
