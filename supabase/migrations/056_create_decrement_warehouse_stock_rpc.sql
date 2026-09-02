-- ================================================
-- MIGRATION 056: CREATE DECREMENT/INCREMENT WAREHOUSE STOCK RPC FUNCTIONS
-- Fixes missing RPC function error 'decrement_warehouse_stock' when approving stock requests
-- ================================================

-- 1. Function decrement_warehouse_stock
CREATE OR REPLACE FUNCTION decrement_warehouse_stock(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_qty INT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  -- Kurangi stok di warehouse_stock
  UPDATE warehouse_stock
  SET stock = GREATEST(0, stock - p_qty),
      updated_at = now()
  WHERE warehouse_id = p_warehouse_id
    AND product_id = p_product_id;

  -- Jika entitas stok belum ada, buat entri awal
  IF NOT FOUND THEN
    INSERT INTO warehouse_stock (warehouse_id, product_id, stock, min_stock)
    VALUES (p_warehouse_id, p_product_id, 0, 5)
    ON CONFLICT (warehouse_id, product_id) DO UPDATE SET stock = GREATEST(0, warehouse_stock.stock - p_qty);
  END IF;
END;
$$;

-- 2. Function increment_warehouse_stock
CREATE OR REPLACE FUNCTION increment_warehouse_stock(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_qty INT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO warehouse_stock (warehouse_id, product_id, stock, min_stock)
  VALUES (p_warehouse_id, p_product_id, p_qty, 5)
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET stock = warehouse_stock.stock + p_qty,
                updated_at = now();
END;
$$;

-- 3. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION decrement_warehouse_stock(UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_warehouse_stock(UUID, UUID, INT) TO authenticated;
