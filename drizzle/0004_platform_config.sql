-- 0004_platform_config (WO-7): tabla PlatformConfig + seeds de los tunables
-- actuales. Read path EP-07 (ConfigStore); el write path admin llega en Build 6.
-- last_modified_by SIN FK: la identidad admin no existe aún (Build 6) — drift
-- documentado en el implementation plan.

CREATE TABLE IF NOT EXISTS platform_config (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_area     TEXT NOT NULL,
  config_key       TEXT NOT NULL,
  current_value    JSONB,
  default_value    JSONB NOT NULL,
  last_modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified_by UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_config_area_key
  ON platform_config (feature_area, config_key);

-- Solo lectura para el runtime; escribe el admin (Build 6) / migrator.
GRANT SELECT ON platform_config TO brandme_app;

-- Seeds: default_value = valor vigente hoy en código/env. current_value NULL
-- (= "sin override de admin"). Idempotente por ON CONFLICT.
INSERT INTO platform_config (feature_area, config_key, default_value) VALUES
  ('rate_limiting', 'generate_per_min', '5'::jsonb),
  ('rate_limiting', 'extract_per_min',  '6'::jsonb),
  ('rate_limiting', 'chat_per_min',     '20'::jsonb),
  ('rate_limiting', 'agent_per_min',    '20'::jsonb),
  ('rate_limiting', 'resolve_per_min',  '15'::jsonb),
  ('rate_limiting', 'leads_per_min',    '5'::jsonb),
  ('rate_limiting', 'checkout_per_min', '5'::jsonb),
  ('rate_limiting', 'speech_per_min',   '10'::jsonb),
  ('llm', 'daily_cap',           '300'::jsonb),
  ('llm', 'model_alias_alta',    '"openai/gpt-5.5"'::jsonb),
  ('llm', 'model_alias_rapido',  '"anthropic/claude-sonnet-4.6"'::jsonb),
  ('extract', 'max_concurrent',  '3'::jsonb)
ON CONFLICT (feature_area, config_key) DO NOTHING;
