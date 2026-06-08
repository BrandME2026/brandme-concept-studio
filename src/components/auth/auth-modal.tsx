"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { GoogleIcon, XIcon } from "@/components/ui/icons";

/** Modal de login: Google + email/password (alterna entrar/registrarse). */
export function AuthModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(false);
    try {
      await fn();
      onClose();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-surface-dark-soft p-6 text-on-dark"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-body transition-colors hover:bg-white/10 hover:text-on-dark"
          aria-label={t("auth.close")}
        >
          <XIcon size={16} />
        </button>

        <h2 className="text-lg font-medium tracking-tight">{t("auth.title")}</h2>
        <p className="mt-1 text-sm text-body">{t("auth.subtitle")}</p>

        <button
          type="button"
          disabled={busy}
          onClick={() => void run(signInWithGoogle)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white px-4 py-2.5 text-sm font-medium text-[#1f1f1f] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <GoogleIcon size={18} />
          {t("auth.google")}
        </button>

        <div className="my-4 flex items-center gap-3 text-xs text-body">
          <span className="h-px flex-1 bg-white/10" />
          {t("auth.or")}
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() =>
              mode === "signin"
                ? signInWithEmail(email, password)
                : signUpWithEmail(email, password),
            );
          }}
          className="flex flex-col gap-2.5"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.email")}
            className="rounded-xl border border-white/15 bg-transparent px-3 py-2.5 text-sm text-on-dark placeholder:text-body/70 focus:border-accent-periwinkle/70 focus:outline-none"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.password")}
            className="rounded-xl border border-white/15 bg-transparent px-3 py-2.5 text-sm text-on-dark placeholder:text-body/70 focus:border-accent-periwinkle/70 focus:outline-none"
          />
          {error && <p className="text-xs text-primary">{t("auth.error")}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-xl bg-accent-mint px-4 py-2.5 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {mode === "signin" ? t("auth.continue") : t("auth.create")}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs text-body transition-colors hover:text-on-dark"
        >
          {mode === "signin" ? t("auth.noAccount") : t("auth.haveAccount")}
        </button>
      </div>
    </div>
  );
}
