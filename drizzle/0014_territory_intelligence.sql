-- 0014_territory_intelligence (WO-18): capa de datos demográficos (Build 4).
-- Modelos del blueprint d9e7cb5d: zip_demographic_data (señales ACS por ZIP,
-- COMPARTIDA entre consultants — entidad de plataforma), consultant_territories
-- (el set de ZIPs confirmado, lockeado post-Stage 1 — AC-TI-001.6),
-- zip_franchise_scores (score por combinación consultant-brand-ZIP, RLS) y
-- cross_consultant_zip_signals (agregados anónimos, solo system).
-- El heat map / portal llega en Build 8; esto es la capa que acumula datos.

CREATE TABLE IF NOT EXISTS zip_demographic_data (
  zip_code text PRIMARY KEY,
  median_hh_income integer,
  pop_growth_5yr_pct numeric(6,3),
  business_owner_pct numeric(6,3),
  owner_occupancy_rate numeric(6,3),
  age_35_65_pct numeric(6,3),
  age_25_52_pct numeric(6,3),
  age_65_plus_pct numeric(6,3),
  household_density_per_sq_mile numeric(10,2),
  acs_vintage_year integer NOT NULL,
  -- ACS suprimido / bajo umbral de población: se excluye del scoring, JAMÁS
  -- se estima ni sustituye (AC-TI-001.3).
  data_limited boolean NOT NULL DEFAULT false,
  last_fetched_at timestamptz NOT NULL DEFAULT now()
);

-- Territorio confirmado del consultant (lockeado post-confirmación; cambios
-- solo vía admin — AC-TI-001.6). Fila por consultant-ZIP.
CREATE TABLE IF NOT EXISTS consultant_territories (
  consultant_id uuid NOT NULL REFERENCES consultants(id),
  zip_code text NOT NULL,
  ingestion_status text NOT NULL DEFAULT 'pending'
    CONSTRAINT ct_status_check CHECK (ingestion_status IN ('pending','ingested','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consultant_id, zip_code)
);

CREATE TABLE IF NOT EXISTS zip_franchise_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL REFERENCES consultants(id),
  brand_id uuid REFERENCES brands(id), -- null = score global (sin vertical)
  zip_code text NOT NULL,
  score numeric(5,2) NOT NULL,
  demographic_component numeric(5,2) NOT NULL,
  performance_component numeric(5,2),
  weight_profile_used text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
-- Un score activo por combinación (brand null incluido: índices parciales).
CREATE UNIQUE INDEX IF NOT EXISTS idx_zfs_combo
  ON zip_franchise_scores (consultant_id, brand_id, zip_code) WHERE brand_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_zfs_combo_global
  ON zip_franchise_scores (consultant_id, zip_code) WHERE brand_id IS NULL;

CREATE TABLE IF NOT EXISTS cross_consultant_zip_signals (
  zip_code text PRIMARY KEY,
  contributing_consultant_count integer NOT NULL DEFAULT 0,
  aggregate_brandmepage_views bigint NOT NULL DEFAULT 0,
  aggregate_lead_volume integer NOT NULL DEFAULT 0,
  aggregate_qualified_lead_rate numeric(5,2),
  aggregate_conversion_rate numeric(5,2),
  last_computed_at timestamptz NOT NULL DEFAULT now()
);

-- RLS. zip_demographic_data y cross_consultant_zip_signals son de PLATAFORMA
-- (compartidas/anónimas): sin policy tenant → solo system las toca; el tenant
-- ve sus scores y su territorio.
ALTER TABLE zip_demographic_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE zip_demographic_data FORCE ROW LEVEL SECURITY;
CREATE POLICY system_all ON zip_demographic_data FOR ALL
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

ALTER TABLE consultant_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_territories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON consultant_territories FOR SELECT
  USING (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
CREATE POLICY system_all ON consultant_territories FOR ALL
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

ALTER TABLE zip_franchise_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE zip_franchise_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON zip_franchise_scores FOR SELECT
  USING (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
CREATE POLICY system_all ON zip_franchise_scores FOR ALL
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

ALTER TABLE cross_consultant_zip_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_consultant_zip_signals FORCE ROW LEVEL SECURITY;
CREATE POLICY system_all ON cross_consultant_zip_signals FOR ALL
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

GRANT SELECT, INSERT, UPDATE ON zip_demographic_data TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON consultant_territories TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON zip_franchise_scores TO brandme_app;
GRANT SELECT, INSERT, UPDATE ON cross_consultant_zip_signals TO brandme_app;

-- Perfiles de pesos (REQ-TI-002.1) + parámetros — TODO configurable sin deploy.
-- NOTA (inconsistencia del spec, flaggeada en 8090): el modelo ZipDemographicData
-- almacena 3 buckets de edad (35-65, 25-52, 65+) pero los perfiles citan rangos
-- 42-58 / 25-50 / 35-55 — se mapean al bucket almacenado más cercano.
INSERT INTO platform_config (feature_area, config_key, default_value, current_value) VALUES
  ('territory', 'weight_profiles', '{
    "global_default":             {"business_owner_pct": 30, "median_hh_income": 25, "age_35_65_pct": 20, "pop_growth_5yr_pct": 15, "owner_occupancy_rate": 10},
    "qsr_food_beverage":          {"household_density_per_sq_mile": 35, "median_hh_income": 25, "age_25_52_pct": 25, "business_owner_pct": 15},
    "senior_care":                {"age_65_plus_pct": 40, "median_hh_income": 25, "owner_occupancy_rate": 20, "pop_growth_5yr_pct": 15},
    "fitness_wellness":           {"median_hh_income": 35, "age_25_52_pct": 30, "business_owner_pct": 25, "pop_growth_5yr_pct": 10},
    "business_services_staffing": {"business_owner_pct": 40, "median_hh_income": 30, "age_35_65_pct": 20, "pop_growth_5yr_pct": 10}
  }'::jsonb, NULL),
  ('territory', 'performance_weight_pct',        '20'::jsonb, NULL),
  ('territory', 'min_contributing_consultants',  '2'::jsonb,  NULL),
  ('territory', 'acs_staleness_months',          '15'::jsonb, NULL),
  ('territory', 'ingest_retries',                '3'::jsonb,  NULL),
  ('territory', 'ingest_retry_base_ms',          '2000'::jsonb, NULL)
ON CONFLICT (feature_area, config_key) DO NOTHING;
