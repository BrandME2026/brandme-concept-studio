import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit para GENERAR futuras migraciones por diff contra src/lib/db/schema.ts.
 * Las migraciones se aplican con scripts/db-migrate.ts (runner propio; ver su
 * cabecera para el porqué). Siempre con el rol migrator.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL_MIGRATIONS ?? "",
  },
});
