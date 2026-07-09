import { NextResponse } from "next/server";
import { z } from "zod";
import { synthesizeSpeech, isOpenAIConfigured } from "@/lib/ai/openai";
import { checkRateLimit, clientKey, tooMany } from "@/lib/security/rate-limit";
import { captureError } from "@/lib/observability/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ text: z.string().trim().min(1).max(4000) });

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

/** Sintetiza voz (mp3) a partir de texto. Devuelve el audio directo (audio/mpeg). */
export async function POST(req: Request) {
  const rl = await checkRateLimit("speech", `speech:${clientKey(req)}`);
  if (!rl.ok) return tooMany(rl.retryAfter);

  if (!isOpenAIConfigured()) return fail("NO_AUDIO", "Voz no configurada", 503);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_JSON", "Cuerpo inválido", 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail("INVALID", "Texto requerido", 400);

  try {
    const audio = await synthesizeSpeech(parsed.data.text);
    return new Response(audio, {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    captureError(err, "[text-to-speech] fallo");
    return fail("TTS_FAILED", "No se pudo generar el audio", 500);
  }
}
