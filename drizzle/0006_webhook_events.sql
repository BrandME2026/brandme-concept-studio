-- 0006_webhook_events (WO-6): log de deduplicación de webhooks entrantes
-- (blueprint WebhookHandlerPrimitive / EP-02). El unique (vendor, event_id)
-- ES el mecanismo anti-replay: el primitivo inserta ANTES de procesar.
-- Tabla de plataforma SIN RLS.

CREATE TABLE IF NOT EXISTS webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor       TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_vendor_event
  ON webhook_events (vendor, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_expires
  ON webhook_events (expires_at);

-- DELETE: purga TTL oportunista del propio primitivo (no hay job runner aún).
GRANT SELECT, INSERT, DELETE ON webhook_events TO brandme_app;

-- Ventana de retención (EP-07): suficiente para cualquier replay realista.
INSERT INTO platform_config (feature_area, config_key, default_value) VALUES
  ('webhooks', 'event_retention_days', '30'::jsonb)
ON CONFLICT (feature_area, config_key) DO NOTHING;
