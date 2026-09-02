-- ================================================
-- MIGRATION 059: FIX STOCK MOVEMENTS QTY_BEFORE & QTY_AFTER NULLABILITY
-- Fixes 'null value in column qty_before of relation stock_movements' error
-- ================================================

-- 1. Make qty_before and qty_after NULLABLE in stock_movements
ALTER TABLE stock_movements
  ALTER COLUMN qty_before DROP NOT NULL,
  ALTER COLUMN qty_after  DROP NOT NULL;

-- 2. Ensure stock_movements type check constraint includes all transfer and PO types
ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_type_check
  CHECK (type IN ('sale', 'purchase', 'adjustment_in', 'adjustment_out', 'opname', 'void', 'transfer_out', 'transfer_in', 'po_receive'));

-- 3. Update receive_stock_transfer RPC function to calculate and set qty_before and qty_after
CREATE OR REPLACE FUNCTION receive_stock_transfer(
  p_transfer_id UUID,
  p_received_items JSONB DEFAULT NULL
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_user_id UUID;
  v_qty_received INT;
  v_rec_elem JSONB;
  v_old_stock INT;
  v_new_stock INT;
BEGIN
  v_user_id := auth.uid();

  -- Ambil data transfer stok
  SELECT * INTO v_transfer
  FROM stock_transfers
  WHERE id = p_transfer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer stok tidak ditemukan';
  END IF;

  IF v_transfer.status = 'received' THEN
    RETURN; -- Jika sudah dikonfirmasi, lewati
  END IF;

  -- Proses setiap item pada transfer
  FOR v_item IN
    SELECT id, product_id, quantity
    FROM stock_transfer_items
    WHERE transfer_id = p_transfer_id
  LOOP
    v_qty_received := v_item.quantity;

    -- Jika p_received_items diberikan, ambil kuantitas fisik yang diterima
    IF p_received_items IS NOT NULL AND jsonb_array_length(p_received_items) > 0 THEN
      FOR v_rec_elem IN SELECT * FROM jsonb_array_elements(p_received_items)
      LOOP
        IF (v_rec_elem->>'product_id')::UUID = v_item.product_id THEN
          v_qty_received := COALESCE((v_rec_elem->>'quantity_received')::INT, v_item.quantity);
        END IF;
      END LOOP;
    END IF;

    -- Update quantity_received di stock_transfer_items
    UPDATE stock_transfer_items
    SET quantity_received = v_qty_received
    WHERE id = v_item.id;

    IF v_qty_received > 0 THEN
      -- Cari stok cabang saat ini
      SELECT COALESCE(stock, 0) INTO v_old_stock
      FROM branch_products
      WHERE branch_id = v_transfer.branch_id AND product_id = v_item.product_id;

      IF v_old_stock IS NULL THEN v_old_stock := 0; END IF;
      v_new_stock := v_old_stock + v_qty_received;

      -- Update / Insert ke branch_products
      INSERT INTO branch_products (branch_id, product_id, stock, min_stock, is_available)
      VALUES (v_transfer.branch_id, v_item.product_id, v_qty_received, 5, true)
      ON CONFLICT (branch_id, product_id)
      DO UPDATE SET
        stock = branch_products.stock + EXCLUDED.stock,
        is_available = true,
        updated_at = now();

      -- Catat ke stock_movements dengan qty_before & qty_after
      INSERT INTO stock_movements (
        product_id,
        branch_id,
        type,
        quantity,
        qty_before,
        qty_after,
        reference_id,
        reason,
        created_by
      ) VALUES (
        v_item.product_id,
        v_transfer.branch_id,
        'transfer_in',
        v_qty_received,
        v_old_stock,
        v_new_stock,
        p_transfer_id,
        'Penerimaan Transfer Stok dari Gudang Pusat',
        v_user_id
      );
    END IF;
  END LOOP;

  -- Update status transfer menjadi 'received'
  UPDATE stock_transfers
  SET status = 'received',
      received_at = now(),
      received_by = v_user_id,
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION receive_stock_transfer(UUID, JSONB) TO authenticated;
