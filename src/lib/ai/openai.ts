/**
 * Cliente directo de OpenAI para AUDIO (Whisper STT + TTS). OpenRouter NO ofrece audio,
 * por eso esto va contra la API de OpenAI con la clave propia OPENAI_API_KEY.
 * fetch directo (sin el SDK `openai`) para no inflar dependencias: son 2 llamadas simples.
 */

const OPENAI_API = "https://api.openai.com/v1";

const STT_MODEL = process.env.OPENAI_STT_MODEL ?? "whisper-1";
const TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
const TTS_VOICE = process.env.OPENAI_TTS_VOICE ?? "alloy";

/** Límite de caracteres del TTS (acota coste y latencia). */
const TTS_MAX_CHARS = 4000;

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function apiKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY no configurada");
  return k;
}

/** Transcribe audio a texto con Whisper. `file` es el blob recibido del navegador. */
export async function transcribeAudio(
  file: Blob,
  filename = "audio.webm",
  language?: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("model", STT_MODEL);
  if (language) form.append("language", language);

  const res = await fetch(`${OPENAI_API}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Whisper ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

/** Sintetiza voz (mp3) a partir de texto con la API TTS de OpenAI. */
export async function synthesizeSpeech(text: string, voice = TTS_VOICE): Promise<ArrayBuffer> {
  const input = text.slice(0, TTS_MAX_CHARS);
  const res = await fetch(`${OPENAI_API}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: TTS_MODEL, voice, input, response_format: "mp3" }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`TTS ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}
