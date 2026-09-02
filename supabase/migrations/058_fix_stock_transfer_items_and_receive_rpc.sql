-- ================================================
-- MIGRATION 058: FIX STOCK TRANSFER ITEMS COLUMNS & RECEIVE RPC
-- Add quantity_received column and support p_received_items in receive_stock_transfer
-- ================================================

-- 1. Add quantity_received column to stock_transfer_items
ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS quantity_received INTEGER DEFAULT NULL;

-- 2. Drop existing functions to replace signature safely
DROP FUNCTION IF EXISTS receive_stock_transfer(UUID) CASCADE;
DROP FUNCTION IF EXISTS receive_stock_transfer(UUID, JSONB) CASCADE;

-- 3. Create overloaded/updated receive_stock_transfer function
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
    RETURN; -- Jika sudah dikonfirmasi, batalkan penambahan berulang
  END IF;

  -- Proses setiap item pada transfer
  FOR v_item IN
    SELECT id, product_id, quantity
    FROM stock_transfer_items
    WHERE transfer_id = p_transfer_id
  LOOP
    v_qty_received := v_item.quantity; -- Default sesuai jumlah yang dikirim

    -- Jika p_received_items diberikan, ambil jumlah fisik yang benar-benar diterima
    IF p_received_items IS NOT NULL AND jsonb_array_length(p_received_items) > 0 THEN
      FOR v_rec_elem IN SELECT * FROM jsonb_array_elements(p_received_items)
      LOOP
        IF (v_rec_elem->>'product_id')::UUID = v_item.product_id THEN
          v_qty_received := COALESCE((v_rec_elem->>'quantity_received')::INT, v_item.quantity);
        END IF;
      END LOOP;
    END IF;

    -- Update quantity_received pada tabel stock_transfer_items
    UPDATE stock_transfer_items
    SET quantity_received = v_qty_received
    WHERE id = v_item.id;

    -- Tambahkan stok ke toko cabang jika v_qty_received > 0
    IF v_qty_received > 0 THEN
      INSERT INTO branch_products (branch_id, product_id, stock, min_stock, is_available)
      VALUES (v_transfer.branch_id, v_item.product_id, v_qty_received, 5, true)
      ON CONFLICT (branch_id, product_id)
      DO UPDATE SET
        stock = branch_products.stock + EXCLUDED.stock,
        is_available = true,
        updated_at = now();

      -- Catat riwayat pergerakan stok (transfer_in)
      INSERT INTO stock_movements (
        product_id,
        branch_id,
        type,
        quantity,
        reference_id,
        reason,
        created_by
      ) VALUES (
        v_item.product_id,
        v_transfer.branch_id,
        'transfer_in',
        v_qty_received,
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

-- 4. GRANT PERMISSION
GRANT EXECUTE ON FUNCTION receive_stock_transfer(UUID, JSONB) TO authenticated;
