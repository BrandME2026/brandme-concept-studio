-- 0008_security (WO-32): SecurityIncidentLog append-only + config de seguridad
-- (CORS allowlist, formatos de upload por surface, baseline de prompt injection).

-- ── SecurityIncidentLog (REQ-SEC-010, blueprint Product Security) ────────────
-- Append-only: GRANTs sin UPDATE/DELETE + trigger que lo bloquea para TODO rol
-- (incluido el owner/migrator — la excepción sería dropear el trigger, acción
-- de migración auditable). Exenta de retención (REQ-PF-021 no aplica).

CREATE TABLE IF NOT EXISTS security_incidents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type TEXT NOT NULL CHECK (incident_type IN
    ('unauthorized_access','credential_exposure','dependency_exploit',
     'abnormal_access_pattern','prompt_injection','upload_rejected','other')),
  severity      TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  surface       TEXT,
  detail        JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_incidents_detected
  ON security_incidents (detected_at DESC);

CREATE OR REPLACE FUNCTION security_incidents_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'security_incidents es append-only: % prohibido (REQ-SEC-010.3)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_security_incidents_append_only ON security_incidents;
CREATE TRIGGER trg_security_incidents_append_only
  BEFORE UPDATE OR DELETE ON security_incidents
  FOR EACH ROW EXECUTE FUNCTION security_incidents_append_only();

GRANT SELECT, INSERT ON security_incidents TO brandme_app;

-- ── Config de seguridad (EP-07) ───────────────────────────────────────────────
INSERT INTO platform_config (feature_area, config_key, default_value) VALUES
  -- CORS (REQ-SEC-003): getbrandme.ai y subdominios; los subdominios se matchean
  -- en código con la entrada "*.getbrandme.ai". Sin wildcard global jamás.
  ('security', 'cors_allowed_origins',
   '["https://getbrandme.ai", "https://*.getbrandme.ai"]'::jsonb),
  -- Formatos permitidos por surface de upload (REQ-SEC-006). Surface actual:
  -- imágenes del studio (data URLs de generate). Nuevas surfaces = nueva clave.
  ('security', 'upload_formats_generate_images',
   '["image/png", "image/jpeg", "image/webp", "image/gif"]'::jsonb),
  -- Baseline de prompt injection (REQ-SEC-011 / AC-SEC-011.1): 4 categorías,
  -- ES+EN. REQ-AMA-009 (Build 4) es la referencia completa; este es el piso
  -- mínimo compartido que las surfaces EXTIENDEN y jamás estrechan.
  ('security', 'prompt_injection_baseline', '[
    {"category": "instruction_override", "pattern": "ignor(e|a)\\s+(all\\s+|todas?\\s+las?\\s+)?(previous|prior|above|anteriores?|previas?)\\s+(instructions?|instrucciones)"},
    {"category": "instruction_override", "pattern": "disregard\\s+(the\\s+)?(system|previous|above)"},
    {"category": "instruction_override", "pattern": "ignora?\\s+(todas\\s+)?(las\\s+)?instrucciones"},
    {"category": "instruction_override", "pattern": "olvida\\s+(todo\\s+)?(lo\\s+anterior|tus\\s+instrucciones)"},
    {"category": "system_prompt_extraction", "pattern": "(show|reveal|print|repeat|display|muestra|revela|repite|imprime)[\\s\\S]{0,40}(system\\s+prompt|your\\s+(instructions|prompt)|tus?\\s+(instrucciones|prompt))"},
    {"category": "role_play_injection", "pattern": "(you\\s+are\\s+now|act\\s+as\\s+(if|an?)|pretend\\s+to\\s+be|eres\\s+ahora|act[úu]a\\s+como|finge\\s+(ser|que))"},
    {"category": "delimiter_encoding", "pattern": "(<\\|[^|]*\\|>|\\[\\[\\s*system\\s*\\]\\]|```\\s*system|BEGIN\\s+(SYSTEM|ADMIN))"}
  ]'::jsonb)
ON CONFLICT (feature_area, config_key) DO NOTHING;
