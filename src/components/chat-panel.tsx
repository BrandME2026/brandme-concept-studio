"use client";

import type { UIMessage } from "ai";
import { Button } from "@/components/ui/button";
import { ImageUploader } from "./image-uploader";

/**
 * Panel de chat. El estado vive en studio-client (para que sus mensajes Y el texto
 * pendiente alimenten el brief de la generación); aquí solo se renderiza y se delega.
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
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-hairline p-4">
        <span className="eyebrow text-body">Chat · afina la propuesta</span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-body">
            Describe cómo quieres tu diseño (“más oscuro”, “tipografía serif”,
            “estilo minimalista”). Lo que escribas aquí guiará la propuesta al
            pulsar <span className="font-mono uppercase">Generar</span>.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="eyebrow text-body">
              {m.role === "user" ? "Tú" : "IA"}
            </span>
            <div className="mt-1 rounded-sm border border-hairline p-3 leading-relaxed">
              {m.parts.map((part, i) =>
                part.type === "text" ? <span key={i}>{part.text}</span> : null,
              )}
            </div>
          </div>
        ))}
      </div>

      <ImageUploader images={images} onChange={onImagesChange} disabled={busy} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !busy) {
            onSend(input);
          }
        }}
        className="flex gap-2 border-t border-hairline p-4"
      >
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Escribe un mensaje…"
          className="flex-1 rounded-sm border border-hairline px-3 py-2 text-sm focus:border-accent-periwinkle focus:outline-none"
        />
        <Button type="submit" disabled={busy}>
          Enviar
        </Button>
      </form>
    </div>
  );
}
