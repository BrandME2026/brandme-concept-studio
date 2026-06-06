"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { ImageUploader } from "./image-uploader";
import { useT } from "@/lib/i18n/context";

/**
 * Panel de chat con estética Coinbase (azul #0052ff, pills, redondeado) y layout
 * tipo ChatGPT: los mensajes crecen hacia arriba y el compositor queda fijo abajo.
 * El estado vive en studio-client (mensajes + input alimentan el brief de la generación).
 */
export function ChatPanel({
  messages,
  input,
  onInputChange,
  onSend,
  busy,
  images,
  onImagesChange,
}: {
  messages: UIMessage[];
  input: string;
  onInputChange: (v: string) => void;
  onSend: (text: string) => void;
  busy: boolean;
  images: string[];
  onImagesChange: (next: string[]) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = useT();

  // Auto-scroll al fondo cuando llegan mensajes (como ChatGPT).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function submit() {
    if (input.trim() && !busy) onSend(input);
  }

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* Header compacto */}
      <div className="flex items-center gap-2 border-b border-[--color-cb-hairline-soft] px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-[--color-cb-blue]" />
        <span className="text-sm font-semibold text-ink">{t("chat.header")}</span>
      </div>

      {/* Mensajes — crecen hacia arriba; el contenedor empuja al fondo */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-[--radius-cb] bg-[--color-cb-surface-soft] text-lg">
              ✦
            </span>
            <p className="max-w-[260px] text-sm text-body">{t("chat.empty")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => {
              const text = m.parts
                .filter((p) => p.type === "text")
                .map((p) => (p as { text: string }).text)
                .join("");
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-[--radius-cb] px-4 py-2.5 text-sm leading-relaxed ${
                      isUser
                        ? "bg-[--color-cb-blue] text-on-primary"
                        : "bg-[--color-cb-surface-soft] text-ink"
                    }`}
                  >
                    {text}
                  </div>
                </div>
              );
            })}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-[--radius-cb] bg-[--color-cb-surface-soft] px-4 py-2.5">
                  <span className="inline-flex gap-1">
                    <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compositor fijo abajo (estilo ChatGPT) */}
      <div className="border-t border-[--color-cb-hairline-soft] bg-canvas">
        <ImageUploader images={images} onChange={onImagesChange} disabled={busy} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="p-3"
        >
          <div className="flex items-end gap-2 rounded-[--radius-cb] border border-[--color-cb-hairline-soft] bg-[--color-cb-surface-soft] p-2 focus-within:border-[--color-cb-blue]">
            <textarea
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={t("chat.placeholder")}
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-pill bg-[--color-cb-blue] text-on-primary transition-colors hover:bg-[--color-cb-blue-active] disabled:opacity-40"
              aria-label={t("chat.send")}
            >
              ↑
            </button>
          </div>
          <p className="mt-1 px-1 text-[10px] text-muted">{t("chat.hint")}</p>
        </form>
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
      style={{ animationDelay: delay }}
    />
  );
}
