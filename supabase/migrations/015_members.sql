-- ================================================
-- 015: Members & Point Logs
-- ================================================

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  points INTEGER DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_synced INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_members_branch    ON members(branch_id);
CREATE INDEX IF NOT EXISTS idx_members_phone     ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_is_active ON members(is_active);

-- Add member_id & points_earned to transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS member_id      UUID REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS points_earned  INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_id);

-- Point log per transaksi
CREATE TABLE IF NOT EXISTS member_point_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_synced INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_point_logs_member ON member_point_logs(member_id);

-- RLS
ALTER TABLE members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_point_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch staff members access" ON members
  FOR ALL USING (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = auth.uid()
      UNION
      SELECT id FROM branches WHERE id IN (
        SELECT branch_id FROM users WHERE id = auth.uid() AND role = 'owner'
      )
    )
  );

CREATE POLICY "branch staff point_logs access" ON member_point_logs
  FOR ALL USING (
    member_id IN (SELECT id FROM members)
  );
