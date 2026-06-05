"use client";

import { useEffect, useState, useCallback } from "react";
import type { DesignTokens } from "@/types/design";
import type { DesignProposal } from "@/lib/schemas";
import { ExtractionPanel } from "./extraction-panel";
import { ChatPanel } from "./chat-panel";
import { PreviewFrame } from "./preview-frame";
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
        const json = await res.json();
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
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokens: extraction.tokens,
          screenshot: extraction.screenshot,
          brief: "Propón un diseño inspirado en esta web.",
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Error");
      setProposal(json.data);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error generando");
    } finally {
      setGenerating(false);
    }
  }, [extraction]);

  if (phase === "extracting") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-canvas-dark text-on-dark">
        <div className="bg-brand-gradient h-12 w-12 animate-pulse rounded-sm" />
        <span className="eyebrow text-body">Extrayendo diseño de {url}</span>
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
        <div className="flex items-center justify-between border-b border-hairline p-4">
          <span className="eyebrow text-body">Preview</span>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "Generando…" : "Generar propuesta"}
          </Button>
        </div>
        <div className="flex-1 overflow-hidden">
          {proposal ? (
            <PreviewFrame html={proposal.html} />
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
