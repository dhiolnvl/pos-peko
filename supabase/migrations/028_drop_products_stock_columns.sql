-- ================================================
-- 028: Hapus kolom stock & min_stock dari tabel products
--      Sumber kebenaran stok sudah pindah ke branch_products sejak 025
-- ================================================

-- ── 1. Update RPC yang masih pakai p.min_stock sebagai fallback ──────────────

DROP FUNCTION IF EXISTS get_products_by_branch(UUID);
DROP FUNCTION IF EXISTS get_all_products_for_owner();
DROP FUNCTION IF EXISTS get_branch_stock_summary(UUID);
DROP FUNCTION IF EXISTS init_branch_products(UUID);

-- get_products_by_branch
CREATE OR REPLACE FUNCTION get_products_by_branch(p_branch_id UUID)
RETURNS TABLE (
  id             UUID,
  name           VARCHAR,
  category_id    UUID,
  category_name  VARCHAR,
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
    c.name                                      AS category_name,
    p.branch_id,
    COALESCE(bp.price_override, p.price)        AS price,
    p.cost_price,
    COALESCE(bp.stock, 0)                       AS stock,
    COALESCE(bp.min_stock, 5)                   AS min_stock,
    p.unit,
    p.barcode,
    p.image_url,
    p.is_active,
    COALESCE(bp.is_available, true)             AS is_available,
    bp.price_override,
    p.created_at,
    p.updated_at
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
  ORDER BY p.updated_at DESC;
$$;

-- get_all_products_for_owner
CREATE OR REPLACE FUNCTION get_all_products_for_owner()
RETURNS TABLE (
  id            UUID,
  name          VARCHAR,
  category_id   UUID,
  category_name VARCHAR,
  branch_id     UUID,
  price         NUMERIC,
  cost_price    NUMERIC,
  unit          VARCHAR,
  barcode       VARCHAR,
  image_url     TEXT,
  is_active     BOOLEAN,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    p.id,
    p.name,
    p.category_id,
    c.name  AS category_name,
    p.branch_id,
    p.price,
    p.cost_price,
    p.unit,
    p.barcode,
    p.image_url,
    p.is_active,
    p.created_at,
    p.updated_at
  FROM products p
  LEFT JOIN categories c
    ON c.id = p.category_id
  WHERE EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'
  )
  ORDER BY p.updated_at DESC;
$$;

-- get_branch_stock_summary
CREATE OR REPLACE FUNCTION get_branch_stock_summary(p_branch_id UUID)
RETURNS TABLE (
  product_id    UUID,
  product_name  VARCHAR,
  category_name VARCHAR,
  stock         INTEGER,
  min_stock     INTEGER,
  price         NUMERIC,
  is_low_stock  BOOLEAN
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    p.id                                              AS product_id,
    p.name                                            AS product_name,
    c.name                                            AS category_name,
    COALESCE(bp.stock, 0)                             AS stock,
    COALESCE(bp.min_stock, 5)                         AS min_stock,
    COALESCE(bp.price_override, p.price)              AS price,
    COALESCE(bp.stock, 0) <= COALESCE(bp.min_stock, 5) AS is_low_stock
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

-- init_branch_products
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
    5,
    true
  FROM products p
  WHERE p.branch_id IS NULL
    AND p.is_active = true
  ON CONFLICT (branch_id, product_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Update process_transaction: hapus fallback ke v_product.min_stock
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

    SELECT id, name
      INTO v_product
      FROM products
     WHERE id = (v_item->>'product_id')::UUID;

    IF v_product IS NOT NULL THEN
      SELECT id, stock, min_stock
        INTO v_bp
        FROM branch_products
       WHERE product_id = v_product.id AND branch_id = p_branch_id
         FOR UPDATE;

      IF v_bp IS NOT NULL THEN
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

        IF v_new_stock <= COALESCE(v_bp.min_stock, 5) THEN
          v_low_stock := v_low_stock || JSONB_BUILD_OBJECT(
            'id',        v_product.id,
            'name',      v_product.name,
            'stock',     v_new_stock,
            'min_stock', COALESCE(v_bp.min_stock, 5)
          );
        END IF;

      ELSE
        INSERT INTO branch_products (branch_id, product_id, stock, min_stock, is_available)
        VALUES (p_branch_id, v_product.id, 0, 5, true);

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

  RETURN JSONB_BUILD_OBJECT(
    'invoice_number', v_invoice_number,
    'low_stock_items', v_low_stock
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION get_products_by_branch(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_products_for_owner()        TO authenticated;
GRANT EXECUTE ON FUNCTION get_branch_stock_summary(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION init_branch_products(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION process_transaction(
  UUID, UUID, UUID, UUID,
  NUMERIC, NUMERIC, TEXT,
  NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC,
  TEXT, UUID, INTEGER, JSONB, TIMESTAMPTZ
) TO authenticated;

-- ── 2. Drop kolom dari tabel products ────────────────────────────────────────

ALTER TABLE products DROP COLUMN IF EXISTS stock;
ALTER TABLE products DROP COLUMN IF EXISTS min_stock;
