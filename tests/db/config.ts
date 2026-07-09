/**
 * URLs de la base de test (Docker local, `pnpm db:up`). Se pueden sobreescribir
 * por env para apuntar a otra instancia. Dos roles deliberados (ver
 * scripts/db/init-roles.sql): la app corre SIN privilegios de owner ni BYPASSRLS.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://brandme_app:app@localhost:54329/brandme";

export const TEST_DATABASE_URL_MIGRATIONS =
  process.env.TEST_DATABASE_URL_MIGRATIONS ??
  "postgres://brandme_migrator:migrator@localhost:54329/brandme";
