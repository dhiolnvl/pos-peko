-- ================================================
-- MIGRATION 062: ADD COST_PRICE TO TRANSACTION_ITEMS & UPDATE PROCESS_TRANSACTION RPC
-- Fixes missing column cost_price in transaction_items table for gross profit reports & transaction details
-- ================================================

-- 1. ADD COLUMN cost_price TO transaction_items
ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(15,2) DEFAULT 0;

-- 2. POPULATE EXISTING RECORDS WITH PRODUCT COST_PRICE
UPDATE transaction_items ti
SET cost_price = COALESCE(p.cost_price, 0)
FROM products p
WHERE ti.product_id = p.id
  AND (ti.cost_price IS NULL OR ti.cost_price = 0);

-- 3. UPDATE process_transaction RPC TO INSERT COST_PRICE
CREATE OR REPLACE FUNCTION public.process_transaction(
  p_transaction_id        UUID,
  p_branch_id             UUID,
  p_cashier_id            UUID,
  p_shift_id              UUID,
  p_subtotal              NUMERIC,
  p_discount_amount       NUMERIC,
  p_discount_type         TEXT,
  p_tax_amount            NUMERIC,
  p_total                 NUMERIC,
  p_payment_method        TEXT,
  p_payment_amount        NUMERIC,
  p_change_amount         NUMERIC,
  p_notes                 TEXT,
  p_member_id             UUID,
  p_points_earned         INTEGER,
  p_items                 JSONB,
  p_created_at            TIMESTAMP WITH TIME ZONE,
  p_split_payment_detail  JSONB    DEFAULT NULL,
  p_delivery_fee          NUMERIC  DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_invoice_number   TEXT;
  v_date_str         TEXT;
  v_branch_code      TEXT;
  v_tx_count         INTEGER;
  v_retry            INTEGER := 0;
  v_inserted         BOOLEAN := FALSE;
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
  v_cost_price       NUMERIC;
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

  WHILE NOT v_inserted AND v_retry < 10 LOOP
    v_invoice_number := 'INV/' || v_date_str || '/' || v_branch_code || '/'
                        || LPAD((v_tx_count + 1 + v_retry)::TEXT, 4, '0');

    BEGIN
      INSERT INTO transactions (
        id, branch_id, cashier_id, shift_id,
        invoice_number, subtotal, discount_amount, discount_type,
        tax_amount, total, payment_method, payment_amount,
        change_amount, notes, status, member_id, points_earned,
        split_payment_detail, delivery_fee,
        created_at, updated_at
      ) VALUES (
        p_transaction_id, p_branch_id, p_cashier_id, p_shift_id,
        v_invoice_number, p_subtotal, p_discount_amount, p_discount_type,
        p_tax_amount, p_total, p_payment_method, p_payment_amount,
        p_change_amount, p_notes, 'completed', p_member_id, p_points_earned,
        p_split_payment_detail, COALESCE(p_delivery_fee, 0),
        p_created_at, p_created_at
      );
      v_inserted := TRUE;

    EXCEPTION WHEN unique_violation THEN
      v_retry := v_retry + 1;
    END;
  END LOOP;

  IF NOT v_inserted THEN
    RAISE EXCEPTION 'Gagal generate invoice_number unik setelah 10 percobaan (branch %, tanggal %)',
      p_branch_id, v_date_str;
  END IF;

  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
  LOOP
    v_item_id      := GEN_RANDOM_UUID();
    v_stock_deduct := COALESCE((v_item->>'unit_multiplier')::INTEGER, 1)
                      * (v_item->>'quantity')::INTEGER;

    -- Ambil cost_price dari item payload atau master produk
    v_cost_price := COALESCE(
      (v_item->>'cost_price')::NUMERIC,
      (SELECT cost_price FROM products WHERE id = (v_item->>'product_id')::UUID),
      0
    );

    INSERT INTO transaction_items (
      id, transaction_id, product_id, product_name, product_barcode,
      quantity, price, cost_price, discount_amount, discount_type,
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
      v_cost_price,
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
END;
$function$;

GRANT EXECUTE ON FUNCTION public.process_transaction(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, UUID, INTEGER, JSONB, TIMESTAMP WITH TIME ZONE, JSONB, NUMERIC) TO authenticated;
