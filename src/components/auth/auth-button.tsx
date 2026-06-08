"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { AuthModal } from "./auth-modal";

/**
 * Control de sesión (header). Sin usuario: botón "Iniciar sesión" → modal.
 * Con usuario: avatar/inicial + menú con "Cerrar sesión". Si Firebase no está
 * configurado (`available` false), no renderiza nada (login opcional).
 */
export function AuthButton() {
  const t = useT();
  const { user, available, loading, signOut } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!available || loading) return null;

  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-lg border border-white/15 px-3 py-1 text-xs text-on-dark transition-colors hover:border-accent-periwinkle"
        >
          {t("auth.signIn")}
        </button>
        {modalOpen && <AuthModal onClose={() => setModalOpen(false)} />}
      </>
    );
  }

  const initial = (user.displayName || user.email || "?").charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-accent-periwinkle text-xs font-medium text-ink"
        aria-label={user.displayName ?? user.email ?? "account"}
      >
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photoURL} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>
      {menuOpen && (
        <div className="absolute right-0 z-50 mt-1 w-40 rounded-lg border border-white/10 bg-surface-dark-soft py-1 text-on-dark shadow-lg">
          <div className="truncate px-3 py-1.5 text-xs text-body">
            {user.email ?? user.displayName}
          </div>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              void signOut();
            }}
            className="w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/10"
          >
            {t("auth.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
