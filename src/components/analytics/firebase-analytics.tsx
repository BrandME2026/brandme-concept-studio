"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics/track";

/**
 * Inicializa Firebase Analytics (GA4) en el cliente. No renderiza nada. No-op si
 * Analytics no está soportado o Firebase no está configurado. NO debe montarse en
 * las páginas públicas /p/[slug] (tienen CSP sandbox propia).
 */
export function FirebaseAnalytics() {
  useEffect(() => {
    initAnalytics();
  }, []);
  return null;
}
