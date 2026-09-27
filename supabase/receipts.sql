-- Receipts: a play texted to a client is saved as 'sent' and only becomes a tracked
-- bet ('open') once you confirm it was placed. Already applied to the live database.
ALTER TABLE plays DROP CONSTRAINT IF EXISTS plays_status_check;
ALTER TABLE plays ADD CONSTRAINT plays_status_check CHECK (status IN ('sent','open','settled','void'));
-- client_summary (see tracker.sql) ignores 'sent' plays for last_play and started_on.
