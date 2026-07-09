-- 0015_testimonials (WO-38): Testimonials Block — el único bloque de contenido
-- estático autorado por el consultant en la BrandMePage. Datos de PERFIL del
-- consultant (aplican a TODAS sus páginas, no por brand). Máx 5 activos
-- (AC-TES-001.3, enforced en app + tests). Las sugerencias brand-sourced
-- vienen del payload del Agente 02 (brand_testimonials); los descartes se
-- registran para no reaparecer salvo nueva extracción (AC-TES-005.2).

CREATE TABLE IF NOT EXISTS testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL REFERENCES consultants(id),
  quote text NOT NULL,
  display_name text NOT NULL,
  role_context text,
  visible boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual'
    CONSTRAINT testimonials_source_check CHECK (source IN ('manual', 'brand_suggested')),
  source_brand_name text,
  source_url text,
  -- Quality filter (AC-TES-004.1): términos vetados → pending_review; la página
  -- viva no cambia hasta resolverse.
  status text NOT NULL DEFAULT 'live'
    CONSTRAINT testimonials_status_check CHECK (status IN ('live', 'pending_review', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_testimonials_consultant ON testimonials (consultant_id, position);

-- Sugerencias brand-sourced descartadas (no reaparecen salvo nueva extracción).
CREATE TABLE IF NOT EXISTS testimonial_dismissals (
  consultant_id uuid NOT NULL REFERENCES consultants(id),
  extraction_id uuid NOT NULL REFERENCES brand_extractions(id),
  quote_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consultant_id, extraction_id, quote_hash)
);

-- RLS (hallazgo de review R1, patrón WO-15/brandme_pages): el tenant puede
-- CREAR, LEER y BORRAR lo suyo pero JAMÁS hacer UPDATE — un UPDATE tenant
-- permitiría auto-aprobar un pending_review saltándose el quality filter.
-- Toda mutación (status, visible, position) corre bajo system scope.
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON testimonials FOR SELECT
  USING (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
CREATE POLICY tenant_insert ON testimonials FOR INSERT
  WITH CHECK (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
CREATE POLICY tenant_delete ON testimonials FOR DELETE
  USING (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
CREATE POLICY system_select ON testimonials FOR SELECT
  USING (current_setting('app.scope', true) = 'system');
CREATE POLICY system_update ON testimonials FOR UPDATE
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');
CREATE POLICY system_delete ON testimonials FOR DELETE
  USING (current_setting('app.scope', true) = 'system');

ALTER TABLE testimonial_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonial_dismissals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_all ON testimonial_dismissals FOR ALL
  USING      (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid)
  WITH CHECK (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
-- listBrandSuggestions corre bajo system (junta extracciones + páginas).
CREATE POLICY system_select ON testimonial_dismissals FOR SELECT
  USING (current_setting('app.scope', true) = 'system');

GRANT SELECT, INSERT, UPDATE, DELETE ON testimonials TO brandme_app;
GRANT SELECT, INSERT ON testimonial_dismissals TO brandme_app;

-- Threshold de colapso (AC-TES-002.5): rango válido 1-5, default 5 (sin colapso).
INSERT INTO platform_config (feature_area, config_key, default_value, current_value) VALUES
  ('brandmepage', 'testimonials_visible_before_collapse', '5'::jsonb, NULL)
ON CONFLICT (feature_area, config_key) DO NOTHING;
