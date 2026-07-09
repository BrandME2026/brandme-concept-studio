/** URLs de la DB de test (Docker local, `pnpm db:up`) compartidas por config, setup y specs. */
export const APP_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://brandme_app:app@localhost:54329/brandme";

export const MIGRATIONS_DB_URL =
  process.env.TEST_DATABASE_URL_MIGRATIONS ??
  "postgres://brandme_migrator:migrator@localhost:54329/brandme";
