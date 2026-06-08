"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type RecState = "idle" | "recording" | "transcribing";

/** Elige un mimeType de grabación soportado por el navegador (Safari no soporta webm). */
function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

// Soporte de voz como "external store": en SSR siempre false; en el cliente se calcula la
// capacidad real. Evita el hydration mismatch sin setState-en-effect (regla del compiler).
const emptySubscribe = () => () => {};
const getSupportedClient = () =>
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaRecorder !== "undefined" &&
  pickMime() !== "";
const getSupportedServer = () => false;

/**
 * Voz para el chat: grabación de micrófono → transcripción (Whisper vía /api/speech-to-text)
 * y reproducción de respuestas (TTS vía /api/text-to-speech). Degrada solo si el navegador
 * no soporta getUserMedia/MediaRecorder.
 */
export function useVoice(opts?: { language?: string }) {
  const language = opts?.language;
  const [recState, setRecState] = useState<RecState>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resolveRef = useRef<((text: string) => void) | null>(null);

  // false en SSR/primer render (sin mismatch); capacidad real tras hidratar.
  const browserSupported = useSyncExternalStore(
    emptySubscribe,
    getSupportedClient,
    getSupportedServer,
  );

  // El server debe tener OPENAI_API_KEY para STT/TTS; si no, no mostramos los
  // controles de voz (evita botones que fallan en silencio con 503).
  const [serverReady, setServerReady] = useState(false);
  useEffect(() => {
    if (!browserSupported) return;
    let cancelled = false;
    fetch("/api/voice-capabilities")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setServerReady(Boolean(j?.data?.voice));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [browserSupported]);

  const supported = browserSupported && serverReady;

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /** Inicia la grabación. Devuelve una promesa que resuelve con el texto al parar. */
  const start = useCallback(async (): Promise<string> => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mediaRef.current = rec;

      const done = new Promise<string>((resolve) => {
        resolveRef.current = resolve;
      });

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        cleanupStream();
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        if (blob.size === 0) {
          setRecState("idle");
          resolveRef.current?.("");
          return;
        }
        setRecState("transcribing");
        try {
          const form = new FormData();
          form.append("audio", blob, "audio.webm");
          if (language) form.append("language", language);
          const res = await fetch("/api/speech-to-text", { method: "POST", body: form });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "stt");
          resolveRef.current?.((json.data.text as string) ?? "");
        } catch (e) {
          setError(e instanceof Error ? e.message : "stt");
          resolveRef.current?.("");
        } finally {
          setRecState("idle");
        }
      };

      rec.start();
      setRecState("recording");
      return done;
    } catch (e) {
      cleanupStream();
      setRecState("idle");
      // getUserMedia lanza NotAllowedError si el usuario deniega el permiso.
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "denied" : "mic");
      return "";
    }
  }, [cleanupStream, language]);

  /** Detiene la grabación en curso (dispara onstop → transcripción). */
  const stop = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
  }, []);

  /** Reproduce el texto en voz (TTS). */
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    try {
      const res = await fetch("/api/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return; // degradación silenciosa (ej. 503 sin clave)
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      setSpeaking(true);
      await audio.play();
    } catch {
      setSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
  }, []);

  return { supported, recState, speaking, error, start, stop, speak, stopSpeaking };
}
