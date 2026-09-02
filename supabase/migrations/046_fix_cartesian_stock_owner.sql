-- ================================================
-- Fix: get_all_products_for_owner() menghitung stock salah
-- karena LEFT JOIN branch_products + LEFT JOIN warehouse_stock
-- sekaligus menghasilkan cartesian product (baris branch x baris
-- warehouse), sehingga SUM() masing-masing ikut terkali.
--
-- Contoh: 5 baris branch_products + 1 baris warehouse_stock
-- menghasilkan 5 baris gabungan -> SUM(ws.stock) dihitung 5x.
--
-- Fix: jumlahkan tiap sumber di subquery terpisah sebelum join.
-- ================================================

DROP FUNCTION IF EXISTS get_all_products_for_owner() CASCADE;
CREATE OR REPLACE FUNCTION get_all_products_for_owner()
RETURNS TABLE (
  id UUID, name TEXT, category_id UUID, category_name TEXT,
  price NUMERIC, cost_price NUMERIC, stock INTEGER, min_stock INTEGER,
  unit TEXT, barcode TEXT, image_url TEXT, is_active BOOLEAN,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  promo_price NUMERIC, promo_start DATE, promo_end DATE
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id, p.name, p.category_id, c.name AS category_name,
    p.price, p.cost_price,
    (COALESCE(bp.total_stock, 0) + COALESCE(ws.total_stock, 0))::INTEGER AS stock,
    5 AS min_stock,
    p.unit, p.barcode, p.image_url, p.is_active,
    p.created_at, p.updated_at,
    p.promo_price, p.promo_start, p.promo_end
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN (
    SELECT product_id, SUM(stock) AS total_stock
    FROM branch_products
    GROUP BY product_id
  ) bp ON bp.product_id = p.id
  LEFT JOIN (
    SELECT product_id, SUM(stock) AS total_stock
    FROM warehouse_stock
    GROUP BY product_id
  ) ws ON ws.product_id = p.id
  WHERE public.get_current_user_role() IN ('owner', 'staff_pusat')
  ORDER BY p.updated_at DESC;
$$;
