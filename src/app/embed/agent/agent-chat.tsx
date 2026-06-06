"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

const T = {
  es: {
    greeting: "¡Hola! ¿Te interesa esta franquicia? Pregúntame lo que quieras.",
    placeholder: "Escribe tu pregunta…",
    send: "Enviar",
  },
  en: {
    greeting: "Hi! Interested in this franchise? Ask me anything.",
    placeholder: "Type your question…",
    send: "Send",
  },
};

function text(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function AgentChat({
  slug,
  brand,
  city,
  lang,
}: {
  slug: string;
  brand: string;
  city: string;
  lang: "es" | "en";
}) {
  const t = T[lang];
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/agent",
      body: { slug, brand, city, language: lang },
    }),
  });
  const busy = status === "submitted" || status === "streaming";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v || busy) return;
    sendMessage({ text: v });
    setInput("");
  };

  return (
    <div style={wrap}>
      <div style={feed}>
        {messages.length === 0 && <p style={greet}>{t.greeting}</p>}
        {messages.map((m) => {
          const body = text(m);
          if (!body) return null;
          const isUser = m.role === "user";
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
              <div style={isUser ? bubbleUser : bubbleBot}>{body}</div>
            </div>
          );
        })}
        {busy && <div style={{ ...bubbleBot, opacity: 0.6 }}>…</div>}
      </div>
      <form onSubmit={submit} style={form}>
        <input
          style={inputStyle}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.placeholder}
        />
        <button type="submit" disabled={busy || !input.trim()} style={button}>
          {t.send}
        </button>
      </form>
    </div>
  );
}

const wrap: React.CSSProperties = {
  fontFamily: "system-ui, -apple-system, sans-serif",
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  maxWidth: 440,
  margin: "0 auto",
  background: "#fff",
};
const feed: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const greet: React.CSSProperties = { fontSize: 14, color: "#555", margin: 0 };
const bubbleBase: React.CSSProperties = {
  maxWidth: "85%",
  padding: "8px 12px",
  borderRadius: 12,
  fontSize: 14,
  lineHeight: 1.4,
  whiteSpace: "pre-wrap",
};
const bubbleUser: React.CSSProperties = { ...bubbleBase, background: "#fc4c02", color: "#fff" };
const bubbleBot: React.CSSProperties = { ...bubbleBase, background: "#f3f4f6", color: "#111" };
const form: React.CSSProperties = { display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e5e7eb" };
const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 14,
};
const button: React.CSSProperties = {
  padding: "10px 16px",
  background: "#fc4c02",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
