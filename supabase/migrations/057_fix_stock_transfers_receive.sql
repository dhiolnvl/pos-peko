-- ================================================
-- MIGRATION 057: FIX STOCK TRANSFERS RECEIVE COLUMNS & RPC
-- Fixes missing received_at, received_by columns and receive_stock_transfer RPC function
-- ================================================

-- 1. ALTER TABLE stock_transfers (Tambah kolom received_at, received_by & perbarui status constraint)
ALTER TABLE stock_transfers
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE stock_transfers
  DROP CONSTRAINT IF EXISTS stock_transfers_status_check;

ALTER TABLE stock_transfers
  ADD CONSTRAINT stock_transfers_status_check
  CHECK (status IN ('draft', 'sent', 'received', 'cancelled'));

-- 2. CREATE RPC FUNCTION receive_stock_transfer
CREATE OR REPLACE FUNCTION receive_stock_transfer(p_transfer_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_user_id UUID;
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
    RETURN; -- Jika sudah diterima, lewati
  END IF;

  -- 1. Perbarui stok cabang untuk setiap item transfer
  FOR v_item IN
    SELECT product_id, quantity
    FROM stock_transfer_items
    WHERE transfer_id = p_transfer_id
  LOOP
    -- Upsert stok ke branch_products
    INSERT INTO branch_products (branch_id, product_id, stock, min_stock, is_available)
    VALUES (v_transfer.branch_id, v_item.product_id, v_item.quantity, 5, true)
    ON CONFLICT (branch_id, product_id)
    DO UPDATE SET
      stock = branch_products.stock + EXCLUDED.stock,
      is_available = true,
      updated_at = now();

    -- 2. Catat riwayat pergerakan stok (transfer_in)
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
      v_item.quantity,
      p_transfer_id,
      'Penerimaan Transfer Stok dari Gudang Pusat',
      v_user_id
    );
  END LOOP;

  -- 3. Update status transfer menjadi 'received'
  UPDATE stock_transfers
  SET status = 'received',
      received_at = now(),
      received_by = v_user_id,
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- 3. GRANT PERMISSION
GRANT EXECUTE ON FUNCTION receive_stock_transfer(UUID) TO authenticated;
