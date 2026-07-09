-- 0012_brand_extraction (WO-13): Agente 02 — Brand Extraction.
-- Modelos del blueprint 1b5a8f04: brands (entidad de plataforma, sin RLS, como
-- platform_config), brand_extractions (1 fila por corrida; la más reciente no
-- degradada es la activa) y brand_extraction_health_records (cola de admin
-- para corridas degradadas/fallidas). Parámetros de crawl/LLM en platform_config
-- (feature_area 'extraction') — ajustables sin deploy (AC-BEX-001.1/012.1).

CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  host text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_host ON brands (host);

CREATE TABLE IF NOT EXISTS brand_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id),
  triggered_by_consultant_id uuid REFERENCES consultants(id), -- null = corrida de admin
  status text NOT NULL DEFAULT 'running'
    CONSTRAINT brand_extractions_status_check
    CHECK (status IN ('running', 'completed', 'degraded', 'failed')),
  identity_tokens jsonb,
  content_signals jsonb,
  vertical_category text
    CONSTRAINT brand_extractions_vertical_check
    CHECK (vertical_category IS NULL OR vertical_category IN (
      'qsr_food_beverage','fitness_wellness','home_services',
      'business_services_staffing','education_tutoring','health_beauty',
      'senior_care','childrens_services','pet_services','auto_services',
      'retail','other')),
  vertical_confidence text
    CONSTRAINT brand_extractions_vconf_check
    CHECK (vertical_confidence IS NULL OR vertical_confidence IN ('high','medium','low')),
  -- Clasificación de baja confianza: se guarda 'other' en vertical_category y
  -- el intento original queda aquí para visibilidad de ops (AC-BEX-007.3).
  vertical_low_confidence_guess text,
  fdd_financial_data jsonb,
  brand_testimonials jsonb,
  brand_accolades jsonb,
  intake_protocol_coverage jsonb,
  per_field_status jsonb,
  degradation_flag boolean NOT NULL DEFAULT false,
  compliance_verified_at timestamptz,
  scrape_urls text[] NOT NULL DEFAULT '{}',
  same_as_urls jsonb,
  -- Drift documentado (WO-10 blocked): el contenido crudo del scrape vive en
  -- Postgres detrás de la interfaz ScrapeStore; migrar a StorageService
  -- (Firebase Storage) cuando exista acceso admin al proyecto.
  raw_content jsonb,
  failure_class text
    CONSTRAINT brand_extractions_failure_check
    CHECK (failure_class IS NULL OR failure_class IN (
      'robots_txt_disallow','paywall_or_login_wall','js_spa_no_content',
      'persistent_transient_error','llm_malformed_response',
      'llm_empty_extraction','llm_api_error','llm_timeout','quality_degradation')),
  extracted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brand_extractions_brand ON brand_extractions (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brand_extractions_consultant ON brand_extractions (triggered_by_consultant_id);

-- RLS: el consultant ve SOLO sus corridas; el pipeline (proceso de sistema)
-- escribe bajo system scope. Corridas de admin (consultant null) solo system.
ALTER TABLE brand_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_extractions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON brand_extractions FOR SELECT
  USING (triggered_by_consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
CREATE POLICY system_select ON brand_extractions FOR SELECT
  USING (current_setting('app.scope', true) = 'system');
CREATE POLICY system_insert ON brand_extractions FOR INSERT
  WITH CHECK (current_setting('app.scope', true) = 'system');
CREATE POLICY system_update ON brand_extractions FOR UPDATE
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

CREATE TABLE IF NOT EXISTS brand_extraction_health_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_extraction_id uuid NOT NULL REFERENCES brand_extractions(id),
  brand_id uuid NOT NULL REFERENCES brands(id),
  failure_class text NOT NULL
    CONSTRAINT behr_failure_check
    CHECK (failure_class IN (
      'robots_txt_disallow','paywall_or_login_wall','js_spa_no_content',
      'persistent_transient_error','llm_malformed_response',
      'llm_empty_extraction','llm_api_error','llm_timeout','quality_degradation')),
  affected_consultant_ids uuid[] NOT NULL DEFAULT '{}',
  consultant_option_selected text NOT NULL DEFAULT 'none'
    CONSTRAINT behr_option_check
    CHECK (consultant_option_selected IN ('A','B','C','none')),
  url_attempts jsonb NOT NULL DEFAULT '[]',
  resolution_path text NOT NULL DEFAULT 'none'
    CONSTRAINT behr_resolution_check
    CHECK (resolution_path IN ('url_retry','admin_re_extraction','brand_template','accepted_degradation','none')),
  priority_flags text[] NOT NULL DEFAULT '{}',
  degraded_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
-- Un registro ACTIVO (sin resolver) por brand a la vez; los resueltos se archivan.
CREATE UNIQUE INDEX IF NOT EXISTS idx_behr_active_brand
  ON brand_extraction_health_records (brand_id) WHERE resolved_at IS NULL;

-- Cola de admin: sin superficie de consultant hasta Build 6 → solo system scope.
ALTER TABLE brand_extraction_health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_extraction_health_records FORCE ROW LEVEL SECURITY;
CREATE POLICY system_all ON brand_extraction_health_records FOR ALL
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

GRANT SELECT, INSERT, UPDATE ON brands TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON brand_extractions TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON brand_extraction_health_records TO brandme_app;

-- Parámetros de Agent 02 (AC-BEX-001.1, 012.1, 013.1): current_value null =
-- rige default_value; ajustables en runtime vía admin (ConfigStore, WO-7).
INSERT INTO platform_config (feature_area, config_key, default_value, current_value) VALUES
  ('extraction', 'max_pages',         '5'::jsonb,        NULL),
  ('extraction', 'max_depth',         '2'::jsonb,        NULL),
  ('extraction', 'page_timeout_ms',   '30000'::jsonb,    NULL),
  ('extraction', 'scrape_retries',    '3'::jsonb,        NULL),
  ('extraction', 'retry_base_ms',     '2000'::jsonb,     NULL),
  ('extraction', 'llm_retries',       '2'::jsonb,        NULL),
  ('extraction', 'concurrency_cap',   '10'::jsonb,       NULL),
  ('extraction', 'max_content_bytes', '10485760'::jsonb, NULL),
  ('extraction', 'llm_pass_timeout_ms', '120000'::jsonb, NULL)
ON CONFLICT (feature_area, config_key) DO NOTHING;
