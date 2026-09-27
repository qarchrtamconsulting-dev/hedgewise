-- Auto-grading from final scores.
-- legs.odds_event_id / legs.sport_key: saved when a bet is sent from Tools, so it matches its game exactly.
-- auto_grades: one row per play settled from a final score (what Today lists as graded).
-- Safe to run more than once.
ALTER TABLE legs ADD COLUMN IF NOT EXISTS odds_event_id TEXT;
ALTER TABLE legs ADD COLUMN IF NOT EXISTS sport_key TEXT;
CREATE TABLE IF NOT EXISTS auto_grades (
  play_id UUID PRIMARY KEY REFERENCES plays(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  graded_at TIMESTAMPTZ DEFAULT now(),
  summary TEXT
);
ALTER TABLE auto_grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signed in full access" ON auto_grades;
CREATE POLICY "signed in full access" ON auto_grades FOR ALL TO authenticated USING (true) WITH CHECK (true);
