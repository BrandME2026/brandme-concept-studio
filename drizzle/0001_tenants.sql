-- 0001_tenants: entidad Consultant (tenant core) + mapping de sesiones +
-- columnas consultant_id (nullable hasta el backfill de 0002; NOT NULL en 0003).

CREATE TABLE IF NOT EXISTS consultants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT REFERENCES users(id), -- users.id ES el Firebase UID; NULL = consultant anónimo
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultants_firebase_uid
  ON consultants (firebase_uid) WHERE firebase_uid IS NOT NULL;

-- La cookie bmc_session identifica el navegador; el tenant es el consultant.
CREATE TABLE IF NOT EXISTS consultant_sessions (
  session_id    TEXT PRIMARY KEY,
  consultant_id UUID NOT NULL REFERENCES consultants(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consultant_sessions_consultant
  ON consultant_sessions (consultant_id);

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS consultant_id UUID REFERENCES consultants(id);
ALTER TABLE generations   ADD COLUMN IF NOT EXISTS consultant_id UUID REFERENCES consultants(id);
ALTER TABLE leads         ADD COLUMN IF NOT EXISTS consultant_id UUID REFERENCES consultants(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS consultant_id UUID REFERENCES consultants(id);

CREATE INDEX IF NOT EXISTS idx_conversations_consultant
  ON conversations (consultant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_consultant
  ON generations (consultant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_consultant
  ON leads (consultant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_consultant
  ON subscriptions (consultant_id);

-- Default desde la variable de sesión RLS: los INSERT existentes no necesitan
-- cambiar — bajo withTenant() el GUC ya está seteado y la fila hereda el tenant.
-- Sin contexto el default es NULL y el NOT NULL (0003) rechaza el INSERT.
ALTER TABLE conversations ALTER COLUMN consultant_id
  SET DEFAULT NULLIF(current_setting('app.consultant_id', true), '')::uuid;
ALTER TABLE generations ALTER COLUMN consultant_id
  SET DEFAULT NULLIF(current_setting('app.consultant_id', true), '')::uuid;
ALTER TABLE subscriptions ALTER COLUMN consultant_id
  SET DEFAULT NULLIF(current_setting('app.consultant_id', true), '')::uuid;
-- leads: SIN default — el visitante es anónimo; el consultant sale del lookup
-- por slug bajo system scope y se pasa explícito en el INSERT.
