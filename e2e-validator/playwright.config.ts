import { join } from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * E2E de aislamiento de tenants (WO-3, COV_PF_TENANT_001). Corre la app REAL
 * (next dev) apuntando al Postgres Docker con el ROL DE APP (brandme_app, sin
 * BYPASSRLS). Los tests usan APIRequestContext (cookies independientes por
 * tenant) — no hace falta navegador.
 *
 * Prerrequisito: `pnpm db:up` (el global-setup resetea y migra la DB).
 */

import { APP_DB_URL } from "./db-urls";

const PORT = 3105;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1, // estado de DB compartido
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    cwd: join(__dirname, ".."),
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: APP_DB_URL,
      // TTL corto SOLO para e2e: permite probar la liveness (<60s, REQ-PF-020.3)
      // sin esperar el TTL de producción. El contrato de 60s es el default real.
      CONFIG_CACHE_TTL_MS: "2000",
      // Stripe dummy para COV_PF_WEBHOOK_001: la firma se verifica con crypto
      // LOCAL (constructEvent), jamás se llama a la API de Stripe. Con esto el
      // paywall queda ACTIVO en el server e2e — los tenants del spec de
      // aislamiento se siembran con suscripción activa.
      STRIPE_SECRET_KEY: "sk_test_dummy_e2e",
      STRIPE_PRICE_ID: "price_e2e_dummy", // isStripeConfigured exige secret + price
      STRIPE_WEBHOOK_SECRET: "whsec_e2e_dummy",
    },
  },
});
