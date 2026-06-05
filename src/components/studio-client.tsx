"use client";

import { useEffect, useState, useCallback } from "react";
import type { DesignTokens } from "@/types/design";
import type { DesignProposal } from "@/lib/schemas";
import type { Language } from "@/lib/ai/prompts";
import { ExtractionPanel } from "./extraction-panel";
import { ChatPanel } from "./chat-panel";
import { PreviewFrame } from "./preview-frame";
import { GenerationProgress } from "./generation-progress";
import { Button } from "./ui/button";

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

export function StudioClient({ url }: { url: string }) {
  const [phase, setPhase] = useState<Phase>("extracting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [generating, setGenerating] = useState(false);
  const [language, setLanguage] = useState<Language>("es");
  // Estado de progreso de la generación en vivo.
  const [partial, setPartial] = useState<Partial<DesignProposal> | null>(null);
  const [seenFields, setSeenFields] = useState<Set<string>>(new Set());

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
        // Defensa: si el server devuelve HTML de error (500), res.json() rompería.
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

  const handleGenerate = useCallback(async () => {
    if (!extraction) return;
    setGenerating(true);
    setErrorMsg(null);
    setProposal(null);
    setPartial(null);
    setSeenFields(new Set());

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokens: extraction.tokens,
          screenshot: extraction.screenshot,
          brief: "Propón un diseño inspirado en esta web.",
          language,
        }),
      });

      // Errores estructurados (no-stream) llegan como JSON con 4xx/5xx.
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "No se pudo generar la propuesta");
      }

      // Consumir el stream NDJSON línea a línea.
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
  }, [extraction, language]);

  if (phase === "extracting") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-canvas-dark text-on-dark">
        <div className="bg-brand-gradient h-12 w-12 animate-pulse rounded-sm" />
        <span className="eyebrow text-body">Extrayendo diseño de {url}</span>
        <p className="max-w-xs text-center text-xs text-body">
          Renderizamos la web completa para leer sus colores, tipografía y
          layout reales. Puede tardar unos segundos.
        </p>
      </div>
    );
  }

  if (phase === "error" || !extraction) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-canvas-dark text-on-dark">
        <h1 className="text-2xl font-medium">No se pudo analizar la web</h1>
        <p className="text-body">{errorMsg}</p>
      </div>
    );
  }

  return (
    <div className="grid flex-1 grid-cols-1 lg:grid-cols-3">
      <aside className="border-r border-hairline lg:max-h-[calc(100vh)] lg:overflow-hidden">
        <ExtractionPanel
          tokens={extraction.tokens}
          screenshot={extraction.screenshot}
        />
      </aside>

      <section className="border-r border-hairline lg:max-h-screen">
        <ChatPanel tokens={extraction.tokens} />
      </section>

      <section className="flex flex-col lg:max-h-screen">
        <div className="flex items-center justify-between gap-3 border-b border-hairline p-4">
          <span className="eyebrow text-body">Preview</span>
          <div className="flex items-center gap-2">
            <LanguageToggle value={language} onChange={setLanguage} disabled={generating} />
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? "Generando…" : "Generar propuesta"}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {proposal ? (
            <PreviewFrame html={proposal.html} />
          ) : generating ? (
            <GenerationProgress partial={partial} seen={seenFields} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm">
              {errorMsg ? (
                <span className="text-accent-orange" role="alert">
                  {errorMsg}
                </span>
              ) : (
                <span className="text-body">
                  Genera una propuesta para ver el preview en vivo.
                </span>
              )}
            </div>
          )}
        </div>
        {proposal && (
          <details className="border-t border-hairline p-4">
            <summary className="eyebrow cursor-pointer text-body">
              DESIGN.md
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-sm bg-canvas-dark p-3 text-xs text-on-dark">
              {proposal.designMd}
            </pre>
          </details>
        )}
      </section>
    </div>
  );
}

function LanguageToggle({
  value,
  onChange,
  disabled,
}: {
  value: Language;
  onChange: (l: Language) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-sm border border-hairline p-0.5">
      {(["es", "en"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          disabled={disabled}
          onClick={() => onChange(lang)}
          className={`rounded-xs px-2 py-1 font-mono text-xs uppercase transition-colors ${
            value === lang ? "bg-primary text-on-primary" : "text-body"
          }`}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
