-- ════════════════════════════════════════════════════════════════
-- Hedgewise client tracker + login lock
-- Run once in Supabase: SQL Editor -> New query -> paste all -> Run
-- Safe to re-run. Existing clients/promos data is kept.
-- ════════════════════════════════════════════════════════════════

-- ── Clients: new columns ───────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS split NUMERIC DEFAULT 0.35;      -- client's share of profit (0.30 = 30%)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';   -- active | paused | done
ALTER TABLE clients ADD COLUMN IF NOT EXISTS approved_books TEXT[] DEFAULT '{}';

-- ── Plays: one promo run for one client ────────────────────────
CREATE TABLE IF NOT EXISTS plays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  promo TEXT,                         -- "fd 500 rfb"
  promo_type TEXT,                    -- Free Bet | Risk Free | Profit Boost | Low Hold | ...
  book TEXT,                          -- promo book
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','void')),
  placed_on DATE DEFAULT CURRENT_DATE,
  settled_on DATE,
  split_override NUMERIC,             -- use instead of the client's split for this play
  client_share_override NUMERIC,      -- flat dollar client share for this play
  profit_override NUMERIC,            -- hand-entered profit (used instead of the legs)
  loan_amount NUMERIC,                -- capital fronted for this play (informational)
  notes TEXT,
  legacy_row INT,                     -- row in the AS6 sheet, for imported plays
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plays_client_idx ON plays(client_id);

-- ── Legs: each bet inside a play ───────────────────────────────
CREATE TABLE IF NOT EXISTS legs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  play_id UUID NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
  seq INT NOT NULL DEFAULT 1,         -- leg pair number (1, 2, ...)
  side TEXT NOT NULL CHECK (side IN ('promo','hedge')),
  book TEXT,
  self_hedge BOOLEAN DEFAULT false,   -- placed in your account, not the client's
  selection TEXT,
  odds TEXT,
  cash_stake NUMERIC DEFAULT 0,
  credit_stake NUMERIC DEFAULT 0,     -- free bet / site credit used
  payout NUMERIC DEFAULT 0,           -- total return if this leg wins
  result TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending','won','lost','void')),
  event_time TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS legs_play_idx ON legs(play_id);

-- ── Loan ledger (capital fronted) ──────────────────────────────
-- + sent_to_client, self_hedge_stake, opening_balance
-- - received_from_client, self_hedge_return
CREATE TABLE IF NOT EXISTS capital_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  play_id UUID REFERENCES plays(id) ON DELETE SET NULL,
  date DATE DEFAULT CURRENT_DATE,
  type TEXT NOT NULL CHECK (type IN ('sent_to_client','received_from_client','self_hedge_stake','self_hedge_return','opening_balance')),
  amount NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moves_client_idx ON capital_movements(client_id);

-- ── Payments from client to you ────────────────────────────────
CREATE TABLE IF NOT EXISTS settlements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL,
  method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS setts_client_idx ON settlements(client_id);

-- ── Presets (in case presets.sql wasn't run) ───────────────────
CREATE TABLE IF NOT EXISTS presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tool TEXT NOT NULL,
  name TEXT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Calculated views ───────────────────────────────────────────
-- Profit = payouts of winning legs − all cash staked (same as the AS6 "Tha" column)
CREATE OR REPLACE VIEW play_calc WITH (security_invoker = true) AS
WITH base AS (
  SELECT p.id,
         COALESCE(p.profit_override,
                  COALESCE(SUM(l.payout) FILTER (WHERE l.result = 'won'), 0) - COALESCE(SUM(l.cash_stake), 0)) AS profit
  FROM plays p LEFT JOIN legs l ON l.play_id = p.id
  GROUP BY p.id
)
SELECT p.*,
       b.profit,
       CASE WHEN p.status = 'settled'
            THEN COALESCE(p.client_share_override, b.profit * COALESCE(p.split_override, c.split, 0.35))
            ELSE 0 END AS client_share
FROM plays p
JOIN base b ON b.id = p.id
JOIN clients c ON c.id = p.client_id;

CREATE OR REPLACE VIEW client_summary WITH (security_invoker = true) AS
SELECT c.id AS client_id,
       COUNT(pc.id) FILTER (WHERE pc.status = 'open')    AS open_plays,
       COUNT(pc.id) FILTER (WHERE pc.status = 'settled') AS settled_plays,
       COALESCE(SUM(pc.profit) FILTER (WHERE pc.status = 'settled'), 0) AS profit,
       COALESCE(SUM(pc.client_share), 0) AS client_share,
       COALESCE(SUM(pc.profit) FILTER (WHERE pc.status = 'settled'), 0) - COALESCE(SUM(pc.client_share), 0) AS your_share,
       (SELECT COALESCE(SUM(s.amount), 0) FROM settlements s WHERE s.client_id = c.id) AS received,
       (SELECT COALESCE(SUM(CASE WHEN m.type IN ('sent_to_client','self_hedge_stake','opening_balance') THEN m.amount ELSE -m.amount END), 0)
          FROM capital_movements m WHERE m.client_id = c.id) AS loan_outstanding,
       MAX(pc.placed_on) AS last_play
FROM clients c
LEFT JOIN play_calc pc ON pc.client_id = c.id
GROUP BY c.id;

-- ── Login lock: only signed-in users can read or write ─────────
DROP POLICY IF EXISTS "anon full access clients"   ON clients;
DROP POLICY IF EXISTS "anon full access promos"    ON promos;
DROP POLICY IF EXISTS "anon full access movements" ON money_movements;
DROP POLICY IF EXISTS "anon full access presets"   ON presets;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','promos','money_movements','plays','legs','capital_movements','settlements','presets'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "signed in full access" ON %I', t);
    EXECUTE format('CREATE POLICY "signed in full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
