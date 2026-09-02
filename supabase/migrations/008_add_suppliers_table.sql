-- ================================================
-- MIGRATION 008: ADD SUPPLIERS TABLE
-- ================================================
-- Menambahkan tabel suppliers yang terpisah agar data
-- supplier tidak perlu diinput ulang setiap pembelian.
-- ================================================

-- ================================================
-- CREATE SUPPLIERS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_suppliers_branch ON suppliers(branch_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

-- updated_at trigger
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- ENABLE RLS
-- ================================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- ================================================
-- RLS POLICIES: SUPPLIERS
-- ================================================

-- Owner: Full access to all suppliers
CREATE POLICY "suppliers_owner_all"
  ON suppliers FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

-- Back office: Full access to suppliers in their branch
CREATE POLICY "suppliers_backoffice_all"
  ON suppliers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = suppliers.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = suppliers.branch_id
    )
  );

-- Cashier: Read-only access to suppliers in their branch
-- (kasir bisa lihat supplier tapi tidak bisa edit)
CREATE POLICY "suppliers_cashier_read"
  ON suppliers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'cashier'
      AND users.branch_id = suppliers.branch_id
    )
  );

-- ================================================
-- END OF MIGRATION
-- ================================================
