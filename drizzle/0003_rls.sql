-- 0003_rls: la frontera estructural (ADR-001). NOT NULL + RLS con FORCE
-- (aplica también al owner) + políticas + GRANTs mínimos al rol de app.
--
-- Política tenant: el GUC app.consultant_id lo setea withTenant() por request
-- (SET LOCAL en transacción para pool). Sin GUC: NULLIF(...,'')::uuid = NULL →
-- SELECT devuelve cero filas y todo write falla el WITH CHECK.
-- Política system: escape EXPLÍCITO y enumerado para superficies públicas
-- (galería, /p/[slug], leads de visitantes, webhook Stripe, merge de login).
-- NO es BYPASSRLS: cada comando permitido está declarado tabla por tabla.
-- El publishGate (published + suscripción) se queda en el SQL de la app.

ALTER TABLE conversations ALTER COLUMN consultant_id SET NOT NULL;
ALTER TABLE generations   ALTER COLUMN consultant_id SET NOT NULL;
ALTER TABLE leads         ALTER COLUMN consultant_id SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN consultant_id SET NOT NULL;

-- conversations ───────────────────────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_all ON conversations FOR ALL
  USING      (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid)
  WITH CHECK (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
-- /p/[id] legacy y galería leen conversaciones publicadas sin tenant.
CREATE POLICY system_select ON conversations FOR SELECT
  USING (current_setting('app.scope', true) = 'system');
-- merge de login: reasignar filas del consultant provisional al canónico.
CREATE POLICY system_update ON conversations FOR UPDATE
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

-- generations ─────────────────────────────────────────────────────────────────
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_all ON generations FOR ALL
  USING      (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid)
  WITH CHECK (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
-- galería, /p/[slug], chat, sitemap, llms.txt, slugExists, lookup de leads.
CREATE POLICY system_select ON generations FOR SELECT
  USING (current_setting('app.scope', true) = 'system');
CREATE POLICY system_update ON generations FOR UPDATE
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

-- leads ───────────────────────────────────────────────────────────────────────
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_all ON leads FOR ALL
  USING      (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid)
  WITH CHECK (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
-- El visitante anónimo deja el lead desde la página pública (INSERT bajo system).
-- OJO: no hay system_select en leads (mínima superficie) → un INSERT ... RETURNING
-- bajo system falla por visibilidad; saveLead genera el id en la app.
CREATE POLICY system_insert ON leads FOR INSERT
  WITH CHECK (current_setting('app.scope', true) = 'system');
CREATE POLICY system_update ON leads FOR UPDATE
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

-- subscriptions ───────────────────────────────────────────────────────────────
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_all ON subscriptions FOR ALL
  USING      (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid)
  WITH CHECK (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
-- webhook Stripe (por stripe_customer_id) + join del publishGate.
CREATE POLICY system_select ON subscriptions FOR SELECT
  USING (current_setting('app.scope', true) = 'system');
CREATE POLICY system_update ON subscriptions FOR UPDATE
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

-- GRANTs mínimos al rol de runtime (sin DDL, sin DELETE donde no se usa) ───────
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON generations TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON leads TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON subscriptions TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON users TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON user_sessions TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON consultants TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON consultant_sessions TO brandme_app;
