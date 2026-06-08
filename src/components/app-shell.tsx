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
import { useVoice } from "@/lib/hooks/use-voice";
import { track } from "@/lib/analytics/track";
import { ConversationSidebar } from "./conversation-sidebar";
import { TopNav } from "./top-nav";
import { ResponsivePreview } from "./responsive-preview";
import { PreviewFullscreen } from "./preview-fullscreen";
import { GenerationProgress } from "./generation-progress";
import { ProposalActions } from "./proposal-actions";
import { Markdown } from "./markdown";
import {
  PaperclipIcon,
  Volume2Icon,
  VolumeOffIcon,
  MicIcon,
  ArrowUpIcon,
  StopIcon,
  XIcon,
  CopyIcon,
  CheckIcon,
} from "./ui/icons";

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
  // HTML mostrado en el overlay de pantalla completa (null = cerrado).
  const [fullscreenHtml, setFullscreenHtml] = useState<string | null>(null);
  // Banner de éxito tras volver del pago: slug de la web recién publicada (null = oculto).
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  // Adjuntos del usuario para la generación: fotos ({{IMG_n}}) y logo propio ({{LOGO}}).
  const [images, setImages] = useState<string[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  // Página ya generada al rehidratar (artifact persistido).
  const [savedPage, setSavedPage] = useState<{ html: string; name: string | null } | null>(
    initial?.generatedHtml
      ? { html: initial.generatedHtml, name: initial.name }
      : null,
  );

  const gen = useGeneration();
  // ── Voz ── (declarado arriba: lo usa el useEffect de auto-speak más abajo)
  const voice = useVoice({ language: locale });
  const [voiceOn, setVoiceOn] = useState(false); // leer respuestas en voz alta
  const spokenRef = useRef<string | null>(null); // último mensaje ya leído (evita repetir)
  const scrollRef = useRef<HTMLDivElement>(null);
  const convIdRef = useRef(convId);
  const extractionRef = useRef<Extraction | null>(extraction);
  useEffect(() => {
    convIdRef.current = convId;
  }, [convId]);
  useEffect(() => {
    extractionRef.current = extraction;
  }, [extraction]);
  // Refs de adjuntos: los lee runLaunch sin recrear su useCallback en cada cambio.
  const imagesRef = useRef<string[]>([]);
  const logoRef = useRef<string | null>(null);
  // Input de archivo oculto: el clip adjunta imágenes (un solo botón).
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => {
    logoRef.current = logo;
  }, [logo]);

  // Retorno de Stripe Checkout: ?checkout=success&slug=… → esperar al webhook (polling
  // corto) y publicar la web. Limpia la query al terminar para no repetir al refrescar.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("checkout") !== "success") return;
    const slug = url.searchParams.get("slug");
    const clean = () => {
      url.searchParams.delete("checkout");
      url.searchParams.delete("slug");
      window.history.replaceState(null, "", url.pathname + url.search);
    };
    if (!slug) {
      clean();
      return;
    }
    let cancelled = false;
    void (async () => {
      // El webhook puede tardar; reintentamos hasta 8 veces (~16s) antes de rendirnos.
      for (let i = 0; i < 8 && !cancelled; i++) {
        const sub = await fetch("/api/subscription").then((r) => r.json()).catch(() => null);
        if (sub?.data?.active) {
          const pub = await fetch("/api/publish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug }),
          })
            .then((r) => r.json())
            .catch(() => null);
          // Feedback visible: banner con enlace a la web publicada (antes el usuario
          // aterrizaba en la home sin saber qué pasó tras pagar).
          if (pub?.success && !cancelled) setPublishedSlug(slug);
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) clean();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ¿Hay página? (recién generada o rehidratada). Define el modo del chat.
  const hasPage = !!gen.proposal?.proposal || !!savedPage;

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
      whatsapp?: string;
      email?: string;
      phone?: string;
      sellingPoints?: string;
      formFields?: string[];
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
        if (!ej?.success) {
          // El sitio bloquea bots / tarda demasiado. Si la URL la resolvimos nosotros,
          // puede estar mal o el sitio ser inaccesible: pedimos la URL oficial al usuario
          // para reintentar (recuperable). Si el usuario ya la había dado, es fallo real.
          return ctx.url
            ? { ok: false as const }
            : { ok: false as const, needsUrl: true as const };
        }
        const extr: Extraction = ej.data;
        setExtraction(extr);

        const brief = [
          ctx.nameAndFirm ? `Name & firm: ${ctx.nameAndFirm}` : "",
          `Brand: ${ctx.brand}`,
          ctx.markets ? `Markets: ${ctx.markets}` : "",
          ctx.positioning ? `Positioning: ${ctx.positioning}` : "",
          ctx.sellingPoints ? `Selling points: ${ctx.sellingPoints}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const proposal = await gen.generate({
          tokens: extr.tokens,
          screenshot: extr.screenshot,
          brief,
          language: locale,
          images: imagesRef.current,
          logo: logoRef.current,
          seo: {
            brand: ctx.brand,
            city: ctx.markets?.split(/[,;]/)[0]?.trim(),
            positioning: ctx.positioning,
            whatsapp: ctx.whatsapp,
            email: ctx.email,
            phone: ctx.phone,
            sellingPoints: ctx.sellingPoints,
            formFields: ctx.formFields,
          },
        });
        // Anti-duplicado: el servidor reusó una página existente (marca+ciudad ya
        // generada). No persistimos otra; señalamos el slug para mostrar la existente.
        if (proposal?.duplicate && proposal.slug) {
          return { ok: true as const, duplicate: true as const, slug: proposal.slug };
        }
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
          track("launch_started", { brand: ctx.brand, city: ctx.markets });
          const out = await runLaunch(ctx);
          if (out.ok) track("launch_completed", { brand: ctx.brand });
          // Mensaje claro al agente para evitar bucles de reintento.
          let message: string | undefined;
          if (!out.ok) {
            message =
              "needsUrl" in out && out.needsUrl && !ctx.url
                ? t("hc.askUrl", { brand: ctx.brand }) // pide la URL UNA vez
                : t("hc.genFailed"); // ya falló con URL: no reintentar, disculparse
          } else if ("duplicate" in out && out.duplicate) {
            // Ya existía: no regeneramos. El agente avisa y enlaza la existente.
            message = t("hc.duplicate", { brand: ctx.brand });
          }
          chat.addToolOutput({
            tool: "launchBrand",
            toolCallId: toolCall.toolCallId,
            output: out.ok
              ? { ok: true, ...("duplicate" in out && out.duplicate ? { duplicate: true, slug: out.slug, message } : {}) }
              : { ok: false, message },
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

  // Autoscroll pegado al fondo. En streaming, chat.messages cambia de referencia
  // en cada chunk: con behavior "smooth" cada scroll reinicia la animación anterior
  // y nunca alcanza el fondo. Usamos "instant" dentro de rAF para leer scrollHeight
  // ya pintado y saltar al fondo en cada token sin pelear con la animación.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Best practice 2026: solo auto-scrollear si el usuario ya está cerca del fondo
    // (<120px). Si subió a leer mensajes anteriores, NO le robamos la posición.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (!nearBottom) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" as ScrollBehavior });
    });
    return () => cancelAnimationFrame(id);
  }, [chat.messages, gen.generating]);

  // Leer en voz la última respuesta del asistente cuando termina (si la voz está activa).
  useEffect(() => {
    if (!voiceOn || busy) return;
    const last = [...chat.messages].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    const text = messageText(last);
    if (text && spokenRef.current !== last.id) {
      spokenRef.current = last.id;
      void voice.speak(text);
    }
  }, [voiceOn, busy, chat.messages, voice]);

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

  /** Micrófono: graba; al soltar transcribe y ENVÍA automático. */
  const handleMic = useCallback(async () => {
    if (voice.recState === "recording") {
      voice.stop();
      return;
    }
    if (busy || launching) return;
    const text = await voice.start();
    if (text.trim()) send(text);
  }, [voice, busy, launching, send]);

  // ── Adjuntar (fotos + logo) ────────────────────────────────────────────────
  const MAX_IMAGES = 6;
  const MAX_BYTES = 8_000_000; // ~8MB, igual que el backend (MAX_IMG)
  const fileToDataUrl = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(f);
    });

  /** Añade imágenes adjuntas ({{IMG_n}}), respetando tope y tipo/tamaño. */
  const addImages = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(
      (f) => f.type.startsWith("image/") && f.size <= MAX_BYTES,
    );
    if (!arr.length) return;
    const urls = await Promise.all(arr.map(fileToDataUrl));
    setImages((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
  }, []);

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
    setImages([]);
    setLogo(null);
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
            <div className="flex flex-col gap-6 py-6">
              {chat.messages.map((m) => {
                const text = messageText(m);
                if (!text) return null;
                const isUser = m.role === "user";
                // Usuario: burbuja con acento alineada a la derecha. Agente: sin borde
                // duro, ancho cómodo y aire (best practice 2026: respuestas full-width,
                // no encerradas en burbuja), con acción "copiar" al hover.
                if (isUser) {
                  return (
                    <div key={m.id} className="flex animate-msg justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent-periwinkle px-4 py-2.5 text-sm leading-relaxed text-ink">
                        {text}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="group flex animate-msg flex-col gap-1">
                    <div className="text-sm leading-[1.7] text-on-dark [&_p]:my-0">
                      <Markdown>{text}</Markdown>
                    </div>
                    <div className="-ml-1 h-7">
                      <CopyButton text={text} label={t("hc.copy")} />
                    </div>
                  </div>
                );
              })}
              {(busy || launching) && (
                <div className="flex animate-msg items-center gap-1 py-1">
                  <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
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
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) void addImages(e.dataTransfer.files);
          }}
        >
          {/* Miniaturas de adjuntos (logo + fotos) */}
          {(logo || images.length > 0) && (
            <div className="mb-2 flex flex-wrap gap-2">
              {logo && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt={t("hc.logo")} className="h-12 w-12 rounded-md border border-accent-periwinkle object-contain bg-white/5" />
                  <span className="absolute left-0.5 top-0.5 rounded-sm bg-canvas-dark/80 px-1 font-mono text-[9px] text-on-dark">
                    {t("hc.logo")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLogo(null)}
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-canvas"
                    aria-label={t("hc.remove")}
                  >
                    <XIcon size={10} />
                  </button>
                </div>
              )}
              {images.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${i + 1}`} className="h-12 w-12 rounded-md border border-white/15 object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-canvas"
                    aria-label={t("hc.remove")}
                  >
                    <XIcon size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            className={`flex items-end gap-1.5 rounded-2xl border bg-surface-dark-soft/80 p-2 backdrop-blur-md transition-colors ${
              dragOver ? "border-accent-mint" : "border-white/10 focus-within:border-accent-periwinkle/70"
            }`}
          >
            {/* Adjuntar (fotos + logo): un solo botón. La 1ª imagen se usa como logo. */}
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={launching || images.length >= MAX_IMAGES}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-body transition-colors hover:bg-white/10 hover:text-on-dark disabled:opacity-40"
              aria-label={t("hc.attach")}
              title={t("hc.attach")}
            >
              <PaperclipIcon />
            </button>

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
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-on-dark placeholder:text-body/70 focus:outline-none"
            />

            {/* Voz de salida (leer respuestas) */}
            {voice.supported && (
              <button
                type="button"
                onClick={() => {
                  if (voiceOn) voice.stopSpeaking();
                  setVoiceOn((v) => !v);
                }}
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/10 ${
                  voiceOn ? "text-accent-mint" : "text-body hover:text-on-dark"
                }`}
                aria-label={voiceOn ? t("hc.voiceOff") : t("hc.voiceOn")}
                title={voiceOn ? t("hc.voiceOff") : t("hc.voiceOn")}
              >
                {voiceOn ? <Volume2Icon /> : <VolumeOffIcon />}
              </button>
            )}

            {/* Micrófono (entrada por voz) */}
            {voice.supported && (
              <button
                type="button"
                onClick={() => void handleMic()}
                disabled={launching || voice.recState === "transcribing"}
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-40 ${
                  voice.recState === "recording"
                    ? "animate-pulse bg-primary text-canvas"
                    : "text-body hover:bg-white/10 hover:text-on-dark"
                }`}
                aria-label={voice.recState === "recording" ? t("hc.recording") : t("hc.mic")}
                title={voice.recState === "recording" ? t("hc.recording") : t("hc.mic")}
              >
                {voice.recState === "transcribing" ? (
                  <span className="text-base leading-none">…</span>
                ) : (
                  <MicIcon />
                )}
              </button>
            )}

            {/* Enviar / Detener: durante el streaming el botón corta la generación. */}
            {busy ? (
              <button
                type="button"
                onClick={() => chat.stop?.()}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-on-dark transition-colors hover:bg-white/25"
                aria-label={t("hc.stop")}
                title={t("hc.stop")}
              >
                <StopIcon size={16} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={launching || !input.trim()}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent-mint text-ink transition-all hover:opacity-90 disabled:opacity-30"
                aria-label={t("hc.send")}
              >
                <ArrowUpIcon size={18} />
              </button>
            )}
          </div>

          {/* Input de archivo oculto (un solo botón de adjuntar) */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void addImages(e.target.files);
              e.target.value = "";
            }}
          />
        </form>
      </div>
    </div>
  );

  // ── Panel del artifact (preview) ────────────────────────────────────────
  // Solo es una propuesta renderizable si trae el objeto generado. El caso duplicado
  // devuelve proposal===null (se maneja por slug) y NO debe llegar aquí.
  const proposal = gen.proposal?.proposal ? gen.proposal : null;
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
              slug={proposal.slug}
              onRegenerate={() => void runRefine(t("hc.regenerateBrief"))}
              busy={gen.generating || launching}
            />
          </div>
          <div className="flex-1 animate-scale overflow-hidden">
            <ResponsivePreview
              html={proposal.html}
              onFullscreen={() => setFullscreenHtml(proposal.html)}
            />
          </div>
        </>
      ) : savedPage ? (
        <>
          <div className="flex items-center justify-between gap-2 border-b border-hairline p-3">
            <span className="eyebrow text-body">{savedPage.name ?? ""}</span>
          </div>
          <div className="flex-1 animate-scale overflow-hidden">
            <ResponsivePreview
              html={savedPage.html}
              onFullscreen={() => setFullscreenHtml(savedPage.html)}
            />
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

  // El panel del artifact SOLO aparece cuando hay algo que mostrar (web generada,
  // guardada o en construcción). Si no, el chat ocupa toda la pantalla.
  const hasArtifact = Boolean(gen.proposal?.proposal || savedPage || gen.generating || launching);

  return (
    <div className="flex h-full flex-1 flex-col">
      <TopNav />
      <div className="flex min-h-0 flex-1">
      <ConversationSidebar activeId={convId} onNew={handleNew} />

      {/* Desktop: chat solo (full) hasta que haya web → entonces split con el panel */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        {hasArtifact ? (
          <Group orientation="horizontal" className="h-full w-full">
            <Panel defaultSize="40%" minSize="28%">
              <div className="h-full overflow-hidden border-r border-hairline">{chatPanel}</div>
            </Panel>
            <Separator className="w-1 cursor-col-resize bg-hairline transition-colors hover:bg-accent-periwinkle" />
            <Panel defaultSize="60%" minSize="30%">
              {/* Entrada animada del panel cuando empieza a construirse la web */}
              <div className="h-full animate-slide-in-right overflow-hidden">{artifactPanel}</div>
            </Panel>
          </Group>
        ) : (
          <div className="h-full w-full">{chatPanel}</div>
        )}
      </div>

      {/* Móvil: chat full hasta que haya web → entonces tabs chat/preview */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        {hasArtifact ? (
          <>
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
          </>
        ) : (
          <div className="flex-1 overflow-hidden">{chatPanel}</div>
        )}
      </div>

      {fullscreenHtml !== null && (
        <PreviewFullscreen html={fullscreenHtml} onClose={() => setFullscreenHtml(null)} />
      )}

      {/* Confirmación tras pagar+publicar: el usuario ve el resultado y el enlace en vivo. */}
      {publishedSlug && (
        <div className="animate-msg fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-accent-mint/40 bg-surface-dark-soft px-4 py-3 text-sm text-on-dark shadow-lg">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-mint text-ink">
            <CheckIcon size={14} />
          </span>
          <span>{t("pub.success")}</span>
          <a
            href={`/p/${publishedSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-accent-mint px-3 py-1 font-medium text-ink transition-opacity hover:opacity-90"
          >
            {t("pub.view")}
          </a>
          <button
            type="button"
            onClick={() => setPublishedSlug(null)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-body hover:text-on-dark"
            aria-label={t("pub.dismiss")}
          >
            <XIcon size={14} />
          </button>
        </div>
      )}
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

/** Botón "copiar" para respuestas del agente: confirma con un check transitorio. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex h-7 w-7 items-center justify-center rounded-md text-body opacity-0 transition-all hover:bg-white/10 hover:text-on-dark group-hover:opacity-100"
      aria-label={label}
      title={label}
    >
      {copied ? <CheckIcon size={14} className="text-accent-mint" /> : <CopyIcon size={14} />}
    </button>
  );
}
