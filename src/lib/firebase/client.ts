"use client";

/**
 * Cliente Firebase (solo navegador). Inicialización idempotente y OPCIONAL: si faltan
 * las NEXT_PUBLIC_FIREBASE_* la app sigue funcionando anónima (sin login ni analytics),
 * igual que la degradación de Stripe/DB. No expone secretos: la config es pública.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/** ¿Hay config suficiente para arrancar Firebase? (apiKey + projectId + appId). */
export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId);
}

let app: FirebaseApp | null = null;

/** App Firebase (singleton). null si no está configurada. Solo en navegador. */
export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined" || !isFirebaseConfigured()) return null;
  if (!app) app = getApps().length ? getApp() : initializeApp(config);
  return app;
}

/** Instancia de Auth. null si Firebase no está configurada. */
export function getFirebaseAuth(): Auth | null {
  const a = getFirebaseApp();
  return a ? getAuth(a) : null;
}

export { config as firebaseConfig };
