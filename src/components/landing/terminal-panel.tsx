"use client";

import { OnboardingChat } from "@/components/onboarding-chat";
import { useT } from "@/lib/i18n/context";

/**
 * Chrome estilo terminal alrededor del onboarding REAL. El header/footer son
 * decorativos (mockup); el OnboardingChat interno mantiene su lógica (resuelve
 * marca → /studio). No se toca OnboardingChat.
 */
export function TerminalPanel() {
  const t = useT();
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-canvas-dark shadow-2xl">
      {/* Header de ventana */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-accent-orange" />
        <span className="h-3 w-3 rounded-full bg-accent-mint" />
        <span className="h-3 w-3 rounded-full bg-accent-periwinkle" />
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-body">
          {t("ll.hero.terminalTitle")}
        </span>
      </div>

      {/* Onboarding real */}
      <div className="px-4 py-4">
        <OnboardingChat />
      </div>

      {/* Footer decorativo (mockup) */}
      <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
        <span className="truncate font-mono text-[10px] text-body">
          francast.ai/c/shawn/burger-king-dallas
        </span>
        <a
          href="#gallery"
          className="flex-shrink-0 rounded-full bg-accent-orange px-3 py-1 font-mono text-[10px] uppercase text-on-dark transition-opacity hover:opacity-90"
        >
          {t("ll.hero.viewPage")}
        </a>
      </div>
    </div>
  );
}
