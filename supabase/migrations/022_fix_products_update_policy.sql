-- ================================================
-- Migration 022: Fix products UPDATE policy
-- Cashier hanya punya SELECT, tidak bisa UPDATE stock
-- ================================================

-- Hapus policy lama yang hanya SELECT
DROP POLICY IF EXISTS "products_cashier_read" ON products;

-- Buat ulang SELECT untuk cashier
CREATE POLICY "products_cashier_select"
ON products
FOR SELECT
TO public
USING (true);

-- Tambah UPDATE untuk cashier (update stock saat transaksi)
CREATE POLICY "products_cashier_update"
ON products
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- ================================================
-- END
-- ================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 022 applied: products UPDATE policy added for cashier.';
END $$;
