-- Hedgewise: onboarding checklist (which apps each client has set up)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

CREATE TABLE IF NOT EXISTS client_books (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  offer TEXT NOT NULL,                     -- key from lib/playbook.ts, e.g. 'fd-sb'
  stage TEXT NOT NULL DEFAULT 'not_started'
    CHECK (stage IN ('not_started','sent','signed_up','deposited','done','skipped')),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, offer)
);
CREATE INDEX IF NOT EXISTS client_books_client_idx ON client_books(client_id);

ALTER TABLE client_books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signed in full access" ON client_books;
CREATE POLICY "signed in full access" ON client_books FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Google Form intake ─────────────────────────────────────────
-- The form's script calls intake_submit() with a secret key. It creates the client
-- (stage: onboarding) or updates them if the name already exists, and marks the
-- books they already had as "skip" so you only send apps they can still get promos on.

CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signed in full access" ON app_settings;
CREATE POLICY "signed in full access" ON app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO app_settings (key, value)
  VALUES ('intake_secret', md5(random()::text || clock_timestamp()::text) || md5(random()::text))
  ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION intake_submit(secret TEXT, payload JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid UUID;
  nm TEXT := trim(payload->>'name');
BEGIN
  IF secret IS NULL OR secret <> (SELECT value FROM app_settings WHERE key = 'intake_secret') THEN
    RAISE EXCEPTION 'invalid intake secret';
  END IF;
  IF nm IS NULL OR nm = '' THEN RAISE EXCEPTION 'name is required'; END IF;

  SELECT id INTO cid FROM clients WHERE lower(trim(name)) = lower(nm) LIMIT 1;
  IF cid IS NULL THEN
    INSERT INTO clients (name, phone, email, state, referred_by, notes, status, books)
    VALUES (nm, nullif(payload->>'phone',''), nullif(payload->>'email',''), nullif(upper(payload->>'state'),''),
            nullif(payload->>'referred_by',''), nullif(payload->>'notes',''), 'onboarding', '{}')
    RETURNING id INTO cid;
  ELSE
    UPDATE clients SET
      phone       = coalesce(nullif(payload->>'phone',''), phone),
      email       = coalesce(nullif(payload->>'email',''), email),
      state       = coalesce(nullif(upper(payload->>'state'),''), state),
      referred_by = coalesce(referred_by, nullif(payload->>'referred_by','')),
      notes       = CASE WHEN nullif(payload->>'notes','') IS NULL THEN notes
                         ELSE coalesce(notes || E'\n', '') || (payload->>'notes') END
    WHERE id = cid;
  END IF;

  INSERT INTO client_books (client_id, offer, stage, notes)
  SELECT cid, x, 'skipped', 'Already had an account (intake form)'
  FROM jsonb_array_elements_text(coalesce(payload->'already_registered', '[]'::jsonb)) AS x
  ON CONFLICT (client_id, offer) DO NOTHING;

  RETURN cid;
END $$;

REVOKE ALL ON FUNCTION intake_submit(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intake_submit(TEXT, JSONB) TO anon, authenticated;

-- To see your intake key (paste it into the Google Form script):
--   SELECT value FROM app_settings WHERE key = 'intake_secret';
