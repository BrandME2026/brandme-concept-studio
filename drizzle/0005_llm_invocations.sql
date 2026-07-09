-- 0005_llm_invocations (WO-4): telemetría por invocación LLM (fuente autoritativa
-- de atribución de costos, blueprint LLMWrapper) + seeds de config del wrapper.
-- Tabla de plataforma SIN RLS (exenta de la retención estándar por REQ-PF-021.2).

CREATE TABLE IF NOT EXISTS llm_invocations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_alias             TEXT NOT NULL CHECK (model_alias IN ('large','fast')),
  resolved_model_name     TEXT NOT NULL,
  input_tokens            INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_write_ttl_variant TEXT CHECK (cache_write_ttl_variant IN ('5min','1hour')),
  cache_read_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens           INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd      NUMERIC(10,6) NOT NULL DEFAULT 0,
  latency_ms              INTEGER NOT NULL DEFAULT 0,
  consultant_id           UUID REFERENCES consultants(id),
  agent_id                TEXT,
  invocation_mode         TEXT NOT NULL CHECK (invocation_mode IN ('realtime','batch')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_llm_invocations_created
  ON llm_invocations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_invocations_consultant
  ON llm_invocations (consultant_id) WHERE consultant_id IS NOT NULL;

GRANT SELECT, INSERT ON llm_invocations TO brandme_app;

-- Config del wrapper (EP-07). aliases large/fast según stack 8090 (OpenRouter →
-- Claude Sonnet/Haiku); la tabla autoritativa es el Cost Model (pendiente de
-- recomputación — daily_cost_cap_usd y pricing quedan vacíos hasta entonces).
INSERT INTO platform_config (feature_area, config_key, default_value) VALUES
  ('llm', 'alias_large',           '"anthropic/claude-sonnet-4.6"'::jsonb),
  ('llm', 'alias_fast',            '"anthropic/claude-haiku-4.5"'::jsonb),
  ('llm', 'cache_ttl_interactive', '"5m"'::jsonb),
  ('llm', 'cache_ttl_batch',       '"1h"'::jsonb),
  ('llm', 'fallback_models',
   '["anthropic/claude-opus-4.7","anthropic/claude-sonnet-4.6","google/gemini-3.1-pro-preview"]'::jsonb),
  ('llm', 'daily_cost_cap_usd',    'null'::jsonb),
  ('llm', 'pricing',               '{}'::jsonb)
ON CONFLICT (feature_area, config_key) DO NOTHING;
