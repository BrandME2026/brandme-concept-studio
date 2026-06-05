"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { DesignTokens } from "@/types/design";
import { Button } from "@/components/ui/button";

export function ChatPanel({ tokens }: { tokens: DesignTokens }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Los tokens viajan en cada request; el server los añade al system prompt.
      body: { tokens },
    }),
  });

  const busy = status === "streaming" || status === "submitted";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-hairline p-4">
        <span className="eyebrow text-body">Chat</span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-body">
            Pregunta sobre el diseño o pide ajustes antes de generar la propuesta.
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !busy) {
            sendMessage({ text: input });
            setInput("");
          }
        }}
        className="flex gap-2 border-t border-hairline p-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
