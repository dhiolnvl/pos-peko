-- ================================================
-- 021: Fix RLS for members, transactions, transaction_items
-- ================================================
-- Masalah:
-- 1. members: tidak ada policy INSERT/UPDATE untuk cashier & backoffice
-- 2. transactions: tidak ada policy INSERT/UPDATE untuk cashier
-- 3. transaction_items: tidak ada policy INSERT/UPDATE untuk cashier
-- ================================================

-- ================================================
-- MEMBERS
-- ================================================

DROP POLICY IF EXISTS "members_owner_all" ON members;
DROP POLICY IF EXISTS "members_backoffice_all" ON members;
DROP POLICY IF EXISTS "members_cashier_read" ON members;
DROP POLICY IF EXISTS "members_cashier_write" ON members;
DROP POLICY IF EXISTS "members_authenticated_read" ON members;
DROP POLICY IF EXISTS "members_authenticated_write" ON members;

-- Semua authenticated user bisa baca member (member bersifat global lintas cabang)
CREATE POLICY "members_authenticated_read"
  ON members FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Owner & backoffice: full access
CREATE POLICY "members_owner_backoffice_all"
  ON members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'back_office')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'back_office')
    )
  );

-- Cashier: bisa insert dan update member
CREATE POLICY "members_cashier_write"
  ON members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'cashier'
    )
  );

CREATE POLICY "members_cashier_update"
  ON members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'cashier'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'cashier'
    )
  );

-- ================================================
-- MEMBER_POINT_LOGS
-- ================================================

DROP POLICY IF EXISTS "member_point_logs_owner_all" ON member_point_logs;
DROP POLICY IF EXISTS "member_point_logs_authenticated_read" ON member_point_logs;
DROP POLICY IF EXISTS "member_point_logs_cashier_write" ON member_point_logs;

CREATE POLICY "member_point_logs_authenticated_read"
  ON member_point_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "member_point_logs_authenticated_write"
  ON member_point_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "member_point_logs_owner_all"
  ON member_point_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'owner'
    )
  );

-- ================================================
-- TRANSACTIONS
-- ================================================

DROP POLICY IF EXISTS "transactions_owner_all" ON transactions;
DROP POLICY IF EXISTS "transactions_backoffice_read" ON transactions;
DROP POLICY IF EXISTS "transactions_cashier_all" ON transactions;
DROP POLICY IF EXISTS "transactions_cashier_write" ON transactions;

-- Owner: full access semua transaksi
CREATE POLICY "transactions_owner_all"
  ON transactions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

-- Backoffice: read & update transaksi di cabangnya
CREATE POLICY "transactions_backoffice_read"
  ON transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = transactions.branch_id
    )
  );

CREATE POLICY "transactions_backoffice_update"
  ON transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = transactions.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = transactions.branch_id
    )
  );

-- Cashier: full access transaksi di cabangnya sendiri
CREATE POLICY "transactions_cashier_all"
  ON transactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'cashier'
      AND users.branch_id = transactions.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'cashier'
      AND users.branch_id = transactions.branch_id
    )
  );

-- ================================================
-- TRANSACTION_ITEMS
-- ================================================

DROP POLICY IF EXISTS "transaction_items_owner_all" ON transaction_items;
DROP POLICY IF EXISTS "transaction_items_authenticated_read" ON transaction_items;
DROP POLICY IF EXISTS "transaction_items_cashier_write" ON transaction_items;

-- Owner: full access
CREATE POLICY "transaction_items_owner_all"
  ON transaction_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

-- Semua authenticated: baca transaction_items (tidak ada branch_id di tabel ini)
CREATE POLICY "transaction_items_authenticated_read"
  ON transaction_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Cashier & backoffice: bisa insert dan update
CREATE POLICY "transaction_items_staff_write"
  ON transaction_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('cashier', 'back_office')
    )
  );

CREATE POLICY "transaction_items_staff_update"
  ON transaction_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('cashier', 'back_office')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('cashier', 'back_office')
    )
  );

-- ================================================
-- END
-- ================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 021 applied: members, transactions, transaction_items RLS fixed.';
END $$;
