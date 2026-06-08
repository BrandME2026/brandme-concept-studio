"use client";

/**
 * Registro de eventos de analítica (Firebase Analytics / GA4). No-op si Analytics no
 * está disponible (SSR, sin config, navegador no soportado). Nunca lanza: la analítica
 * jamás debe romper un flujo de producto.
 */
import { isSupported, getAnalytics, logEvent, type Analytics } from "firebase/analytics";
import { getFirebaseApp } from "@/lib/firebase/client";

let analytics: Analytics | null = null;
let initTried = false;

async function ensureAnalytics(): Promise<Analytics | null> {
  if (analytics) return analytics;
  if (initTried) return analytics;
  initTried = true;
  if (typeof window === "undefined") return null;
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    if (!(await isSupported())) return null;
    analytics = getAnalytics(app);
  } catch {
    analytics = null;
  }
  return analytics;
}

/** Inicializa Analytics (llamar una vez en el cliente, p.ej. al montar la app). */
export function initAnalytics(): void {
  void ensureAnalytics();
}

/** Registra un evento. Seguro de llamar siempre: no-op si Analytics no está activo. */
export function track(event: string, params?: Record<string, unknown>): void {
  void ensureAnalytics().then((a) => {
    if (a) {
      try {
        logEvent(a, event, params);
      } catch {
        /* nunca romper por analítica */
      }
    }
  });
}
