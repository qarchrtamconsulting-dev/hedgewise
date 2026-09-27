-- Today checklist: remembers what you've texted, done or skipped.
-- One row per client + item + day. Items themselves come from the cadence rules in lib/cadence.ts.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS task_marks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  due_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('texted','done','skipped')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, kind, due_on)
);
ALTER TABLE task_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signed in full access" ON task_marks;
CREATE POLICY "signed in full access" ON task_marks FOR ALL TO authenticated USING (true) WITH CHECK (true);
