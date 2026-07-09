-- 0009_discoverability (WO-41): access log de AI crawlers (REQ-SKL-001) +
-- config de la capa de discoverability (REQ-SKL-002). Tabla de plataforma SIN
-- RLS; el dashboard que la agrega llega en Build 6 (Admin Console).

CREATE TABLE IF NOT EXISTS crawler_access_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path         TEXT NOT NULL,
  user_agent   TEXT,
  crawler_name TEXT, -- clasificado contra discoverability.known_crawlers; NULL = no reconocido
  referrer     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crawler_access_logs_created
  ON crawler_access_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawler_access_logs_crawler
  ON crawler_access_logs (crawler_name) WHERE crawler_name IS NOT NULL;

GRANT SELECT, INSERT ON crawler_access_logs TO brandme_app;

INSERT INTO platform_config (feature_area, config_key, default_value) VALUES
  -- REQ-SKL-002 / AC-SKL-002.1: fase de la plataforma, editable sin deploy.
  -- Valores válidos: closed_development | friendly_beta | public_mvp.
  ('discoverability', 'platform_phase', '"closed_development"'::jsonb),
  -- Patrones de clasificación de AI crawlers (nombre → substring lowercase del UA).
  ('discoverability', 'known_crawlers', '{
    "OAI-SearchBot": "oai-searchbot",
    "ChatGPT-User": "chatgpt-user",
    "PerplexityBot": "perplexitybot",
    "Perplexity-User": "perplexity-user",
    "Claude-User": "claude-user",
    "Claude-SearchBot": "claude-searchbot",
    "Applebot": "applebot",
    "Bingbot": "bingbot",
    "GPTBot": "gptbot",
    "ClaudeBot": "claudebot",
    "Google-Extended": "google-extended",
    "CCBot": "ccbot",
    "Meta-ExternalAgent": "meta-externalagent",
    "Bytespider": "bytespider"
  }'::jsonb)
ON CONFLICT (feature_area, config_key) DO NOTHING;
