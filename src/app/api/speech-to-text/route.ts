import { NextResponse } from "next/server";
import { transcribeAudio, isOpenAIConfigured } from "@/lib/ai/openai";
import { checkRateLimit, clientKey, tooMany } from "@/lib/security/rate-limit";
import { captureError } from "@/lib/observability/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 10_000_000; // ~10MB
const ALLOWED = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"];

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

/** Transcribe el audio del usuario (Whisper). Recibe multipart con campo `audio`. */
export async function POST(req: Request) {
  const rl = await checkRateLimit("speech", `speech:${clientKey(req)}`);
  if (!rl.ok) return tooMany(rl.retryAfter);

  if (!isOpenAIConfigured()) return fail("NO_AUDIO", "Voz no configurada", 503);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("BAD_FORM", "Cuerpo inválido", 400);
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) return fail("NO_AUDIO_FILE", "Falta el audio", 400);
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return fail("BAD_SIZE", "Audio vacío o demasiado grande", 400);
  }
  // mime puede venir con codecs (audio/webm;codecs=opus): comparamos el prefijo.
  const mime = (audio.type || "audio/webm").split(";")[0]!.trim();
  if (!ALLOWED.includes(mime)) return fail("BAD_TYPE", "Formato de audio no soportado", 400);

  const lang = (form.get("language") as string) || undefined;
  const ext = mime.split("/")[1] ?? "webm";

  try {
    const text = await transcribeAudio(audio, `audio.${ext}`, lang);
    return NextResponse.json({ success: true, data: { text } });
  } catch (err) {
    captureError(err, "[speech-to-text] fallo");
    return fail("STT_FAILED", "No se pudo transcribir", 500);
  }
}
