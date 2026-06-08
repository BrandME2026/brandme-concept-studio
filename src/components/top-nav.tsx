"use client";

import { LanguageToggle } from "./language-toggle";
import { AuthButton } from "./auth/auth-button";

/**
 * Barra superior (navbar) que cruza toda la app: wordmark a la izquierda, controles
 * de sesión/idioma a la derecha. Descarga el sidebar (antes apretaba wordmark + login
 * + idioma en 240px). Visible en todos los breakpoints.
 */
export function TopNav() {
  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-hairline bg-canvas-dark px-4 text-on-dark">
      <span className="text-base font-medium tracking-tight">
        Brand<span className="text-accent-orange">ME</span>.ai
      </span>
      <div className="flex items-center gap-2">
        <AuthButton />
        <LanguageToggle variant="dark" />
      </div>
    </header>
  );
}
