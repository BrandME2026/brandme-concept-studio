-- 0007_observability_config (WO-8): umbral EP-07 de la alerta por tasa de
-- errores del ObservabilityWrapper (AC-PF-008.3).

INSERT INTO platform_config (feature_area, config_key, default_value) VALUES
  ('observability', 'error_rate_threshold_per_min', '10'::jsonb)
ON CONFLICT (feature_area, config_key) DO NOTHING;
