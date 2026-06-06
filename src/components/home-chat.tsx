"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { useLocale, useT } from "@/lib/i18n/context";
import { BRIEF_STORAGE_KEY } from "@/lib/onboarding";

/** Texto plano de un UIMessage (concatena sus partes de texto). */
function messageText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/**
 * Chat conversacional de la HOME (estilo Perplexity/Claude). El agente conversa y, vía
 * la tool launchBrand, dispara resolve → studio. El marketing se teje en la charla.
 */
export function HomeChat() {
  const router = useRouter();
  const { locale } = useLocale();
  const t = useT();
  const [input, setInput] = useState("");
  const [launching, setLaunching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat", body: { language: locale } }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName !== "launchBrand") return;
      const brand = (toolCall.input as { brand?: string })?.brand?.trim();
      if (!brand) return;
      setLaunching(true);
      // No await dentro de onToolCall (regla del SDK): manejamos en una IIFE.
      void (async () => {
        try {
          const res = await fetch("/api/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: brand }),
          });
          const json = await res.json().catch(() => null);
          if (json?.success && json.data?.url) {
            sessionStorage.setItem(BRIEF_STORAGE_KEY, briefFrom(chat.messages, brand));
            router.push(`/studio?url=${encodeURIComponent(json.data.url)}`);
            return;
          }
          setLaunching(false);
          chat.addToolOutput({
            tool: "launchBrand",
            toolCallId: toolCall.toolCallId,
            output: { ok: false, message: t("hc.resolveFailed", { brand }) },
          });
        } catch {
          setLaunching(false);
          chat.addToolOutput({
            tool: "launchBrand",
            toolCallId: toolCall.toolCallId,
            output: { ok: false, message: t("hc.resolveFailed", { brand }) },
          });
        }
      })();
    },
  });

  const busy = chat.status === "streaming" || chat.status === "submitted";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages]);

  const send = useCallback(
    (text: string) => {
      const v = text.trim();
      if (!v || busy) return;
      chat.sendMessage({ text: v });
      setInput("");
    },
    [chat, busy],
  );

  const empty = chat.messages.length === 0;
  const suggestions = ["hc.suggest1", "hc.suggest2", "hc.suggest3"] as const;

  return (
    <div className="flex h-full flex-1 flex-col bg-canvas-dark text-on-dark">
      {/* Topbar mínima */}
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-lg font-medium tracking-tight">
          Franc<span className="text-accent-orange">ast</span>.ai
        </span>
        <LanguageToggle variant="dark" />
      </header>

      {/* Conversación / pantalla inicial */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
        <div className="mx-auto w-full max-w-2xl">
          {empty ? (
            <div className="flex flex-col items-center gap-6 pt-[14vh] text-center">
              <div className="bg-brand-gradient h-12 w-12 rounded-lg" />
              <h1 className="max-w-lg text-3xl font-medium leading-tight tracking-[-1px] md:text-4xl">
                {t("hc.greeting")}
              </h1>
              <p className="max-w-md text-base leading-relaxed text-body">{t("hc.subtitle")}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(t(s))}
                    className="rounded-full border border-white/15 px-4 py-2 text-sm text-on-dark transition-colors hover:border-accent-periwinkle"
                  >
                    {t(s)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-8">
              {chat.messages.map((m) => {
                const text = messageText(m);
                if (!text) return null;
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                        isUser
                          ? "bg-accent-periwinkle text-ink"
                          : "border border-white/10 bg-surface-dark-soft text-on-dark"
                      }`}
                    >
                      {text}
                    </div>
                  </div>
                );
              })}
              {(busy || launching) && (
                <div className="flex justify-start">
                  <div className="rounded-lg border border-white/10 bg-surface-dark-soft px-4 py-3">
                    <span className="inline-flex gap-1">
                      <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                    </span>
                  </div>
                </div>
              )}
              {launching && (
                <p className="text-center text-xs text-body">{t("hc.launching")}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Compositor */}
      <div className="px-6 pb-8 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto w-full max-w-2xl"
        >
          <div className="flex items-end gap-2 rounded-xl border border-white/15 bg-surface-dark-soft p-2 focus-within:border-accent-periwinkle">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder={t("hc.placeholder")}
              disabled={launching}
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-on-dark placeholder:text-body focus:outline-none"
            />
            <Button type="submit" variant="mint" disabled={busy || launching || !input.trim()}>
              {t("hc.send")}
            </Button>
          </div>
          <p className="mt-1 px-1 text-[10px] text-body">{t("hc.hint")}</p>
        </form>
      </div>
    </div>
  );
}

/**
 * Brief desde la conversación libre: las frases del usuario + la marca elegida.
 * Lo consume el studio (sessionStorage) igual que el brief del onboarding.
 */
function briefFrom(messages: UIMessage[], brand: string): string {
  const userText = messages
    .filter((m) => m.role === "user")
    .map(messageText)
    .filter(Boolean)
    .join("\n");
  return `Client conversation:\n- Brand to launch: ${brand}\n${userText}`.trim();
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-body"
      style={{ animationDelay: delay }}
    />
  );
}
