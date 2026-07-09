-- 0010_llm_pricing: siembra los rates verificados EN VIVO contra OpenRouter
-- (2026-07-09, GET /api/v1/models — pass-through del list price de Anthropic;
-- análisis completo en docs/COST-MODEL-OPENROUTER.md). Aprobado por Junior
-- 2026-07-09 ("hazlo"). Con esto la telemetría llm_invocations (WO-4) atribuye
-- costos reales. El techo llm.daily_cost_cap_usd queda null (sin techo) hasta
-- que haya proforma firmada.

UPDATE platform_config SET default_value = '{
  "anthropic/claude-sonnet-4.6":   {"input_per_mtok": 3.00, "output_per_mtok": 15.00, "cache_read_per_mtok": 0.30,  "cache_write_per_mtok": 3.75},
  "anthropic/claude-haiku-4.5":    {"input_per_mtok": 1.00, "output_per_mtok": 5.00,  "cache_read_per_mtok": 0.10,  "cache_write_per_mtok": 1.25},
  "anthropic/claude-opus-4.7":     {"input_per_mtok": 5.00, "output_per_mtok": 25.00, "cache_read_per_mtok": 0.50,  "cache_write_per_mtok": 6.25},
  "openai/gpt-5.5":                {"input_per_mtok": 5.00, "output_per_mtok": 30.00, "cache_read_per_mtok": 0.50},
  "deepseek/deepseek-v4-flash":    {"input_per_mtok": 0.09, "output_per_mtok": 0.18,  "cache_read_per_mtok": 0.018},
  "google/gemini-3.1-pro-preview": {"input_per_mtok": 2.00, "output_per_mtok": 12.00, "cache_read_per_mtok": 0.20,  "cache_write_per_mtok": 0.375}
}'::jsonb
WHERE feature_area = 'llm' AND config_key = 'pricing';
