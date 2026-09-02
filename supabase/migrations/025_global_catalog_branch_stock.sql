-- ================================================
-- 025: Global Product & Category Catalog + Branch Stock
--
-- Perubahan utama:
--   1. products.branch_id dibuat nullable → NULL = produk global (semua cabang)
--   2. categories.branch_id dibuat nullable → NULL = kategori global
--   3. Tabel branch_products: stok & harga override per cabang
--   4. Tabel branch_categories: visibility per cabang
--   5. Migrasi data existing: set branch_id = NULL (jadikan global)
--      lalu seed branch_products dengan stok dari products.stock
--   6. Update RPC get_products_by_branch & get_categories_by_branch
--   7. Update process_transaction: kurangi stok di branch_products
-- ================================================

-- ── 0. Drop existing functions yang return type-nya berubah ─────────────────

DROP FUNCTION IF EXISTS get_categories_by_branch(UUID);
DROP FUNCTION IF EXISTS get_products_by_branch(UUID);

-- ── 1. Buat tabel branch_categories ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS branch_categories (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category_id  UUID        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  is_available BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_branch_category UNIQUE (branch_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_categories_branch   ON branch_categories(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_categories_category ON branch_categories(category_id);

-- ── 2. Buat tabel branch_products ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS branch_products (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      UUID          NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id     UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_override NUMERIC(15,2),          -- NULL = pakai harga global dari products.price
  stock          INTEGER       NOT NULL DEFAULT 0,
  min_stock      INTEGER       NOT NULL DEFAULT 5,
  is_available   BOOLEAN       NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ   DEFAULT now(),
  updated_at     TIMESTAMPTZ   DEFAULT now(),

  CONSTRAINT uq_branch_product UNIQUE (branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_products_branch  ON branch_products(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_products_product ON branch_products(product_id);

-- ── 3. Trigger updated_at untuk tabel baru ───────────────────────────────────

CREATE TRIGGER update_branch_categories_updated_at
  BEFORE UPDATE ON branch_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_branch_products_updated_at
  BEFORE UPDATE ON branch_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 4. Migrasi data existing ──────────────────────────────────────────────────
-- Semua produk & kategori yang ada saat ini dimiliki oleh 1 cabang tertentu.
-- Kita seed branch_products dengan stok yang sudah ada, lalu jadikan produk global.

-- 4a. Seed branch_products dari data products yang sudah ada
INSERT INTO branch_products (branch_id, product_id, stock, min_stock, is_available)
SELECT
  p.branch_id,
  p.id,
  COALESCE(p.stock, 0),
  COALESCE(p.min_stock, 5),
  p.is_active
FROM products p
WHERE p.branch_id IS NOT NULL
ON CONFLICT (branch_id, product_id) DO NOTHING;

-- 4b. Seed branch_categories dari data categories yang sudah ada
INSERT INTO branch_categories (branch_id, category_id, is_available)
SELECT
  c.branch_id,
  c.id,
  true
FROM categories c
WHERE c.branch_id IS NOT NULL
ON CONFLICT (branch_id, category_id) DO NOTHING;

-- 4c. Jadikan semua produk & kategori existing sebagai global (NULL branch_id)
UPDATE products SET branch_id = NULL WHERE branch_id IS NOT NULL;
UPDATE categories SET branch_id = NULL WHERE branch_id IS NOT NULL;

-- ── 5. Ubah constraint branch_id jadi nullable ───────────────────────────────

-- Drop constraint NOT NULL dari products.branch_id (sudah nullable via schema awal,
-- tapi foreign key ON DELETE CASCADE perlu dijaga — hanya ubah jadi nullable)
ALTER TABLE products
  ALTER COLUMN branch_id DROP NOT NULL;

ALTER TABLE categories
  ALTER COLUMN branch_id DROP NOT NULL;

-- ── 6. RLS untuk tabel baru ──────────────────────────────────────────────────

ALTER TABLE branch_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_products   ENABLE ROW LEVEL SECURITY;

-- branch_categories
CREATE POLICY "Owner: Full access to branch_categories"
  ON branch_categories FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

CREATE POLICY "Back office: Manage branch_categories in own branch"
  ON branch_categories FOR ALL
  USING (get_user_role() = 'back_office' AND branch_id = get_user_branch())
  WITH CHECK (get_user_role() = 'back_office' AND branch_id = get_user_branch());

CREATE POLICY "Cashier: Read branch_categories in own branch"
  ON branch_categories FOR SELECT
  USING (get_user_role() = 'cashier' AND branch_id = get_user_branch());

-- branch_products
CREATE POLICY "Owner: Full access to branch_products"
  ON branch_products FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

CREATE POLICY "Back office: Manage branch_products in own branch"
  ON branch_products FOR ALL
  USING (get_user_role() = 'back_office' AND branch_id = get_user_branch())
  WITH CHECK (get_user_role() = 'back_office' AND branch_id = get_user_branch());

CREATE POLICY "Cashier: Read branch_products in own branch"
  ON branch_products FOR SELECT
  USING (get_user_role() = 'cashier' AND branch_id = get_user_branch());

-- ── 7. Update RPC get_categories_by_branch ───────────────────────────────────

CREATE OR REPLACE FUNCTION get_categories_by_branch(p_branch_id UUID)
RETURNS TABLE (
  id           UUID,
  name         VARCHAR,
  branch_id    UUID,
  sort_order   INTEGER,
  is_available BOOLEAN,
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    c.id,
    c.name,
    c.branch_id,
    c.sort_order,
    COALESCE(bc.is_available, true) AS is_available,
    c.created_at,
    c.updated_at
  FROM categories c
  LEFT JOIN branch_categories bc
    ON bc.category_id = c.id AND bc.branch_id = p_branch_id
  WHERE
    -- Kategori global ATAU kategori milik cabang ini
    (c.branch_id IS NULL OR c.branch_id = p_branch_id)
    -- Hanya tampilkan yang available di cabang ini
    AND COALESCE(bc.is_available, true) = true
    AND (
      EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
      OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND users.role IN ('back_office', 'cashier')
          AND users.branch_id = p_branch_id
      )
    )
  ORDER BY c.sort_order, c.name;
$$;

-- ── 8. Update RPC get_products_by_branch ─────────────────────────────────────

CREATE OR REPLACE FUNCTION get_products_by_branch(p_branch_id UUID)
RETURNS TABLE (
  id             UUID,
  name           VARCHAR,
  category_id    UUID,
  branch_id      UUID,
  price          NUMERIC,
  cost_price     NUMERIC,
  stock          INTEGER,
  min_stock      INTEGER,
  unit           VARCHAR,
  barcode        VARCHAR,
  image_url      TEXT,
  is_active      BOOLEAN,
  is_available   BOOLEAN,
  price_override NUMERIC,
  created_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    p.id,
    p.name,
    p.category_id,
    p.branch_id,
    COALESCE(bp.price_override, p.price)  AS price,
    p.cost_price,
    COALESCE(bp.stock, 0)                 AS stock,
    COALESCE(bp.min_stock, p.min_stock)   AS min_stock,
    p.unit,
    p.barcode,
    p.image_url,
    p.is_active,
    COALESCE(bp.is_available, true)       AS is_available,
    bp.price_override,
    p.created_at,
    p.updated_at
  FROM products p
  LEFT JOIN branch_products bp
    ON bp.product_id = p.id AND bp.branch_id = p_branch_id
  WHERE
    -- Produk global ATAU produk milik cabang ini
    (p.branch_id IS NULL OR p.branch_id = p_branch_id)
    -- Hanya tampilkan yang available di cabang ini
    AND COALESCE(bp.is_available, true) = true
    AND p.is_active = true
    AND (
      -- Owner bisa lihat semua cabang
      EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
      OR
      -- Staff hanya bisa lihat cabang sendiri
      EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND users.role IN ('back_office', 'cashier')
          AND users.branch_id = p_branch_id
      )
    )
  ORDER BY p.updated_at DESC;
$$;

-- ── 9. RPC get_all_products_for_owner ────────────────────────────────────────
-- Owner butuh lihat semua produk global tanpa filter cabang

CREATE OR REPLACE FUNCTION get_all_products_for_owner()
RETURNS TABLE (
  id           UUID,
  name         VARCHAR,
  category_id  UUID,
  branch_id    UUID,
  price        NUMERIC,
  cost_price   NUMERIC,
  unit         VARCHAR,
  barcode      VARCHAR,
  image_url    TEXT,
  is_active    BOOLEAN,
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    p.id, p.name, p.category_id, p.branch_id,
    p.price, p.cost_price, p.unit, p.barcode,
    p.image_url, p.is_active, p.created_at, p.updated_at
  FROM products p
  WHERE EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'
  )
  ORDER BY p.updated_at DESC;
$$;

-- ── 10. RPC get_branch_stock_summary ─────────────────────────────────────────
-- Ringkasan stok per cabang untuk dashboard owner

CREATE OR REPLACE FUNCTION get_branch_stock_summary(p_branch_id UUID)
RETURNS TABLE (
  product_id     UUID,
  product_name   VARCHAR,
  category_name  VARCHAR,
  stock          INTEGER,
  min_stock      INTEGER,
  price          NUMERIC,
  is_low_stock   BOOLEAN
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    p.id                                        AS product_id,
    p.name                                      AS product_name,
    c.name                                      AS category_name,
    COALESCE(bp.stock, 0)                       AS stock,
    COALESCE(bp.min_stock, p.min_stock, 5)      AS min_stock,
    COALESCE(bp.price_override, p.price)        AS price,
    COALESCE(bp.stock, 0) <= COALESCE(bp.min_stock, p.min_stock, 5) AS is_low_stock
  FROM products p
  LEFT JOIN branch_products bp
    ON bp.product_id = p.id AND bp.branch_id = p_branch_id
  LEFT JOIN categories c
    ON c.id = p.category_id
  WHERE
    (p.branch_id IS NULL OR p.branch_id = p_branch_id)
    AND COALESCE(bp.is_available, true) = true
    AND p.is_active = true
    AND (
      EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
      OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND users.role IN ('back_office', 'cashier')
          AND users.branch_id = p_branch_id
      )
    )
  ORDER BY is_low_stock DESC, p.name;
$$;

-- ── 11. Update process_transaction ───────────────────────────────────────────
-- Kurangi stok di branch_products (bukan products.stock langsung)
-- stock_movements tetap dipakai untuk history

CREATE OR REPLACE FUNCTION process_transaction(
  p_transaction_id   UUID,
  p_branch_id        UUID,
  p_cashier_id       UUID,
  p_shift_id         UUID,
  p_subtotal         NUMERIC,
  p_discount_amount  NUMERIC,
  p_discount_type    TEXT,
  p_tax_amount       NUMERIC,
  p_total            NUMERIC,
  p_payment_method   TEXT,
  p_payment_amount   NUMERIC,
  p_change_amount    NUMERIC,
  p_notes            TEXT,
  p_member_id        UUID,
  p_points_earned    INTEGER,
  p_items            JSONB,
  p_created_at       TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_number   TEXT;
  v_date_str         TEXT;
  v_branch_code      TEXT;
  v_tx_count         INTEGER;
  v_item             JSONB;
  v_product          RECORD;
  v_bp               RECORD;
  v_new_stock        INTEGER;
  v_stock_deduct     INTEGER;
  v_low_stock        JSONB := '[]'::JSONB;
  v_item_id          UUID;
  v_log_id           UUID;
  v_cur_points       INTEGER;
  v_cur_spent        NUMERIC;
BEGIN
  -- 1. Generate invoice number
  v_date_str := TO_CHAR(p_created_at AT TIME ZONE 'UTC', 'YYYYMMDD');

  SELECT UPPER(LEFT(REGEXP_REPLACE(name, '\s', '', 'g'), 3))
    INTO v_branch_code
    FROM branches
   WHERE id = p_branch_id;
  v_branch_code := COALESCE(v_branch_code, 'XXX');

  SELECT COUNT(*)
    INTO v_tx_count
    FROM transactions
   WHERE branch_id  = p_branch_id
     AND created_at >= DATE_TRUNC('day', p_created_at AT TIME ZONE 'UTC')
     AND created_at <  DATE_TRUNC('day', p_created_at AT TIME ZONE 'UTC') + INTERVAL '1 day';

  v_invoice_number := 'INV/' || v_date_str || '/' || v_branch_code || '/' || LPAD((v_tx_count + 1)::TEXT, 4, '0');

  -- 2. Insert transaksi
  INSERT INTO transactions (
    id, branch_id, cashier_id, shift_id,
    invoice_number, subtotal, discount_amount, discount_type,
    tax_amount, total, payment_method, payment_amount,
    change_amount, notes, status, member_id, points_earned,
    created_at, updated_at
  ) VALUES (
    p_transaction_id, p_branch_id, p_cashier_id, p_shift_id,
    v_invoice_number, p_subtotal, p_discount_amount, p_discount_type,
    p_tax_amount, p_total, p_payment_method, p_payment_amount,
    p_change_amount, p_notes, 'completed', p_member_id, p_points_earned,
    p_created_at, p_created_at
  );

  -- 3. Proses tiap item
  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
  LOOP
    v_item_id      := GEN_RANDOM_UUID();
    v_stock_deduct := COALESCE((v_item->>'unit_multiplier')::INTEGER, 1)
                      * (v_item->>'quantity')::INTEGER;

    INSERT INTO transaction_items (
      id, transaction_id, product_id, product_name, product_barcode,
      quantity, price, discount_amount, discount_type,
      unit_label, unit_multiplier,
      subtotal, created_at
    ) VALUES (
      v_item_id,
      p_transaction_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      v_item->>'product_barcode',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'price')::NUMERIC,
      (v_item->>'discount_amount')::NUMERIC,
      v_item->>'discount_type',
      v_item->>'unit_label',
      COALESCE((v_item->>'unit_multiplier')::INTEGER, 1),
      (v_item->>'subtotal')::NUMERIC,
      p_created_at
    );

    -- Ambil data produk
    SELECT id, name, min_stock
      INTO v_product
      FROM products
     WHERE id = (v_item->>'product_id')::UUID;

    IF v_product IS NOT NULL THEN
      -- Ambil & lock baris branch_products
      SELECT id, stock, min_stock
        INTO v_bp
        FROM branch_products
       WHERE product_id = v_product.id AND branch_id = p_branch_id
         FOR UPDATE;

      IF v_bp IS NOT NULL THEN
        -- Produk sudah terdaftar di branch_products, kurangi stoknya
        v_new_stock := GREATEST(0, v_bp.stock - v_stock_deduct);

        UPDATE branch_products
           SET stock = v_new_stock, updated_at = p_created_at
         WHERE id = v_bp.id;

        INSERT INTO stock_movements (
          id, product_id, branch_id, type, quantity,
          qty_before, qty_after, reason, reference_id, created_by, created_at
        ) VALUES (
          GEN_RANDOM_UUID(),
          v_product.id,
          p_branch_id,
          'sale',
          v_stock_deduct,
          v_bp.stock,
          v_new_stock,
          'Penjualan ' || v_invoice_number,
          p_transaction_id,
          p_cashier_id,
          p_created_at
        );

        IF v_new_stock <= COALESCE(v_bp.min_stock, v_product.min_stock, 5) THEN
          v_low_stock := v_low_stock || JSONB_BUILD_OBJECT(
            'id',        v_product.id,
            'name',      v_product.name,
            'stock',     v_new_stock,
            'min_stock', COALESCE(v_bp.min_stock, v_product.min_stock, 5)
          );
        END IF;

      ELSE
        -- Produk global belum punya row di branch_products, buat dulu
        INSERT INTO branch_products (branch_id, product_id, stock, min_stock, is_available)
        VALUES (p_branch_id, v_product.id, 0, COALESCE(v_product.min_stock, 5), true);

        INSERT INTO stock_movements (
          id, product_id, branch_id, type, quantity,
          qty_before, qty_after, reason, reference_id, created_by, created_at
        ) VALUES (
          GEN_RANDOM_UUID(),
          v_product.id,
          p_branch_id,
          'sale',
          v_stock_deduct,
          0,
          0,
          'Penjualan ' || v_invoice_number || ' (stok belum diinput)',
          p_transaction_id,
          p_cashier_id,
          p_created_at
        );
      END IF;
    END IF;
  END LOOP;

  -- 4. Poin member
  IF p_member_id IS NOT NULL AND p_points_earned > 0 THEN
    SELECT points, total_spent
      INTO v_cur_points, v_cur_spent
      FROM members
     WHERE id = p_member_id
       FOR UPDATE;

    IF FOUND THEN
      UPDATE members
         SET points      = v_cur_points + p_points_earned,
             total_spent = v_cur_spent  + p_total,
             updated_at  = p_created_at
       WHERE id = p_member_id;

      v_log_id := GEN_RANDOM_UUID();
      INSERT INTO member_point_logs (
        id, member_id, transaction_id, points, description, created_at
      ) VALUES (
        v_log_id,
        p_member_id,
        p_transaction_id,
        p_points_earned,
        'Poin dari ' || v_invoice_number,
        p_created_at
      );
    END IF;
  END IF;

  -- 5. Return hasil
  RETURN JSONB_BUILD_OBJECT(
    'invoice_number', v_invoice_number,
    'low_stock_items', v_low_stock
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION process_transaction(
  UUID, UUID, UUID, UUID,
  NUMERIC, NUMERIC, TEXT,
  NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC,
  TEXT, UUID, INTEGER, JSONB, TIMESTAMPTZ
) TO authenticated;

GRANT EXECUTE ON FUNCTION get_products_by_branch(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION get_categories_by_branch(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_products_for_owner()        TO authenticated;
GRANT EXECUTE ON FUNCTION get_branch_stock_summary(UUID)      TO authenticated;

-- ── 12. RPC: init_branch_products ────────────────────────────────────────────
-- Helper untuk owner: setelah cabang baru dibuat, auto-seed semua produk global
-- ke branch_products dengan stok 0. Dipanggil sekali per cabang baru.

CREATE OR REPLACE FUNCTION init_branch_products(p_branch_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO branch_products (branch_id, product_id, stock, min_stock, is_available)
  SELECT
    p_branch_id,
    p.id,
    0,
    COALESCE(p.min_stock, 5),
    true
  FROM products p
  WHERE p.branch_id IS NULL   -- hanya produk global
    AND p.is_active = true
  ON CONFLICT (branch_id, product_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION init_branch_products(UUID) TO authenticated;
