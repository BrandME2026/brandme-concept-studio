-- 0002_backfill: deriva consultants desde el modelo actual (session_id + user_sessions)
-- y rellena consultant_id en todas las tablas tenant-scoped. Idempotente y con
-- asserts fail-fast: si algo queda NULL la migración revienta (rollback) en vez
-- de dejar datos a medias.

-- 1. Un consultant por cada user Firebase con sesiones vinculadas.
INSERT INTO consultants (firebase_uid)
SELECT DISTINCT us.user_id
FROM user_sessions us
WHERE NOT EXISTS (SELECT 1 FROM consultants c WHERE c.firebase_uid = us.user_id);

INSERT INTO consultant_sessions (session_id, consultant_id)
SELECT us.session_id, c.id
FROM user_sessions us
JOIN consultants c ON c.firebase_uid = us.user_id
ON CONFLICT (session_id) DO NOTHING;

-- 2. Un consultant propio por cada sesión huérfana (sin login) con datos.
--    Loop plpgsql: volumen bajo (prototipo) y claridad > astucia en un backfill.
DO $$
DECLARE
  orphan TEXT;
  cid UUID;
BEGIN
  FOR orphan IN
    SELECT DISTINCT session_id FROM (
      SELECT session_id FROM conversations
      UNION SELECT session_id FROM generations
      UNION SELECT session_id FROM subscriptions
    ) all_sessions
    WHERE session_id NOT IN (SELECT session_id FROM consultant_sessions)
  LOOP
    INSERT INTO consultants (firebase_uid) VALUES (NULL) RETURNING id INTO cid;
    INSERT INTO consultant_sessions (session_id, consultant_id) VALUES (orphan, cid);
  END LOOP;
END $$;

-- 3. Rellenar consultant_id por session_id.
UPDATE conversations t SET consultant_id = m.consultant_id
FROM consultant_sessions m
WHERE t.session_id = m.session_id AND t.consultant_id IS NULL;

UPDATE generations t SET consultant_id = m.consultant_id
FROM consultant_sessions m
WHERE t.session_id = m.session_id AND t.consultant_id IS NULL;

UPDATE subscriptions t SET consultant_id = m.consultant_id
FROM consultant_sessions m
WHERE t.session_id = m.session_id AND t.consultant_id IS NULL;

-- 4. leads no tienen sesión propia: heredan el consultant del dueño de la página (slug).
UPDATE leads l SET consultant_id = g.consultant_id
FROM generations g
WHERE g.slug = l.slug AND l.consultant_id IS NULL;

-- 5. Asserts fail-fast antes del SET NOT NULL (0003).
DO $$
DECLARE
  t TEXT;
  remaining BIGINT;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversations','generations','subscriptions','leads'] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE consultant_id IS NULL', t) INTO remaining;
    IF remaining > 0 THEN
      RAISE EXCEPTION 'backfill incompleto: % filas de % con consultant_id NULL', remaining, t;
    END IF;
  END LOOP;
END $$;
