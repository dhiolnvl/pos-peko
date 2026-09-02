-- Update RPC get_all_products_for_owner
-- Stok = branch_products (semua cabang) + warehouse_stock (gudang)
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS VARCHAR
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

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
    (COALESCE(SUM(bp.stock), 0) + COALESCE(SUM(ws.stock), 0))::INTEGER AS stock,
    5 AS min_stock,
    p.unit, p.barcode, p.image_url, p.is_active,
    p.created_at, p.updated_at,
    p.promo_price, p.promo_start, p.promo_end
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN branch_products bp ON bp.product_id = p.id
  LEFT JOIN warehouse_stock ws ON ws.product_id = p.id
  WHERE public.get_current_user_role() IN ('owner', 'staff_pusat')
  GROUP BY p.id, c.name
  ORDER BY p.updated_at DESC;
$$;
