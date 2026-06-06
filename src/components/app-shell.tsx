"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { Panel, Group, Separator } from "react-resizable-panels";
import type { DesignTokens } from "@/types/design";
import { useLocale, useT } from "@/lib/i18n/context";
import { useGeneration } from "@/lib/hooks/use-generation";
import { ConversationSidebar } from "./conversation-sidebar";
import { PreviewFrame } from "./preview-frame";
import { GenerationProgress } from "./generation-progress";
import { ProposalActions } from "./proposal-actions";
import { Markdown } from "./markdown";

interface Extraction {
  tokens: DesignTokens;
  screenshot: string;
}

interface InitialConversation {
  id: string;
  messages: UIMessage[];
  url: string | null;
  generatedHtml: string | null;
  designMd: string | null;
  name: string | null;
}

function messageText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

type MobileTab = "chat" | "preview";

/**
 * Pantalla única: sidebar | chat (un solo useChat con tools launchBrand/refineDesign) |
 * artifact (preview de la página generada inline). Sustituye home + studio.
 */
export function AppShell({ initial }: { initial?: InitialConversation }) {
  const { locale } = useLocale();
  const t = useT();

  const [input, setInput] = useState("");
  const [convId, setConvId] = useState<string | null>(initial?.id ?? null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [launching, setLaunching] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  // Página ya generada al rehidratar (artifact persistido).
  const [savedPage, setSavedPage] = useState<{ html: string; name: string | null } | null>(
    initial?.generatedHtml
      ? { html: initial.generatedHtml, name: initial.name }
      : null,
  );

  const gen = useGeneration();
  const scrollRef = useRef<HTMLDivElement>(null);
  const convIdRef = useRef(convId);
  const extractionRef = useRef<Extraction | null>(extraction);
  useEffect(() => {
    convIdRef.current = convId;
  }, [convId]);
  useEffect(() => {
    extractionRef.current = extraction;
  }, [extraction]);

  // ¿Hay página? (recién generada o rehidratada). Define el modo del chat.
  const hasPage = !!gen.proposal || !!savedPage;

  // Transport memoizado: el body lleva tokens cuando ya hay diseño (modo afinar).
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { language: locale, tokens: extraction?.tokens },
      }),
    [locale, extraction?.tokens],
  );

  /** Persiste mensajes (y opcional estado de página) en la conversación. */
  const persist = useCallback(
    async (messages: UIMessage[], extra?: Record<string, unknown>) => {
      let id = convIdRef.current;
      if (!id) {
        const res = await fetch("/api/conversations", { method: "POST" }).catch(() => null);
        const json = await res?.json().catch(() => null);
        id = json?.data?.id ?? null;
        if (id) {
          setConvId(id);
          window.history.replaceState(null, "", `/c/${id}`);
        }
      }
      if (!id) return; // sin DB: funciona en memoria
      const title = messages.find((m) => m.role === "user")
        ? messageText(messages.find((m) => m.role === "user")!).slice(0, 60)
        : undefined;
      void fetch(`/api/conversations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, title, ...extra }),
      }).catch(() => {});
    },
    [],
  );

  /** Ejecuta (resolve si hace falta) → extract → generate y pinta el artifact. */
  const runLaunch = useCallback(
    async (ctx: {
      brand: string;
      url?: string;
      nameAndFirm?: string;
      markets?: string;
      positioning?: string;
    }) => {
      setLaunching(true);
      setSavedPage(null);
      try {
        // Si el usuario dio una URL, la usamos directo; si no, resolvemos la marca.
        let url = ctx.url?.trim();
        if (!url) {
          const r = await fetch("/api/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: ctx.brand }),
          });
          const rj = await r.json().catch(() => null);
          if (!rj?.success || !rj.data?.url) return { ok: false as const, needsUrl: true };
          url = rj.data.url as string;
        }

        const e = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const ej = await e.json().catch(() => null);
        if (!ej?.success) return { ok: false as const };
        const extr: Extraction = ej.data;
        setExtraction(extr);

        const brief = [
          ctx.nameAndFirm ? `Name & firm: ${ctx.nameAndFirm}` : "",
          `Brand: ${ctx.brand}`,
          ctx.markets ? `Markets: ${ctx.markets}` : "",
          ctx.positioning ? `Positioning: ${ctx.positioning}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const proposal = await gen.generate({
          tokens: extr.tokens,
          screenshot: extr.screenshot,
          brief,
          language: locale,
          seo: {
            brand: ctx.brand,
            city: ctx.markets?.split(/[,;]/)[0]?.trim(),
            positioning: ctx.positioning,
          },
        });
        if (proposal) {
          void persist([], {
            url,
            generatedHtml: proposal.html,
            designMd: proposal.designMd,
            name: proposal.proposal.name,
            slug: proposal.slug,
            brand: proposal.brand,
            city: proposal.city,
            metaTitle: proposal.proposal.seo?.metaTitle,
            metaDescription: proposal.proposal.seo?.metaDescription,
          });
          return { ok: true as const, name: proposal.proposal.name };
        }
        return { ok: false as const };
      } finally {
        setLaunching(false);
      }
    },
    [gen, locale, persist],
  );

  /** Regenera con un ajuste de diseño, reusando la extracción cacheada. */
  const runRefine = useCallback(
    async (instructions: string) => {
      const extr = extractionRef.current;
      if (!extr) return { ok: false as const };
      setLaunching(true);
      setSavedPage(null);
      try {
        const proposal = await gen.generate({
          tokens: extr.tokens,
          screenshot: extr.screenshot,
          brief: instructions,
          language: locale,
        });
        if (proposal) {
          void persist([], {
            generatedHtml: proposal.html,
            designMd: proposal.designMd,
            name: proposal.proposal.name,
          });
          return { ok: true as const };
        }
        return { ok: false as const };
      } finally {
        setLaunching(false);
      }
    },
    [gen, locale, persist],
  );

  const chat = useChat({
    ...(initial?.id ? { id: initial.id } : {}),
    ...(initial?.messages ? { messages: initial.messages } : {}),
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === "launchBrand") {
        const ctx = toolCall.input as Parameters<typeof runLaunch>[0];
        if (!ctx?.brand) return;
        void (async () => {
          const out = await runLaunch(ctx);
          // Mensaje claro al agente para evitar bucles de reintento.
          let message: string | undefined;
          if (!out.ok) {
            message =
              "needsUrl" in out && out.needsUrl && !ctx.url
                ? t("hc.askUrl", { brand: ctx.brand }) // pide la URL UNA vez
                : t("hc.genFailed"); // ya falló con URL: no reintentar, disculparse
          }
          chat.addToolOutput({
            tool: "launchBrand",
            toolCallId: toolCall.toolCallId,
            output: out.ok ? { ok: true } : { ok: false, message },
          });
        })();
      } else if (toolCall.toolName === "refineDesign") {
        const { instructions } = toolCall.input as { instructions: string };
        void (async () => {
          const out = await runRefine(instructions);
          chat.addToolOutput({
            tool: "refineDesign",
            toolCallId: toolCall.toolCallId,
            output: out,
          });
        })();
      }
    },
    onFinish: ({ messages }) => {
      void persist(messages);
    },
  });

  const busy = chat.status === "streaming" || chat.status === "submitted";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages, gen.generating]);

  const send = useCallback(
    (text: string) => {
      const v = text.trim();
      if (!v || busy || launching) return;
      chat.sendMessage({ text: v });
      setInput("");
      setMobileTab(hasPage ? "preview" : "chat");
    },
    [chat, busy, launching, hasPage],
  );

  /** Reinicia a una conversación nueva: limpia chat, artifact, estado y URL. */
  const handleNew = useCallback(() => {
    chat.setMessages([]);
    chat.stop?.();
    gen.reset();
    setExtraction(null);
    setSavedPage(null);
    setConvId(null);
    setInput("");
    setLaunching(false);
    window.history.replaceState(null, "", "/");
  }, [chat, gen]);

  const empty = chat.messages.length === 0;
  const suggestions = ["hc.suggest1", "hc.suggest2", "hc.suggest3"] as const;

  // ── Panel del chat ──────────────────────────────────────────────────────
  const chatPanel = (
    <div className="flex h-full min-h-0 flex-col bg-canvas-dark text-on-dark">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5">
        <div className="mx-auto w-full max-w-2xl">
          {empty ? (
            <div className="flex animate-fade flex-col items-center gap-5 pt-[12vh] text-center">
              <div className="bg-brand-gradient h-12 w-12 rounded-lg" />
              <h1 className="text-2xl font-medium leading-tight tracking-[-1px]">
                {t("hc.greeting")}
              </h1>
              <p className="max-w-sm text-sm leading-relaxed text-body">{t("hc.subtitle")}</p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(t(s))}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-on-dark transition-colors hover:border-accent-periwinkle"
                  >
                    {t(s)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-6">
              {chat.messages.map((m) => {
                const text = messageText(m);
                if (!text) return null;
                const isUser = m.role === "user";
                return (
                  <div
                    key={m.id}
                    className={`flex animate-msg ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                        isUser
                          ? "whitespace-pre-wrap bg-accent-periwinkle text-ink"
                          : "border border-white/10 bg-surface-dark-soft text-on-dark"
                      }`}
                    >
                      {isUser ? text : <Markdown>{text}</Markdown>}
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
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-6 pt-2">
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
            <button
              type="submit"
              disabled={busy || launching || !input.trim()}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-mint text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
              aria-label={t("hc.send")}
            >
              ↑
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // ── Panel del artifact (preview) ────────────────────────────────────────
  const proposal = gen.proposal;
  const artifactPanel = (
    <div className="flex h-full flex-col bg-canvas">
      {proposal ? (
        <>
          <div className="flex items-center justify-between gap-2 border-b border-hairline p-3">
            <span className="eyebrow text-body">{proposal.proposal.name}</span>
            <ProposalActions
              html={proposal.html}
              designMd={proposal.designMd}
              name={proposal.proposal.name}
              shareId={convId}
              onRegenerate={() => void runRefine(t("hc.regenerateBrief"))}
              busy={gen.generating || launching}
            />
          </div>
          <div className="flex-1 animate-scale overflow-hidden">
            <PreviewFrame html={proposal.html} />
          </div>
        </>
      ) : savedPage ? (
        <>
          <div className="flex items-center justify-between gap-2 border-b border-hairline p-3">
            <span className="eyebrow text-body">{savedPage.name ?? ""}</span>
          </div>
          <div className="flex-1 animate-scale overflow-hidden">
            <PreviewFrame html={savedPage.html} />
          </div>
        </>
      ) : gen.generating || launching ? (
        <div className="h-full animate-fade">
          <GenerationProgress partial={gen.partial} seen={gen.seenFields} reasoning={gen.reasoning} />
        </div>
      ) : (
        <div className="flex h-full animate-fade flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="bg-brand-gradient h-10 w-10 rounded-md opacity-60" />
          <p className="max-w-xs text-sm text-body">{t("hc.artifactEmpty")}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-1">
      <ConversationSidebar activeId={convId} onNew={handleNew} />

      {/* Desktop: chat | artifact redimensionables */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <Group orientation="horizontal" className="h-full w-full">
          <Panel defaultSize="40%" minSize="28%">
            <div className="h-full overflow-hidden border-r border-hairline">{chatPanel}</div>
          </Panel>
          <Separator className="w-1 cursor-col-resize bg-hairline transition-colors hover:bg-accent-periwinkle" />
          <Panel defaultSize="60%" minSize="30%">
            <div className="h-full overflow-hidden">{artifactPanel}</div>
          </Panel>
        </Group>
      </div>

      {/* Móvil: tabs */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="flex border-b border-hairline">
          {(
            [
              ["chat", t("studio.tab.chat")],
              ["preview", t("studio.tab.preview")],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 py-2 font-mono text-xs uppercase ${
                mobileTab === tab ? "border-b-2 border-primary text-ink" : "text-body"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {mobileTab === "chat" ? chatPanel : artifactPanel}
        </div>
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-body"
      style={{ animationDelay: delay }}
    />
  );
}
