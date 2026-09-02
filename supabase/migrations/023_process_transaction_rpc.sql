-- ================================================
-- 023: RPC process_transaction
-- Menjalankan seluruh proses transaksi dalam 1 round-trip:
--   1. Generate invoice number
--   2. Insert transaction
--   3. Bulk insert transaction_items
--   4. Update stok + insert stock_movements (per item)
--   5. Update poin member (opsional)
-- ================================================

-- Tambah kolom discount_type yang belum ada di schema
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'nominal';

ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type   TEXT DEFAULT 'nominal';


-- ── RPC Function ─────────────────────────────────────────────────────────────
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
  v_new_stock        INTEGER;
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
    v_item_id := GEN_RANDOM_UUID();

    -- Insert transaction_item
    INSERT INTO transaction_items (
      id, transaction_id, product_id, product_name, product_barcode,
      quantity, price, discount_amount, discount_type, subtotal, created_at
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
      (v_item->>'subtotal')::NUMERIC,
      p_created_at
    );

    -- Ambil stok sekarang + kurangi (atomic dengan FOR UPDATE)
    SELECT id, name, stock, min_stock
      INTO v_product
      FROM products
     WHERE id = (v_item->>'product_id')::UUID
       FOR UPDATE;

    IF v_product IS NOT NULL THEN
      v_new_stock := GREATEST(0, v_product.stock - (v_item->>'quantity')::INTEGER);

      UPDATE products
         SET stock = v_new_stock, updated_at = p_created_at
       WHERE id = v_product.id;

      INSERT INTO stock_movements (
        id, product_id, branch_id, type, quantity,
        qty_before, qty_after, reason, reference_id, created_by, created_at
      ) VALUES (
        GEN_RANDOM_UUID(),
        v_product.id,
        p_branch_id,
        'sale',
        (v_item->>'quantity')::INTEGER,
        v_product.stock,
        v_new_stock,
        'Penjualan ' || v_invoice_number,
        p_transaction_id,
        p_cashier_id,
        p_created_at
      );

      IF v_new_stock <= v_product.min_stock THEN
        v_low_stock := v_low_stock || JSONB_BUILD_OBJECT(
          'id',        v_product.id,
          'name',      v_product.name,
          'stock',     v_new_stock,
          'min_stock', v_product.min_stock
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

-- Grant akses ke authenticated users
GRANT EXECUTE ON FUNCTION process_transaction(
  UUID, UUID, UUID, UUID,
  NUMERIC, NUMERIC, TEXT,
  NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC,
  TEXT, UUID, INTEGER, JSONB, TIMESTAMPTZ
) TO authenticated;
