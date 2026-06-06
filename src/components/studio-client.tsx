"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Panel, Group, Separator } from "react-resizable-panels";
import type { DesignTokens } from "@/types/design";
import type { DesignProposal } from "@/lib/schemas";
import { BRIEF_STORAGE_KEY } from "@/lib/onboarding";
import { useLocale, useT } from "@/lib/i18n/context";
import { StudioTopbar } from "./studio-topbar";
import { ExtractionPanel } from "./extraction-panel";
import { ExtractionDrawer } from "./extraction-drawer";
import { ChatPanel } from "./chat-panel";
import { PreviewFrame } from "./preview-frame";
import { GenerationProgress } from "./generation-progress";
import { ProposalActions } from "./proposal-actions";

interface Extraction {
  tokens: DesignTokens;
  screenshot: string;
}

interface Proposal {
  proposal: DesignProposal;
  designMd: string;
  html: string;
}

type Phase = "extracting" | "ready" | "error";
type MobileTab = "extract" | "chat" | "preview";

const DEFAULT_BRIEF = "Propón un diseño inspirado en esta web.";

export function StudioClient({ url }: { url: string }) {
  const [phase, setPhase] = useState<Phase>("extracting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [generating, setGenerating] = useState(false);
  const { locale } = useLocale();
  const t = useT();
  const [partial, setPartial] = useState<Partial<DesignProposal> | null>(null);
  const [seenFields, setSeenFields] = useState<Set<string>>(new Set());
  // Razonamiento del agente acumulado en vivo (para el panel desplegable).
  const [reasoning, setReasoning] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("extract");
  const [chatInput, setChatInput] = useState("");
  // La extracción (detalle técnico) está oculta por defecto: al cliente final le
  // importa el resultado, no los tokens. Se muestra bajo demanda.
  const [showExtraction, setShowExtraction] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [quality, setQuality] = useState<"rapido" | "alta">("alta");
  // Brief del onboarding (si el usuario llegó vía el chat de bienvenida). Se consume
  // una sola vez desde sessionStorage (lazy init) para no exponer datos personales en
  // la URL. El guard typeof window evita tocar sessionStorage durante el SSR.
  const [initialBrief] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = sessionStorage.getItem(BRIEF_STORAGE_KEY);
    if (stored) sessionStorage.removeItem(BRIEF_STORAGE_KEY);
    return stored;
  });

  // Chat elevado: sus mensajes alimentan el brief de la generación.
  const chat = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { tokens: extraction?.tokens },
    }),
  });
  const chatBusy = chat.status === "streaming" || chat.status === "submitted";

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          signal: controller.signal,
        });
        const json = await res.json().catch(() => null);
        if (!json) throw new Error("El servidor devolvió una respuesta inválida");
        if (!json.success) throw new Error(json.error?.message ?? "Error");
        setExtraction(json.data);
        setPhase("ready");
      } catch (e) {
        if (controller.signal.aborted) return;
        setErrorMsg(e instanceof Error ? e.message : "Error de extracción");
        setPhase("error");
      }
    })();
    return () => controller.abort();
  }, [url]);

  // Brief derivado de los mensajes enviados Y el texto pendiente en el input
  // (para que el usuario pueda escribir y pulsar Generar sin "Enviar" primero).
  const briefFromChat = useMemo(() => {
    const sent = chat.messages
      .filter((m) => m.role === "user")
      .flatMap((m) => m.parts.filter((p) => p.type === "text").map((p) => p.text));
    const all = [initialBrief, ...sent, chatInput].filter(Boolean).join("\n\n").trim();
    return all || DEFAULT_BRIEF;
  }, [chat.messages, chatInput, initialBrief]);

  const handleChatSend = useCallback(
    (text: string) => {
      chat.sendMessage({ text });
      setChatInput("");
    },
    [chat],
  );

  const handleGenerate = useCallback(async () => {
    if (!extraction) return;
    setGenerating(true);
    setErrorMsg(null);
    setProposal(null);
    setPartial(null);
    setSeenFields(new Set());
    setReasoning("");
    setMobileTab("preview");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokens: extraction.tokens,
          screenshot: extraction.screenshot,
          brief: briefFromChat,
          language: locale,
          images,
          quality,
        }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "No se pudo generar la propuesta");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const seen = new Set<string>();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "partial") {
            setPartial(evt.object);
          } else if (evt.type === "progress") {
            seen.add(evt.field);
            setSeenFields(new Set(seen));
          } else if (evt.type === "reasoning") {
            setReasoning((r) => r + evt.text);
          } else if (evt.type === "done") {
            setProposal({
              proposal: evt.proposal,
              designMd: evt.designMd,
              html: evt.html,
            });
          } else if (evt.type === "error") {
            throw new Error(evt.message ?? "Error generando");
          }
        }
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error generando");
    } finally {
      setGenerating(false);
    }
  }, [extraction, briefFromChat, locale, images, quality]);

  if (phase === "extracting") {
    return <ExtractionLoading url={url} />;
  }

  if (phase === "error" || !extraction) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-canvas-dark text-on-dark">
        <h1 className="text-2xl font-medium">{t("studio.extractError")}</h1>
        <p className="text-body">{errorMsg}</p>
      </div>
    );
  }

  const previewArea = proposal ? (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-hairline p-3">
        <span className="eyebrow text-body">{proposal.proposal.name}</span>
        <ProposalActions
          html={proposal.html}
          designMd={proposal.designMd}
          name={proposal.proposal.name}
          onRegenerate={handleGenerate}
          disabled={generating}
        />
      </div>
      <div className="flex-1 overflow-hidden">
        <PreviewFrame html={proposal.html} />
      </div>
      {proposal.proposal.interactions && (
        <div className="border-t border-hairline px-3 py-2">
          <span className="eyebrow text-body">{t("studio.includes")}</span>
          <p className="mt-0.5 text-xs text-body">{proposal.proposal.interactions}</p>
        </div>
      )}
      <details className="border-t border-hairline p-3">
        <summary className="eyebrow cursor-pointer text-body">DESIGN.md</summary>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-sm bg-canvas-dark p-3 text-xs text-on-dark">
          {proposal.designMd}
        </pre>
      </details>
    </div>
  ) : generating ? (
    <GenerationProgress partial={partial} seen={seenFields} reasoning={reasoning} />
  ) : (
    <EmptyPreview errorMsg={errorMsg} />
  );

  return (
    <div className="flex flex-1 flex-col">
      <StudioTopbar
        url={url}
        onGenerate={handleGenerate}
        generating={generating}
        canGenerate={!!extraction}
        showExtraction={showExtraction}
        onToggleExtraction={() => setShowExtraction((v) => !v)}
        quality={quality}
        onQualityChange={setQuality}
      />

      {/* Desktop: chat + preview redimensionables. Extracción va en un drawer overlay. */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <Group orientation="horizontal" className="h-full w-full">
          <Panel defaultSize="34%" minSize="20%">
            <div className="h-full overflow-hidden border-r border-hairline">
              <ChatPanel
                messages={chat.messages}
                input={chatInput}
                onInputChange={setChatInput}
                onSend={handleChatSend}
                busy={chatBusy}
                images={images}
                onImagesChange={setImages}
              />
            </div>
          </Panel>
          <ResizeHandle />
          <Panel defaultSize="66%" minSize="30%">
            <div className="h-full overflow-hidden">{previewArea}</div>
          </Panel>
        </Group>
      </div>

      {/* Drawer overlay con el diseño extraído (bajo demanda) */}
      <ExtractionDrawer
        open={showExtraction}
        onClose={() => setShowExtraction(false)}
        tokens={extraction.tokens}
        screenshot={extraction.screenshot}
      />

      {/* Móvil: pestañas */}
      <div className="flex flex-1 flex-col lg:hidden">
        <div className="flex border-b border-hairline">
          {(
            [
              ["extract", t("studio.tab.extract")],
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
          {mobileTab === "extract" && (
            <ExtractionPanel tokens={extraction.tokens} screenshot={extraction.screenshot} />
          )}
          {mobileTab === "chat" && (
            <ChatPanel
              messages={chat.messages}
              input={chatInput}
              onInputChange={setChatInput}
              onSend={handleChatSend}
              busy={chatBusy}
              images={images}
              onImagesChange={setImages}
            />
          )}
          {mobileTab === "preview" && previewArea}
        </div>
      </div>
    </div>
  );
}

function ResizeHandle() {
  return (
    <Separator className="w-1 cursor-col-resize bg-hairline transition-colors hover:bg-accent-periwinkle" />
  );
}

/** Pantalla de extracción con temporizador y aviso si tarda más de lo normal. */
function ExtractionLoading({ url }: { url: string }) {
  const t = useT();
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const slow = secs >= 25; // umbral de "tarda más de lo normal"

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-canvas-dark px-6 text-on-dark">
      <div className="bg-brand-gradient h-12 w-12 animate-pulse rounded-sm" />
      <span className="eyebrow text-body">{t("extraction.loading.title")}</span>
      <p className="max-w-sm text-center text-xs text-body">
        {t("extraction.loading.lead")}
      </p>
      <span className="font-mono text-sm text-on-dark-soft">{secs}s</span>
      {slow && (
        <p className="max-w-sm text-center text-xs text-accent-mint">
          {t("extraction.loading.slow")}
        </p>
      )}
      <p className="max-w-xs truncate text-center text-[10px] text-body" title={url}>
        {url}
      </p>
    </div>
  );
}

function EmptyPreview({ errorMsg }: { errorMsg: string | null }) {
  const t = useT();
  if (errorMsg) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm">
        <span className="text-accent-orange" role="alert">
          {errorMsg}
        </span>
      </div>
    );
  }
  const steps = [
    t("studio.empty.step.review"),
    t("studio.empty.step.refine"),
    t("studio.empty.step.generate"),
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      {/* Icono de marca flotante */}
      <div className="bg-brand-gradient h-14 w-14 animate-float rounded-[--radius-cb] opacity-90" />

      <ol className="flex flex-col gap-3">
        {steps.map((label, i) => (
          <li
            key={i}
            className="flex animate-step items-center gap-3 text-sm text-body"
            style={{ animationDelay: `${i * 180}ms` }}
          >
            <span
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[--color-cb-blue] font-mono text-xs text-on-primary"
              style={{ animationDelay: `${i * 600}ms` }}
            >
              {i + 1}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      <p className="max-w-xs text-xs text-muted">
        {t("studio.empty.hint")}
      </p>
    </div>
  );
}
