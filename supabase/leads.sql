-- Onboarding tab: intro-call times and the steps each lead has finished.
-- Google Form, funded and first bet are also read from existing data; these rows cover the manual steps.
-- Safe to run more than once.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS call_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS lead_steps (
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  step TEXT NOT NULL CHECK (step IN ('call','form','venmo','links','funded')),
  done_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (client_id, step)
);
ALTER TABLE lead_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signed in full access" ON lead_steps;
CREATE POLICY "signed in full access" ON lead_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);
