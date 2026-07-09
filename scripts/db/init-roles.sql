-- Modelo de roles del TenantIsolationLayer (WO-3, ADR-001).
--
-- brandme_migrator: owner de todos los objetos + BYPASSRLS; SOLO para
--   migraciones/tooling, NUNCA en el request path (ADR-001: "migration
--   connections bypass RLS and are restricted to migration tooling").
-- brandme_app: rol de runtime. Sin DDL, sin BYPASSRLS. Todo acceso de la app
--   pasa por las políticas RLS; FORCE ROW LEVEL SECURITY cubre además el caso
--   de un owner sin BYPASSRLS.
--
-- En Railway este script se ejecuta UNA vez a mano (ver docs/BACKEND.md).
-- En Docker local lo ejecuta el initdb del contenedor.

CREATE ROLE brandme_migrator LOGIN PASSWORD 'migrator' BYPASSRLS;
CREATE ROLE brandme_app LOGIN PASSWORD 'app' NOBYPASSRLS;

CREATE DATABASE brandme OWNER brandme_migrator;
GRANT CONNECT ON DATABASE brandme TO brandme_app;
