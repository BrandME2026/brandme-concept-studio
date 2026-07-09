-- 0000_baseline: esquema histórico EXACTO de los ensureSchema() runtime que este
-- WO retira (src/lib/db/{users,conversations,history,leads,subscriptions}.ts).
-- Todo idempotente (IF NOT EXISTS): aplica limpio sobre una DB vacía (Docker)
-- Y sobre la DB de Railway ya existente.

-- users + user_sessions (src/lib/db/users.ts)
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT,
  display_name TEXT,
  photo_url    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_sessions (
  session_id TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id);

-- conversations (src/lib/db/conversations.ts)
CREATE TABLE IF NOT EXISTS conversations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     TEXT NOT NULL,
  title          TEXT NOT NULL DEFAULT 'Nueva conversación',
  messages       JSONB NOT NULL DEFAULT '[]'::jsonb,
  url            TEXT,
  generated_html TEXT,
  design_md      TEXT,
  name           TEXT,
  screenshot     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversations_session
  ON conversations (session_id, updated_at DESC);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS meta_title TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS meta_description TEXT;

-- generations (src/lib/db/history.ts)
CREATE TABLE IF NOT EXISTS generations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   TEXT NOT NULL,
  url          TEXT NOT NULL,
  name         TEXT NOT NULL,
  design_md    TEXT NOT NULL,
  html         TEXT NOT NULL,
  screenshot   TEXT,
  interactions TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_generations_session
  ON generations (session_id, created_at DESC);
ALTER TABLE generations ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS meta_title TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS keywords TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS faq TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS css TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS form_fields TEXT;
-- Gate de publicación: las filas ya existentes quedan publicadas (legacy público);
-- el default pasa a false para inserciones nuevas.
ALTER TABLE generations ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE generations ALTER COLUMN published SET DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_generations_slug
  ON generations (slug) WHERE slug IS NOT NULL;

-- leads (src/lib/db/leads.ts)
CREATE TABLE IF NOT EXISTS leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL,
  brand       TEXT,
  city        TEXT,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  message     TEXT,
  source      TEXT NOT NULL DEFAULT 'form',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_slug ON leads (slug, created_at DESC);

-- subscriptions (src/lib/db/subscriptions.ts)
CREATE TABLE IF NOT EXISTS subscriptions (
  session_id             TEXT PRIMARY KEY,
  stripe_customer_id     TEXT NOT NULL,
  stripe_subscription_id TEXT,
  status                 TEXT NOT NULL DEFAULT 'incomplete',
  current_period_end     TIMESTAMPTZ,
  email                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_customer
  ON subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subid
  ON subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
