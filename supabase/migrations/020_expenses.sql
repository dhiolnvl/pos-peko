-- ================================================
-- 020: Expenses (Pengeluaran Operasional)
-- ================================================

CREATE TABLE IF NOT EXISTS expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  description   TEXT NOT NULL,
  amount        NUMERIC NOT NULL,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'transfer', 'qris')),
  date          DATE NOT NULL,
  created_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_name TEXT NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  is_synced     BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_expenses_branch   ON expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Owner: akses penuh semua cabang
CREATE POLICY "expenses_owner_all"
  ON expenses FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office: baca & kelola pengeluaran cabang sendiri
CREATE POLICY "expenses_backoffice_all"
  ON expenses FOR ALL
  USING (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  )
  WITH CHECK (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  );
