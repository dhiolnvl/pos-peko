-- ================================================
-- 035: Gudang Pusat + Role Staff Pusat + Distribusi Stok
--
-- Perubahan:
--   1. Tambah role 'staff_pusat' di tabel users
--   2. Tabel warehouse (gudang pusat, entitas terpisah dari branches)
--   3. Tabel warehouse_stock (stok per produk di gudang)
--   4. Tabel stock_transfers + stock_transfer_items (distribusi gudang ke cabang)
--   5. Alter purchase_orders: tambah warehouse_id, hapus relasi ke branch
--   6. Alter stock_opname: tambah kolom reviewed_by, reviewed_at, review_notes
--      dan tambah status 'rejected'
--   7. Alter stock_movements: tambah tipe transfer_out dan transfer_in
--   8. RLS untuk semua tabel baru
--   9. Update helper functions untuk support staff_pusat
-- ================================================

-- ================================================
-- 1. TAMBAH ROLE staff_pusat
-- ================================================

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'back_office', 'cashier', 'staff_pusat'));

-- ================================================
-- 2. TABEL WAREHOUSE
-- ================================================

CREATE TABLE warehouse (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  address    TEXT,
  phone      VARCHAR(50),
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_warehouse_updated_at
  BEFORE UPDATE ON warehouse
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- 3. TABEL WAREHOUSE_STOCK
-- ================================================

CREATE TABLE warehouse_stock (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID  NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
  product_id UUID    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock      INTEGER NOT NULL DEFAULT 0,
  min_stock  INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_warehouse_product UNIQUE (warehouse_id, product_id)
);

CREATE INDEX idx_warehouse_stock_warehouse ON warehouse_stock(warehouse_id);
CREATE INDEX idx_warehouse_stock_product   ON warehouse_stock(product_id);

CREATE TRIGGER update_warehouse_stock_updated_at
  BEFORE UPDATE ON warehouse_stock
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- 4. TABEL STOCK_TRANSFERS
-- ================================================

CREATE TABLE stock_transfers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID        NOT NULL REFERENCES warehouse(id) ON DELETE RESTRICT,
  branch_id    UUID        NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status       VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  notes        TEXT,
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_stock_transfers_warehouse ON stock_transfers(warehouse_id);
CREATE INDEX idx_stock_transfers_branch    ON stock_transfers(branch_id);
CREATE INDEX idx_stock_transfers_status    ON stock_transfers(status);
CREATE INDEX idx_stock_transfers_created   ON stock_transfers(created_at DESC);

CREATE TRIGGER update_stock_transfers_updated_at
  BEFORE UPDATE ON stock_transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- 5. TABEL STOCK_TRANSFER_ITEMS
-- ================================================

CREATE TABLE stock_transfer_items (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID    NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id  UUID    NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  cost_price  NUMERIC(15,2),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_stock_transfer_items_transfer ON stock_transfer_items(transfer_id);
CREATE INDEX idx_stock_transfer_items_product  ON stock_transfer_items(product_id);

-- ================================================
-- 6. ALTER PURCHASE_ORDERS: tambah warehouse_id
-- ================================================

ALTER TABLE purchase_orders
  ADD COLUMN warehouse_id UUID REFERENCES warehouse(id) ON DELETE RESTRICT;

CREATE INDEX idx_purchase_orders_warehouse ON purchase_orders(warehouse_id);

-- ================================================
-- 7. ALTER STOCK_OPNAME: tambah kolom review
-- ================================================

ALTER TABLE stock_opname
  ADD COLUMN reviewed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at   TIMESTAMPTZ,
  ADD COLUMN review_notes  TEXT;

-- Tambah status 'rejected' ke enum
ALTER TABLE stock_opname
  DROP CONSTRAINT IF EXISTS stock_opname_status_check;

ALTER TABLE stock_opname
  ADD CONSTRAINT stock_opname_status_check
  CHECK (status IN ('draft', 'submitted', 'approved', 'rejected'));

-- ================================================
-- 8. ALTER STOCK_MOVEMENTS: tambah tipe transfer
-- ================================================

ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_type_check
  CHECK (type IN (
    'sale', 'purchase', 'adjustment_in', 'adjustment_out',
    'opname', 'void', 'transfer_out', 'transfer_in'
  ));

-- ================================================
-- 9. RLS WAREHOUSE
-- ================================================

ALTER TABLE warehouse       ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- warehouse: owner + staff_pusat full access
CREATE POLICY "warehouse_owner_staff_all"
  ON warehouse FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'staff_pusat')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'staff_pusat')
    )
  );

