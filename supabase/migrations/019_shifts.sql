-- ================================================
-- 019: Shifts (Sistem Buka/Tutup Shift Kasir)
-- ================================================

-- ── Tabel Shifts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cashier_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cashier_name  TEXT NOT NULL,
  opening_cash  NUMERIC DEFAULT 0,
  closing_cash  NUMERIC,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  status        TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes         TEXT,
  total_transactions INTEGER,
  total_sales   NUMERIC,
  created_at    TIMESTAMPTZ DEFAULT now(),
  is_synced     BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_shifts_cashier  ON shifts(cashier_id);
CREATE INDEX IF NOT EXISTS idx_shifts_branch   ON shifts(branch_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status   ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_opened   ON shifts(opened_at);

-- ── Tambah shift_id ke transactions ──────────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_shift ON transactions(shift_id);

-- ── RLS: Shifts ───────────────────────────────────────────────────────────────
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- Owner: akses penuh semua shift di semua cabang
CREATE POLICY "shifts_owner_all"
  ON shifts FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office: baca shift di cabang sendiri
CREATE POLICY "shifts_backoffice_read"
  ON shifts FOR SELECT
  USING (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  );

-- Kasir: baca & kelola shift milik sendiri
CREATE POLICY "shifts_cashier_own"
  ON shifts FOR ALL
  USING (
    get_user_role() = 'cashier'
    AND cashier_id = auth.uid()
  )
  WITH CHECK (
    get_user_role() = 'cashier'
    AND cashier_id = auth.uid()
  );
