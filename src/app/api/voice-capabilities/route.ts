import { NextResponse } from "next/server";
import { isOpenAIConfigured } from "@/lib/ai/openai";

export const runtime = "nodejs";

/**
 * Reporta si la voz (STT + TTS) está disponible en el servidor. El cliente lo consulta
 * para no mostrar los controles de voz cuando OPENAI_API_KEY no está configurada
 * (evita botones que fallan en silencio). No expone secretos: solo un booleano.
 */
export function GET() {
  return NextResponse.json(
    { success: true, data: { voice: isOpenAIConfigured() } },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
