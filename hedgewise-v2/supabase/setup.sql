-- Run this in Supabase SQL Editor (Settings → SQL Editor → New Query)

CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  books TEXT[] DEFAULT '{}',
  loan_balance NUMERIC DEFAULT 0,
  total_profit NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  book TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Active',
  profit NUMERIC DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Optional: money movement log for audit trail
CREATE TABLE IF NOT EXISTS money_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  promo_id UUID REFERENCES promos(id) ON DELETE SET NULL,
  type TEXT, -- 'deposit', 'withdrawal', 'loan_out', 'loan_back', 'split_paid'
  amount NUMERIC,
  book TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for production (commented out for MVP — uncomment when adding auth)
-- ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE promos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE money_movements ENABLE ROW LEVEL SECURITY;

-- For MVP without auth, allow anon to read/write (DO NOT use in production with real data):
CREATE POLICY "anon full access clients" ON clients FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access promos" ON promos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access movements" ON money_movements FOR ALL TO anon USING (true) WITH CHECK (true);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_movements ENABLE ROW LEVEL SECURITY;
