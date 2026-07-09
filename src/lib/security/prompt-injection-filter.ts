import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { getConfigValue } from "@/lib/config/config-store";
import { recordSecurityIncident } from "./incident-log";

/**
 * PromptInjectionFilter (WO-32, REQ-SEC-011 / blueprint ceadc4d9): gate
 * síncrono compartido ANTES de que cualquier query llegue al modelo. El
 * baseline vive en ConfigStore (security.prompt_injection_baseline — editable
 * sin deploy) y cubre las 4 categorías de AC-SEC-011.1. Las surfaces EXTIENDEN
 * con patrones propios; la API no ofrece forma de quitar ni estrechar el
 * baseline (ADR-002: piso de seguridad de plataforma).
 *
 * En detección: la surface DEBE saltarse la inferencia y responder su fallback.
 * El evento se registra en SecurityIncidentLog con categoría y LONGITUD de la
 * query (nunca el texto — protección de PII). El evento PostHog
 * `ai_surface_adversarial_query_detected` queda pendiente de PostHog (no
 * provisionado); el incident log es el registro sustituto documentado.
 */

export interface InjectionPattern {
  category: string;
  pattern: string; // regex (se compila case-insensitive)
}

export interface InjectionDetection {
  detected: boolean;
  category?: string;
}

const BASELINE_FALLBACK: InjectionPattern[] = [
  {
    category: "instruction_override",
    pattern:
      "ignor(e|a)\\s+(all\\s+|todas?\\s+las?\\s+)?(previous|prior|above|anteriores?|previas?)\\s+(instructions?|instrucciones)",
  },
  { category: "instruction_override", pattern: "ignora?\\s+(todas\\s+)?(las\\s+)?instrucciones" },
  { category: "instruction_override", pattern: "disregard\\s+(the\\s+)?(system|previous|above)" },
  {
    category: "system_prompt_extraction",
    pattern:
      "(show|reveal|print|repeat|display|muestra|revela|repite|imprime)[\\s\\S]{0,40}(system\\s+prompt|your\\s+(instructions|prompt)|tus?\\s+(instrucciones|prompt))",
  },
  {
    category: "role_play_injection",
    pattern:
      "(you\\s+are\\s+now|act\\s+as\\s+(if|an?)|pretend\\s+to\\s+be|eres\\s+ahora|act[úu]a\\s+como|finge\\s+(ser|que))",
  },
  {
    category: "delimiter_encoding",
    pattern: "(<\\|[^|]*\\|>|\\[\\[\\s*system\\s*\\]\\]|```\\s*system|BEGIN\\s+(SYSTEM|ADMIN))",
  },
];

function compile(patterns: InjectionPattern[]): Array<{ category: string; re: RegExp }> {
  const out: Array<{ category: string; re: RegExp }> = [];
  for (const p of patterns) {
    try {
      out.push({ category: p.category, re: new RegExp(p.pattern, "i") });
    } catch {
      console.warn(`[prompt-injection] patrón inválido ignorado: ${p.pattern}`);
    }
  }
  return out;
}

/**
 * Detecta prompt injection en `text`. El baseline SIEMPRE aplica; los
 * `extraPatterns` de la surface solo AÑADEN (imposible estrechar por diseño).
 * Registra la detección en el SecurityIncidentLog (fire-and-forget).
 */
export async function detectPromptInjection(
  text: string,
  opts: { surface: string; extraPatterns?: InjectionPattern[] },
): Promise<InjectionDetection> {
  const baseline = await getConfigValue<InjectionPattern[]>(
    "security",
    "prompt_injection_baseline",
    BASELINE_FALLBACK,
  );
  const compiled = compile([...baseline, ...(opts.extraPatterns ?? [])]);
  for (const { category, re } of compiled) {
    if (re.test(text)) {
      void recordSecurityIncident({
        type: "prompt_injection",
        severity: "low",
        surface: opts.surface,
        detail: { category, queryLength: text.length }, // longitud, nunca el texto
      });
      return { detected: true, category };
    }
  }
  return { detected: false };
}

/**
 * Respuesta de fallback para surfaces conversacionales (AC-SEC-011.3): la
 * inferencia se saltó; el cliente (useChat) recibe un mensaje normal del
 * asistente. Las surfaces definitivas (AMA Build 4, Concierge Build 11)
 * configurarán su propio copy; este es el fallback de las surfaces actuales.
 */
export function injectionFallbackResponse(message: string): Response {
  const stream = createUIMessageStream({
    execute({ writer }) {
      writer.write({ type: "text-start", id: "fallback" });
      writer.write({ type: "text-delta", id: "fallback", delta: message });
      writer.write({ type: "text-end", id: "fallback" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
