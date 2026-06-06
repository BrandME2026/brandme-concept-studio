"use client";

import { useCallback, useState } from "react";
import type { DesignProposal } from "@/lib/schemas";
import type { DesignTokens } from "@/types/design";
import type { Locale } from "@/lib/i18n/locale";

interface Proposal {
  proposal: DesignProposal;
  designMd: string;
  html: string;
  slug?: string | null;
  brand?: string | null;
  city?: string | null;
  /** true si el servidor reusó una página existente (marca+ciudad ya generada). */
  duplicate?: boolean;
}

interface GenerateInput {
  tokens: DesignTokens;
  screenshot: string;
  brief: string;
  language: Locale;
  quality?: "rapido" | "alta";
  /** Contexto de marca para personalización + SEO de la página generada. */
  seo?: { brand?: string; city?: string; positioning?: string; whatsapp?: string; email?: string };
}

/**
 * Encapsula la generación de propuesta (/api/generate, stream NDJSON). Extraído de
 * studio-client para reusarlo desde el chat unificado (launchBrand / refineDesign).
 */
export function useGeneration() {
  const [generating, setGenerating] = useState(false);
  const [partial, setPartial] = useState<Partial<DesignProposal> | null>(null);
  const [seenFields, setSeenFields] = useState<Set<string>>(new Set());
  const [reasoning, setReasoning] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setProposal(null);
    setPartial(null);
    setSeenFields(new Set());
    setReasoning("");
    setError(null);
  }, []);

  const generate = useCallback(async (input: GenerateInput): Promise<Proposal | null> => {
    setGenerating(true);
    reset();
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokens: input.tokens,
          screenshot: input.screenshot,
          brief: input.brief,
          language: input.language,
          images: [],
          quality: input.quality ?? "alta",
          seo: input.seo,
        }),
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "No se pudo generar la propuesta");
      }

      // Anti-duplicado: el servidor responde JSON (no stream) si la marca+ciudad ya
      // existe. En ese caso devolvemos el slug existente para que el llamador redirija.
      if (res.headers.get("content-type")?.includes("application/json")) {
        const json = await res.json().catch(() => null);
        if (json?.data?.duplicate && json.data.slug) {
          const dup: Proposal = {
            proposal: null as unknown as DesignProposal,
            designMd: "",
            html: "",
            slug: json.data.slug,
            duplicate: true,
          };
          setProposal(dup);
          return dup;
        }
        throw new Error(json?.error?.message ?? "No se pudo generar la propuesta");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const seen = new Set<string>();
      let result: Proposal | null = null;

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
            result = {
              proposal: evt.proposal,
              designMd: evt.designMd,
              html: evt.html,
              slug: evt.slug ?? null,
              brand: evt.brand ?? null,
              city: evt.city ?? null,
            };
            setProposal(result);
          } else if (evt.type === "error") {
            throw new Error(evt.message ?? "Error generando");
          }
        }
      }
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error generando");
      return null;
    } finally {
      setGenerating(false);
    }
  }, [reset]);

  return { generate, generating, partial, seenFields, reasoning, proposal, error, reset };
}
