-- Hedgewise: withdrawal tracking for the Today page. Safe to re-run.
ALTER TABLE plays ADD COLUMN IF NOT EXISTS withdrawal TEXT CHECK (withdrawal IN ('pending','requested','received','skipped'));
ALTER TABLE plays ADD COLUMN IF NOT EXISTS withdrawal_amount NUMERIC;
ALTER TABLE plays ADD COLUMN IF NOT EXISTS withdrawal_updated_at TIMESTAMPTZ;