-- warehouse: back_office + cashier read only
CREATE POLICY "warehouse_staff_read"
  ON warehouse FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('back_office', 'cashier')
    )
  );

-- warehouse_stock: owner + staff_pusat full access
CREATE POLICY "warehouse_stock_owner_staff_all"
  ON warehouse_stock FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'staff_pusat')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'staff_pusat')
    )
  );

-- warehouse_stock: back_office read only (untuk lihat stok gudang)
CREATE POLICY "warehouse_stock_backoffice_read"
  ON warehouse_stock FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'back_office'
    )
  );

-- stock_transfers: owner + staff_pusat full access
CREATE POLICY "stock_transfers_owner_staff_all"
  ON stock_transfers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'staff_pusat')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'staff_pusat')
    )
  );

-- stock_transfers: back_office read only untuk cabang mereka
CREATE POLICY "stock_transfers_backoffice_read"
  ON stock_transfers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'back_office'
        AND users.branch_id = stock_transfers.branch_id
    )
  );

-- stock_transfer_items: owner + staff_pusat full access
CREATE POLICY "stock_transfer_items_owner_staff_all"
  ON stock_transfer_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'staff_pusat')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'staff_pusat')
    )
  );

-- stock_transfer_items: back_office read only untuk transfer ke cabang mereka
CREATE POLICY "stock_transfer_items_backoffice_read"
  ON stock_transfer_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM stock_transfers st
      JOIN users u ON u.id = auth.uid()
      WHERE st.id = stock_transfer_items.transfer_id
        AND u.role = 'back_office'
        AND u.branch_id = st.branch_id
    )
  );

-- ================================================
-- 10. UPDATE RLS EXISTING TABLES UNTUK STAFF_PUSAT
-- ================================================

-- branches: staff_pusat full access
CREATE POLICY "branches_staff_pusat_all"
  ON branches FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  );

-- categories: staff_pusat full access
CREATE POLICY "categories_staff_pusat_all"
  ON categories FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  );

-- products: staff_pusat full access
CREATE POLICY "products_staff_pusat_all"
  ON products FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  );

-- branch_products: staff_pusat full access
CREATE POLICY "branch_products_staff_pusat_all"
  ON branch_products FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  );

-- transactions: staff_pusat read all
CREATE POLICY "transactions_staff_pusat_read"
  ON transactions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  );

-- transaction_items: staff_pusat read all
CREATE POLICY "transaction_items_staff_pusat_read"
  ON transaction_items FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  );

-- stock_movements: staff_pusat full access
CREATE POLICY "stock_movements_staff_pusat_all"
  ON stock_movements FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  );

-- stock_opname: staff_pusat full access (untuk approve/reject semua cabang)
CREATE POLICY "stock_opname_staff_pusat_all"
  ON stock_opname FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  );

-- stock_opname_items: staff_pusat full access
CREATE POLICY "stock_opname_items_staff_pusat_all"
  ON stock_opname_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  );

-- purchase_orders: staff_pusat full access
CREATE POLICY "purchase_orders_staff_pusat_all"
  ON purchase_orders FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  );

-- purchase_order_items: staff_pusat full access
CREATE POLICY "purchase_order_items_staff_pusat_all"
  ON purchase_order_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'staff_pusat')
  );

