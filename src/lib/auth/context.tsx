"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { track } from "@/lib/analytics/track";

interface AuthValue {
  /** Usuario Firebase o null (anónimo / no logueado). */
  user: User | null;
  /** true mientras se resuelve el estado inicial de auth. */
  loading: boolean;
  /** true si Firebase está configurado (si no, el login no se ofrece). */
  available: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Contexto de autenticación (Firebase). Login OPCIONAL: si Firebase no está
 * configurado, `available` es false y la app sigue anónima. Al loguearse, vincula
 * el sessionId anónimo actual al usuario (POST /api/auth/link) para no perder el
 * historial creado antes del login.
 */
/** Vincula el sessionId anónimo al usuario en el backend (best-effort). */
async function linkSession(u: User) {
  try {
    const token = await u.getIdToken();
    await fetch("/api/auth/link", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // No bloqueamos el login si la vinculación falla (degradación elegante).
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const available = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  // Solo hay "loading" real si Firebase está configurado (esperamos al listener).
  // Sin Firebase, nunca cargamos → empieza y queda en false (sin setState en effect).
  const [loading, setLoading] = useState(available);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return; // sin Firebase: loading ya es false, no tocamos estado
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) void linkSession(u);
    });
    return unsub;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signInWithPopup(auth, new GoogleAuthProvider());
    track("sign_in", { method: "google" });
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signInWithEmailAndPassword(auth, email, password);
    track("sign_in", { method: "email" });
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await createUserWithEmailAndPassword(auth, email, password);
    track("sign_up", { method: "email" });
  }, []);

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await fbSignOut(auth);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      available,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    }),
    [user, loading, available, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
