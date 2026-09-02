-- ================================================
-- MIGRATION 051: ALLOW STAFF PUSAT IN ALL RPC FUNCTIONS
-- Fixes empty products/categories/branches for Staff Pusat role
-- ================================================

-- 1. get_products_by_branch: Support staff_pusat
DROP FUNCTION IF EXISTS get_products_by_branch(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_products_by_branch(p_branch_id UUID)
RETURNS TABLE (
  id             UUID,
  name           VARCHAR,
  category_id    UUID,
  category_name  VARCHAR,
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
  INNER JOIN branch_products bp
    ON bp.product_id = p.id AND bp.branch_id = p_branch_id
  LEFT JOIN categories c
    ON c.id = p.category_id
  WHERE
    bp.is_available = true
    AND p.is_active = true
    AND (
      get_user_role() IN ('owner', 'staff_pusat')
      OR (
        get_user_role() IN ('back_office', 'cashier')
        AND get_user_branch_id() = p_branch_id
      )
    )
  ORDER BY p.name;
$$;

GRANT EXECUTE ON FUNCTION get_products_by_branch(UUID) TO authenticated;

-- 2. get_categories_by_branch: Support staff_pusat
DROP FUNCTION IF EXISTS get_categories_by_branch(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_categories_by_branch(p_branch_id UUID)
RETURNS TABLE (
  id         UUID,
  name       VARCHAR,
  sort_order INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    c.id,
    c.name,
    c.sort_order,
    c.created_at,
    c.updated_at
  FROM categories c
  WHERE
    get_user_role() IN ('owner', 'staff_pusat')
    OR (
      get_user_role() IN ('back_office', 'cashier')
      AND get_user_branch_id() = p_branch_id
    )
  ORDER BY c.sort_order, c.name;
$$;

GRANT EXECUTE ON FUNCTION get_categories_by_branch(UUID) TO authenticated;

-- 3. get_all_branches_owner: Support staff_pusat
DROP FUNCTION IF EXISTS get_all_branches_owner() CASCADE;

CREATE OR REPLACE FUNCTION get_all_branches_owner()
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  address TEXT,
  phone VARCHAR,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    b.id,
    b.name,
    b.address,
    b.phone,
    b.is_active,
    b.created_at,
    b.updated_at
  FROM branches b
  WHERE get_user_role() IN ('owner', 'staff_pusat')
  ORDER BY b.name;
$$;

GRANT EXECUTE ON FUNCTION get_all_branches_owner() TO authenticated;

-- 4. get_all_products_for_owner: Support staff_pusat
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
  WHERE get_user_role() IN ('owner', 'staff_pusat')
  ORDER BY p.updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_all_products_for_owner() TO authenticated;
