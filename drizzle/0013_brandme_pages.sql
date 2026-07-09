-- 0013_brandme_pages (WO-15): Agente 04 — BrandMePage Generation.
-- Modelos del blueprint a8518d73: brandme_pages (lifecycle, 1 por par
-- consultant-brand), brandme_page_configs (inmutable, 1 por corrida),
-- consultant_content_overrides (overrides versionados por campo),
-- brand_templates (override admin versionado) y preview_links.
-- Transiciones de estado SOLO vía ApprovalGateway/ReRenderScheduler
-- (trigger single-writer, mismo patrón que account_state de WO-5).

-- El consultant-slug es identidad ESTABLE del consultant (blueprint SlugService).
ALTER TABLE consultants ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultants_slug
  ON consultants (slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS brandme_page_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id),
  consultant_id uuid NOT NULL REFERENCES consultants(id),
  source text NOT NULL DEFAULT 'agent04_dynamic'
    CONSTRAINT bpc_source_check CHECK (source IN ('agent04_dynamic', 'brand_template')),
  brand_template_id uuid,
  identity_tokens jsonb NOT NULL,
  content_signals jsonb NOT NULL,
  generated_copy jsonb NOT NULL,
  fdd_financial_data jsonb,
  same_as_urls jsonb,
  -- Gate de compliance (AC-BEX-004.3): poblado por ComplianceBoundaryChecker
  -- (WO-13) antes de que el config entre al render pipeline.
  compliance_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bpc_pair ON brandme_page_configs (consultant_id, brand_id, created_at DESC);

