-- Hedgewise: saved tool presets (shared across all your devices)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run

CREATE TABLE IF NOT EXISTS presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tool TEXT NOT NULL,           -- 'lowhold' | 'freebet' | 'riskfree' | 'boost'
  name TEXT NOT NULL,
  state JSONB NOT NULL,         -- { config, inputs }
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon full access presets" ON presets;
CREATE POLICY "anon full access presets" ON presets FOR ALL TO anon USING (true) WITH CHECK (true);
