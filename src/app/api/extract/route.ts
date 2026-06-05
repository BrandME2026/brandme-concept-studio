import { NextResponse } from "next/server";
import { urlInputSchema } from "@/lib/schemas";
import { extractDesign } from "@/lib/extract/extract-design";

// Playwright requiere el runtime de Node (no edge).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
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
  }
}
