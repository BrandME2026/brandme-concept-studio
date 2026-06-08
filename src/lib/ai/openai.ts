/**
 * Cliente de AUDIO (STT + TTS). OpenRouter ya ofrece audio con API compatible-OpenAI,
 * así que por defecto reusamos la MISMA clave OPENROUTER_API_KEY (ya configurada para el
 * LLM) — sin necesidad de una clave de OpenAI aparte. Si se define OPENAI_API_KEY, se usa
 * la API directa de OpenAI (opcional, para quien la prefiera).
 * fetch directo (sin SDK) para no inflar dependencias: son 2 llamadas simples.
 */

const OPENROUTER_API = "https://openrouter.ai/api/v1";
const OPENAI_API = "https://api.openai.com/v1";

// Modelos por defecto (configurables por env). En OpenRouter conviene un STT barato/rápido
// (Groq Whisper) y un TTS económico (Gemini Flash / GPT-4o Mini TTS).
const STT_MODEL = process.env.AUDIO_STT_MODEL ?? "openai/whisper-1";
const TTS_MODEL = process.env.AUDIO_TTS_MODEL ?? "openai/gpt-4o-mini-tts";
const TTS_VOICE = process.env.AUDIO_TTS_VOICE ?? "alloy";

/** Límite de caracteres del TTS (acota coste y latencia). */
const TTS_MAX_CHARS = 4000;

/** ¿Hay alguna clave de audio? OpenRouter (preferida) u OpenAI directa. */
export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
}

/** Endpoint + clave para audio: OpenRouter por defecto; OpenAI solo si se forzó su clave. */
function audioProvider(): { base: string; key: string; model: { stt: string; tts: string } } {
  // Preferimos OpenRouter (reusa la key del LLM). Solo usamos OpenAI directo si NO hay
  // key de OpenRouter pero sí de OpenAI.
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    return { base: OPENROUTER_API, key: orKey, model: { stt: STT_MODEL, tts: TTS_MODEL } };
  }
  const oaKey = process.env.OPENAI_API_KEY;
  if (oaKey) {
    // En OpenAI directo los ids no llevan el prefijo "openai/".
    return {
      base: OPENAI_API,
      key: oaKey,
      model: { stt: STT_MODEL.replace(/^openai\//, ""), tts: TTS_MODEL.replace(/^openai\//, "") },
    };
  }
  throw new Error("Audio no configurado: falta OPENROUTER_API_KEY u OPENAI_API_KEY");
}

/** Transcribe audio a texto (STT). `file` es el blob recibido del navegador. */
export async function transcribeAudio(
  file: Blob,
  filename = "audio.webm",
  language?: string,
): Promise<string> {
  const { base, key, model } = audioProvider();
  const form = new FormData();
  form.append("file", file, filename);
  form.append("model", model.stt);
  if (language) form.append("language", language);

  const res = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`STT ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

/** Sintetiza voz (mp3) a partir de texto (TTS). */
export async function synthesizeSpeech(text: string, voice = TTS_VOICE): Promise<ArrayBuffer> {
  const { base, key, model } = audioProvider();
  const input = text.slice(0, TTS_MAX_CHARS);
  const res = await fetch(`${base}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: model.tts, voice, input, response_format: "mp3" }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`TTS ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}
