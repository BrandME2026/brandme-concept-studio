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
    },
  },
});
