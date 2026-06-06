"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  STEPS,
  CONFIRM_ACTIONS,
  BRIEF_STORAGE_KEY,
  buildBrief,
  type Step,
  type OnboardingAnswers,
} from "@/lib/onboarding";

type Turn = { id: string; role: "assistant" | "user"; text: string };

/**
 * Chat de onboarding (wizard determinista). Conversación por pasos sobre el hero dark:
 * texto libre + chips. Al confirmar, resuelve la marca elegida vía /api/resolve, guarda
 * el brief en sessionStorage y navega al studio. No usa LLM para el flujo (solo /api/resolve).
 */
export function OnboardingChat() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<OnboardingAnswers>>({});
  const [history, setHistory] = useState<Turn[]>([]);
  const [textInput, setTextInput] = useState("");
  const [multiSelection, setMultiSelection] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [typing, setTyping] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const turnSeq = useRef(0);
  const nextId = () => `t${turnSeq.current++}`;

  const step = STEPS[stepIndex] as Step | undefined;
  const brandsRef = useRef<string[]>([]);

  /**
   * Entra a un paso: lo fija, y tras un breve "typing" inserta su pregunta. Si el paso
   * "first" no aplica (≤1 marca elegida) lo salta (sin recursión). Toda la mutación de
   * estado ocurre dentro del timer (async), no en un effect — evita renders en cascada.
   */
  const enterStep = useCallback((index: number) => {
    let target = index;
    let next = STEPS[target] as Step | undefined;
    if (next?.key === "first" && brandsRef.current.length <= 1) {
      target += 1;
      next = STEPS[target] as Step | undefined;
    }
    setStepIndex(target);
    if (!next) return;
    const question = next.question;
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setHistory((h) => [...h, { id: nextId(), role: "assistant", text: question }]);
    }, 450);
  }, []);

  // Arranque: lanzar el primer paso una sola vez al montar.
  useEffect(() => {
    enterStep(0);
  }, [enterStep]);

  // Auto-scroll al fondo en cada turno o cuando aparece el typing.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [history, typing]);

  // Opciones del paso single "first": las marcas que el usuario seleccionó.
  const firstOptions = useMemo(() => answers.brands ?? [], [answers.brands]);

  const advance = useCallback(
    (userText: string, patch: Partial<OnboardingAnswers>) => {
      if (patch.brands) brandsRef.current = patch.brands;
      setHistory((h) => [...h, { id: nextId(), role: "user", text: userText }]);
      setAnswers((a) => ({ ...a, ...patch }));
      setTextInput("");
      setMultiSelection([]);
      setError(null);
      enterStep(stepIndex + 1);
    },
    [enterStep, stepIndex],
  );

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!step || step.kind !== "text") return;
    const value = textInput.trim();
    if (!value) return;
    if (step.minLength && value.length < step.minLength) {
      setError(`Please write at least ${step.minLength} characters.`);
      return;
    }
    const field =
      step.key === "name" ? "nameAndFirm" : step.key === "markets" ? "markets" : "positioning";
    advance(value, { [field]: value });
  }

  function toggleMulti(option: string) {
    setMultiSelection((sel) =>
      sel.includes(option) ? sel.filter((o) => o !== option) : [...sel, option],
    );
    setError(null);
  }

  function handleMultiContinue() {
    if (multiSelection.length === 0) {
      setError("Pick at least one brand.");
      return;
    }
    // Si solo hay una marca, ya queda como firstBrand y el paso "first" se salta.
    const patch: Partial<OnboardingAnswers> =
      multiSelection.length === 1
        ? { brands: multiSelection, firstBrand: multiSelection[0] }
        : { brands: multiSelection };
    advance(multiSelection.join(", "), patch);
  }

  function handleSingle(option: string) {
    if (step?.key === "first") {
      advance(option, { firstBrand: option });
    } else {
      advance(option, { investorProfile: option });
    }
  }

  const handleFinish = useCallback(async () => {
    if (submitting) return;
    const a = answers as OnboardingAnswers;
    const brand = a.firstBrand ?? a.brands?.[0];
    if (!brand) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: brand }),
      });
      const json = await res.json().catch(() => null);
      if (json?.success && json.data?.url) {
        sessionStorage.setItem(BRIEF_STORAGE_KEY, buildBrief(a));
        router.push(`/studio?url=${encodeURIComponent(json.data.url)}`);
        return;
      }
      setError(
        json?.error?.message ??
          `Couldn't identify the official site for ${brand}. Try again.`,
      );
    } catch {
      setError("Connection failed. Check your network and try again.");
    } finally {
      setSubmitting(false);
    }
  }, [answers, router, submitting]);

  return (
    <div className="w-full max-w-xl">
      {/* Historial de la conversación */}
      <div
        ref={scrollRef}
        className="flex max-h-[42vh] flex-col gap-3 overflow-y-auto pr-1"
      >
        {history.map((turn) => (
          <div
            key={turn.id}
            className={cn(
              "flex animate-step",
              turn.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-md px-4 py-2.5 text-sm leading-relaxed",
                turn.role === "user"
                  ? "bg-accent-periwinkle text-ink"
                  : "border border-hairline bg-surface-dark-soft text-on-dark",
              )}
            >
              {turn.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="rounded-md border border-hairline bg-surface-dark-soft px-4 py-3">
              <span className="inline-flex gap-1">
                <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Zona de interacción del paso actual (oculta mientras el agente "escribe") */}
      {step && !typing && (
        <div className="mt-4">
          {step.kind === "text" && (
            <form onSubmit={handleTextSubmit} className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder={step.placeholder}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                aria-label={step.question}
                autoFocus
                className="flex-1 rounded-sm border border-white/15 bg-surface-dark-soft px-4 py-3 text-on-dark placeholder:text-body focus:border-accent-periwinkle focus:outline-none"
              />
              <Button type="submit" variant="mint">
                Send
              </Button>
            </form>
          )}

          {step.kind === "multi" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {step.options.map((opt) => (
                  <Chip
                    key={opt}
                    label={opt}
                    selected={multiSelection.includes(opt)}
                    onClick={() => toggleMulti(opt)}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="mint"
                onClick={handleMultiContinue}
                className="self-start"
              >
                Continue
              </Button>
            </div>
          )}

          {step.kind === "single" && (
            <div className="flex flex-wrap gap-2">
              {(step.key === "first" ? firstOptions : step.options).map((opt) => (
                <Chip key={opt} label={opt} onClick={() => handleSingle(opt)} />
              ))}
            </div>
          )}

          {step.kind === "confirm" && (
            <div className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2">
                {CONFIRM_ACTIONS.map((action) => (
                  <li key={action} className="flex items-start gap-2 text-sm text-on-dark">
                    <span className="mt-0.5 text-accent-mint">→</span>
                    {action}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="mint"
                onClick={handleFinish}
                disabled={submitting}
                className="self-start"
              >
                {submitting ? "Shipping…" : "Yes, ship it →"}
              </Button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-accent-orange" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Chip({
  label,
  selected = false,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-4 py-1.5 font-mono text-sm uppercase tracking-[0.08px] transition-colors",
        selected
          ? "border-accent-periwinkle bg-accent-periwinkle text-ink"
          : "border-hairline text-on-dark hover:border-accent-periwinkle",
      )}
    >
      {label}
    </button>
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
