-- 0011_account_state (WO-5): AccountStateMachine — estado de cuenta del
-- consultant (pending → active → subscribed → active_post_cancel) con
-- single-writer a nivel BD (ADR-001 del blueprint AccountStateMachine), y
-- onboarding_sessions con milestones write-once. Default 'active': los
-- consultants del producto actual nacen de sesiones anónimas con acceso pleno
-- (login opcional); 'pending' se crea SOLO vía createPendingConsultant()
-- (Stage 1 ChatIntake, WO-12).

ALTER TABLE consultants
  ADD COLUMN IF NOT EXISTS account_state text NOT NULL DEFAULT 'active'
    CONSTRAINT consultants_account_state_check
    CHECK (account_state IN ('pending', 'active', 'subscribed', 'active_post_cancel'));

-- Single-writer: solo la máquina (que setea este GUC en el MISMO statement)
-- puede cambiar account_state o insertar en un estado distinto del default.
CREATE OR REPLACE FUNCTION enforce_account_state_writer() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.account_state_writer', true) IS DISTINCT FROM 'account-state-machine' THEN
    RAISE EXCEPTION 'consultants.account_state solo lo escribe AccountStateMachine (WO-5, ADR-001)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS consultants_account_state_writer_upd ON consultants;
CREATE TRIGGER consultants_account_state_writer_upd
  BEFORE UPDATE ON consultants
  FOR EACH ROW WHEN (OLD.account_state IS DISTINCT FROM NEW.account_state)
  EXECUTE FUNCTION enforce_account_state_writer();

DROP TRIGGER IF EXISTS consultants_account_state_writer_ins ON consultants;
CREATE TRIGGER consultants_account_state_writer_ins
  BEFORE INSERT ON consultants
  FOR EACH ROW WHEN (NEW.account_state IS DISTINCT FROM 'active')
  EXECUTE FUNCTION enforce_account_state_writer();

-- Backfill: consultants con suscripción vigente ya son 'subscribed'. El GUC es
-- transaction-scoped (el runner envuelve cada migración en BEGIN/COMMIT).
SELECT set_config('app.account_state_writer', 'account-state-machine', true);
UPDATE consultants SET account_state = 'subscribed'
 WHERE account_state = 'active'
   AND id IN (
     SELECT consultant_id FROM subscriptions
      WHERE consultant_id IS NOT NULL
        AND status IN ('active', 'trialing')
        AND (current_period_end IS NULL OR current_period_end > now())
   );

-- onboarding_sessions: 1 fila por consultant, timestamps UTC de cada milestone
-- (Stage 1 submitted, Stage 2 password set, checkout completed) — write-once.
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  consultant_id uuid PRIMARY KEY REFERENCES consultants(id) ON DELETE CASCADE,
  stage1_submitted_at timestamptz,
  stage2_password_set_at timestamptz,
  checkout_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION enforce_onboarding_write_once() RETURNS trigger AS $$
BEGIN
  IF OLD.stage1_submitted_at IS NOT NULL
     AND NEW.stage1_submitted_at IS DISTINCT FROM OLD.stage1_submitted_at THEN
    RAISE EXCEPTION 'onboarding_sessions.stage1_submitted_at es write-once (WO-5)';
  END IF;
  IF OLD.stage2_password_set_at IS NOT NULL
     AND NEW.stage2_password_set_at IS DISTINCT FROM OLD.stage2_password_set_at THEN
    RAISE EXCEPTION 'onboarding_sessions.stage2_password_set_at es write-once (WO-5)';
  END IF;
  IF OLD.checkout_completed_at IS NOT NULL
     AND NEW.checkout_completed_at IS DISTINCT FROM OLD.checkout_completed_at THEN
    RAISE EXCEPTION 'onboarding_sessions.checkout_completed_at es write-once (WO-5)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS onboarding_sessions_write_once ON onboarding_sessions;
CREATE TRIGGER onboarding_sessions_write_once
  BEFORE UPDATE ON onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION enforce_onboarding_write_once();

-- RLS (patrón WO-3): el tenant ve/escribe lo suyo; la máquina corre bajo
-- system scope (webhook Stripe y auth/link llegan sin contexto tenant).
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_all ON onboarding_sessions FOR ALL
  USING      (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid)
  WITH CHECK (consultant_id = NULLIF(current_setting('app.consultant_id', true), '')::uuid);
CREATE POLICY system_select ON onboarding_sessions FOR SELECT
  USING (current_setting('app.scope', true) = 'system');
CREATE POLICY system_insert ON onboarding_sessions FOR INSERT
  WITH CHECK (current_setting('app.scope', true) = 'system');
CREATE POLICY system_update ON onboarding_sessions FOR UPDATE
  USING      (current_setting('app.scope', true) = 'system')
  WITH CHECK (current_setting('app.scope', true) = 'system');

GRANT SELECT, INSERT, UPDATE ON onboarding_sessions TO brandme_app;