CREATE TABLE IF NOT EXISTS brandme_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL REFERENCES consultants(id),
  brand_id uuid NOT NULL REFERENCES brands(id),
  consultant_slug text NOT NULL,
  brand_slug text NOT NULL,
  state text NOT NULL DEFAULT 'draft'
    CONSTRAINT bmp_state_check CHECK (state IN
      ('draft','pending_approval','published','stale','regenerating','offline','archived','gone')),
  config_id uuid REFERENCES brandme_page_configs(id),
  generated_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bmp_pair ON brandme_pages (consultant_id, brand_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bmp_slugs ON brandme_pages (consultant_slug, brand_slug);
CREATE INDEX IF NOT EXISTS idx_bmp_state ON brandme_pages (state);

-- Single-writer del lifecycle (contrato del blueprint): solo ApprovalGateway/
-- ReRenderScheduler (que setean el GUC en el MISMO statement) transicionan.
CREATE OR REPLACE FUNCTION enforce_bmp_state_writer() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.bmp_state_writer', true) IS DISTINCT FROM 'page-lifecycle' THEN
    RAISE EXCEPTION 'brandme_pages.state solo lo escriben ApprovalGateway/ReRenderScheduler (WO-15)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS brandme_pages_state_writer_upd ON brandme_pages;
CREATE TRIGGER brandme_pages_state_writer_upd
  BEFORE UPDATE ON brandme_pages
  FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION enforce_bmp_state_writer();

CREATE TABLE IF NOT EXISTS consultant_content_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brandmepage_id uuid NOT NULL REFERENCES brandme_pages(id) ON DELETE CASCADE,
  consultant_id uuid NOT NULL REFERENCES consultants(id),
  field_key text NOT NULL,
  current_value text NOT NULL,
  -- Write-once (REQ-BPG-014.3 "Restore original"): jamás se sobrescribe.
  original_agent_value text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'live'
    CONSTRAINT cco_status_check CHECK (status IN ('live','pending_review','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- A lo sumo un override VIVO por campo por página.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cco_live_field
  ON consultant_content_overrides (brandmepage_id, field_key) WHERE status = 'live';

CREATE OR REPLACE FUNCTION enforce_cco_original_once() RETURNS trigger AS $$
BEGIN
  IF NEW.original_agent_value IS DISTINCT FROM OLD.original_agent_value THEN
    RAISE EXCEPTION 'consultant_content_overrides.original_agent_value es write-once (WO-15)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cco_original_once ON consultant_content_overrides;
CREATE TRIGGER cco_original_once
  BEFORE UPDATE ON consultant_content_overrides
  FOR EACH ROW EXECUTE FUNCTION enforce_cco_original_once();

CREATE TABLE IF NOT EXISTS brand_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id),
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT false,
  identity_tokens jsonb NOT NULL,
  content_signals jsonb NOT NULL,
  authored_by uuid,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- A lo sumo un template ACTIVO por brand.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bt_active_brand
  ON brand_templates (brand_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS preview_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brandmepage_id uuid NOT NULL REFERENCES brandme_pages(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: páginas/configs/overrides son tenant-scoped (el consultant ve lo suyo);
-- el pipeline y la superficie pública (render por slug) corren bajo system.
-- brand_templates es de PLATAFORMA (autoría admin) → solo system.
-- preview_links se resuelven por token sin sesión → solo system.
ALTER TABLE brandme_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandme_pages FORCE ROW LEVEL SECURITY;
-- Solo LECTURA para el tenant (hallazgo de review R1, defensa en profundidad):
-- las escrituras de páginas son 100% system-scope (pipeline/gateway/scheduler);
-- una policy de UPDATE tenant permitiría mutar config_id/slugs esquivando el
-- single-writer del trigger (que solo vigila state).
CREATE POLICY tenant_select ON brandme_pages FOR SELECT
  USING (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
CREATE POLICY system_select ON brandme_pages FOR SELECT
  USING (current_setting('app.scope', true) = 'system');
CREATE POLICY system_insert ON brandme_pages FOR INSERT
  WITH CHECK (current_setting('app.scope', true) = 'system');
CREATE POLICY system_update ON brandme_pages FOR UPDATE
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

ALTER TABLE brandme_page_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandme_page_configs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON brandme_page_configs FOR SELECT
  USING (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
CREATE POLICY system_select ON brandme_page_configs FOR SELECT
  USING (current_setting('app.scope', true) = 'system');
CREATE POLICY system_insert ON brandme_page_configs FOR INSERT
  WITH CHECK (current_setting('app.scope', true) = 'system');
CREATE POLICY system_update ON brandme_page_configs FOR UPDATE
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

ALTER TABLE consultant_content_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_content_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_all ON consultant_content_overrides FOR ALL
  USING      (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid)
  WITH CHECK (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
CREATE POLICY system_select ON consultant_content_overrides FOR SELECT
  USING (current_setting('app.scope', true) = 'system');
CREATE POLICY system_update ON consultant_content_overrides FOR UPDATE
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

ALTER TABLE brand_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY system_all ON brand_templates FOR ALL
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

ALTER TABLE preview_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE preview_links FORCE ROW LEVEL SECURITY;
CREATE POLICY system_all ON preview_links FOR ALL
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

GRANT SELECT, INSERT, UPDATE ON brandme_pages TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON brandme_page_configs TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON consultant_content_overrides TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON brand_templates TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON preview_links TO brandme_app;

-- Config del Agente 04 (AC-BPG-004.3, 015.1, 016.1, 017.1).
INSERT INTO platform_config (feature_area, config_key, default_value, current_value) VALUES
  ('brandmepage', 'approval_required', 'true'::jsonb, NULL),
  ('brandmepage', 'concurrency_cap',   '10'::jsonb,   NULL),
  ('brandmepage', 'reserved_slugs',
   '["help","support","contact","admin","login","logout","signup","register","api","static","assets","blog","pricing","about","careers","legal","privacy","terms","sitemap","robots","dashboard","settings","schedule","gallery","embed","p","c","llms.txt"]'::jsonb,
   NULL),
  ('brandmepage', 'disallowed_terms',
   '["guaranteed income","guaranteed returns","get rich","risk-free","scam","fraud","mlm","pyramid","fuck","shit","bitch","puta","mierda","estafa","dinero garantizado","sin riesgo"]'::jsonb,
   NULL)
ON CONFLICT (feature_area, config_key) DO NOTHING;