-- users: staff_pusat bisa kelola user level bawah (back_office, cashier)
-- tidak bisa buat/ubah owner atau sesama staff_pusat
CREATE POLICY "users_staff_pusat_manage_lower"
  ON users FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'staff_pusat')
    AND users.role IN ('back_office', 'cashier')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'staff_pusat')
    AND users.role IN ('back_office', 'cashier')
  );

-- users: staff_pusat bisa baca data dirinya sendiri
CREATE POLICY "users_staff_pusat_read_self"
  ON users FOR SELECT
  USING (
    auth.uid() = users.id
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'staff_pusat')
  );

-- ================================================
-- 11. UPDATE HELPER FUNCTIONS: support staff_pusat
-- ================================================

CREATE OR REPLACE FUNCTION get_active_branches()
RETURNS TABLE (
  id         UUID,
  name       VARCHAR,
  address    TEXT,
  phone      VARCHAR,
  is_active  BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    b.id, b.name, b.address, b.phone,
    b.is_active, b.created_at, b.updated_at
  FROM branches b
  WHERE b.is_active = true
    AND (
      EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid() AND role IN ('owner', 'staff_pusat')
      )
      OR EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
          AND role IN ('back_office', 'cashier')
          AND branch_id = b.id
      )
    )
  ORDER BY b.name;
$$;

-- ================================================
-- 12. RPC: send_stock_transfer
-- Kirim distribusi dari gudang ke cabang:
-- - Kurangi warehouse_stock
-- - Tambah branch_products
-- - Catat stock_movements (transfer_out di gudang, transfer_in di cabang)
-- - Update status transfer jadi 'sent'
-- ================================================

