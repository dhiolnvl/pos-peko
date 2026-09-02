-- ================================================
-- 030: Seed branch_products untuk semua produk aktif x semua cabang aktif
--      Target: 776 produk x 3 cabang = 2328 rows
-- ================================================

INSERT INTO branch_products (branch_id, product_id, stock, min_stock, is_available)
SELECT
  b.id  AS branch_id,
  p.id  AS product_id,
  0     AS stock,
  5     AS min_stock,
  true  AS is_available
FROM products p
CROSS JOIN branches b
WHERE p.is_active = true
  AND b.is_active = true
ON CONFLICT (branch_id, product_id) DO NOTHING;