CREATE OR REPLACE FUNCTION send_stock_transfer(p_transfer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer    RECORD;
  v_item        RECORD;
  v_wh_stock    RECORD;
  v_bp          RECORD;
  v_new_wh_stock INTEGER;
  v_new_br_stock INTEGER;
  v_transferred  INTEGER := 0;
BEGIN
  -- Validasi role
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role IN ('owner', 'staff_pusat')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Ambil header transfer
  SELECT * INTO v_transfer
  FROM stock_transfers
  WHERE id = p_transfer_id AND status = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer tidak ditemukan atau sudah dikirim';
  END IF;

  -- Proses setiap item
  FOR v_item IN
    SELECT sti.*, p.name AS product_name
    FROM stock_transfer_items sti
    JOIN products p ON p.id = sti.product_id
    WHERE sti.transfer_id = p_transfer_id
  LOOP
    -- Kurangi stok gudang
    SELECT * INTO v_wh_stock
    FROM warehouse_stock
    WHERE warehouse_id = v_transfer.warehouse_id
      AND product_id = v_item.product_id
    FOR UPDATE;

    IF v_wh_stock IS NULL THEN
      RAISE EXCEPTION 'Produk % tidak ada di gudang', v_item.product_name;
    END IF;

    IF v_wh_stock.stock < v_item.quantity THEN
      RAISE EXCEPTION 'Stok gudang tidak cukup untuk produk %', v_item.product_name;
    END IF;

    v_new_wh_stock := v_wh_stock.stock - v_item.quantity;

    UPDATE warehouse_stock
    SET stock = v_new_wh_stock, updated_at = now()
    WHERE id = v_wh_stock.id;

    -- Catat movement keluar dari gudang
    INSERT INTO stock_movements (
      product_id, branch_id, type, quantity,
      qty_before, qty_after, reason, reference_id, created_by
    ) VALUES (
      v_item.product_id,
      NULL,
      'transfer_out',
      v_item.quantity,
      v_wh_stock.stock,
      v_new_wh_stock,
      'Distribusi ke cabang ID: ' || v_transfer.branch_id,
      p_transfer_id,
      auth.uid()
    );

    -- Tambah stok cabang
    SELECT * INTO v_bp
    FROM branch_products
    WHERE branch_id = v_transfer.branch_id
      AND product_id = v_item.product_id
    FOR UPDATE;

    IF v_bp IS NULL THEN
      INSERT INTO branch_products (branch_id, product_id, stock, min_stock, is_available)
      VALUES (v_transfer.branch_id, v_item.product_id, v_item.quantity, 0, true);

      v_new_br_stock := v_item.quantity;
    ELSE
      v_new_br_stock := v_bp.stock + v_item.quantity;

      UPDATE branch_products
      SET stock = v_new_br_stock, updated_at = now()
      WHERE id = v_bp.id;
    END IF;

    -- Catat movement masuk ke cabang
    INSERT INTO stock_movements (
      product_id, branch_id, type, quantity,
      qty_before, qty_after, reason, reference_id, created_by
    ) VALUES (
      v_item.product_id,
      v_transfer.branch_id,
      'transfer_in',
      v_item.quantity,
      COALESCE(v_bp.stock, 0),
      v_new_br_stock,
      'Distribusi dari gudang pusat',
      p_transfer_id,
      auth.uid()
    );

    v_transferred := v_transferred + 1;
  END LOOP;

  -- Update status transfer
  UPDATE stock_transfers
  SET status = 'sent', sent_at = now(), updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'success', true,
    'items_transferred', v_transferred
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION send_stock_transfer(UUID) TO authenticated;

-- ================================================
-- 13. RPC: receive_purchase_to_warehouse
-- Terima PO ke gudang (update warehouse_stock, catat movement)
-- ================================================

CREATE OR REPLACE FUNCTION receive_purchase_to_warehouse(p_po_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po       RECORD;
  v_item     RECORD;
  v_ws       RECORD;
  v_new_stock INTEGER;
  v_count    INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role IN ('owner', 'staff_pusat')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_po
  FROM purchase_orders
  WHERE id = p_po_id AND status = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO tidak ditemukan atau sudah diterima';
  END IF;

  IF v_po.warehouse_id IS NULL THEN
    RAISE EXCEPTION 'PO tidak memiliki warehouse_id';
  END IF;

  FOR v_item IN
    SELECT poi.*, p.name AS product_name
    FROM purchase_order_items poi
    JOIN products p ON p.id = poi.product_id
    WHERE poi.po_id = p_po_id
  LOOP
    SELECT * INTO v_ws
    FROM warehouse_stock
    WHERE warehouse_id = v_po.warehouse_id
      AND product_id = v_item.product_id
    FOR UPDATE;

    IF v_ws IS NULL THEN
      INSERT INTO warehouse_stock (warehouse_id, product_id, stock, min_stock)
      VALUES (v_po.warehouse_id, v_item.product_id, v_item.quantity, 0);

      v_new_stock := v_item.quantity;
    ELSE
      v_new_stock := v_ws.stock + v_item.quantity;

      UPDATE warehouse_stock
      SET stock = v_new_stock, updated_at = now()
      WHERE id = v_ws.id;
    END IF;

    INSERT INTO stock_movements (
      product_id, branch_id, type, quantity,
      qty_before, qty_after, reason, reference_id, created_by
    ) VALUES (
      v_item.product_id,
      NULL,
      'purchase',
      v_item.quantity,
      COALESCE(v_ws.stock, 0),
      v_new_stock,
      'Pembelian PO ke gudang',
      p_po_id,
      auth.uid()
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE purchase_orders
  SET status = 'received', received_at = now(), updated_at = now()
  WHERE id = p_po_id;

  RETURN jsonb_build_object(
    'success', true,
    'items_received', v_count
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION receive_purchase_to_warehouse(UUID) TO authenticated;

-- ================================================
-- END OF MIGRATION
-- ================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 035 berhasil: warehouse, stock_transfers, staff_pusat selesai.';
END $$;
