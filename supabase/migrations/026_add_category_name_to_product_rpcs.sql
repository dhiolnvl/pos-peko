-- ================================================
-- 026: Tambah category_name ke RPC get_products_by_branch
--      dan get_all_products_for_owner
-- ================================================

DROP FUNCTION IF EXISTS get_products_by_branch(UUID);
DROP FUNCTION IF EXISTS get_all_products_for_owner();

-- ── get_products_by_branch ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_products_by_branch(p_branch_id UUID)
RETURNS TABLE (
  id             UUID,
  name           VARCHAR,
  category_id    UUID,
  category_name  VARCHAR,
  branch_id      UUID,
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
    c.name                                        AS category_name,
    p.branch_id,
    COALESCE(bp.price_override, p.price)          AS price,
    p.cost_price,
    COALESCE(bp.stock, 0)                         AS stock,
    COALESCE(bp.min_stock, 5)                     AS min_stock,
    p.unit,
    p.barcode,
    p.image_url,
    p.is_active,
    COALESCE(bp.is_available, true)               AS is_available,
    bp.price_override,
    p.created_at,
    p.updated_at
  FROM products p
  LEFT JOIN branch_products bp
    ON bp.product_id = p.id AND bp.branch_id = p_branch_id
  LEFT JOIN categories c
    ON c.id = p.category_id
  WHERE
    (p.branch_id IS NULL OR p.branch_id = p_branch_id)
    AND COALESCE(bp.is_available, true) = true
    AND p.is_active = true
    AND (
      EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
      OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND users.role IN ('back_office', 'cashier')
          AND users.branch_id = p_branch_id
      )
    )
  ORDER BY p.updated_at DESC;
$$;

-- ── get_all_products_for_owner ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_all_products_for_owner()
RETURNS TABLE (
  id            UUID,
  name          VARCHAR,
  category_id   UUID,
  category_name VARCHAR,
  branch_id     UUID,
  price         NUMERIC,
  cost_price    NUMERIC,
  unit          VARCHAR,
  barcode       VARCHAR,
  image_url     TEXT,
  is_active     BOOLEAN,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    p.id,
    p.name,
    p.category_id,
    c.name  AS category_name,
    p.branch_id,
    p.price,
    p.cost_price,
    p.unit,
    p.barcode,
    p.image_url,
    p.is_active,
    p.created_at,
    p.updated_at
  FROM products p
  LEFT JOIN categories c
    ON c.id = p.category_id
  WHERE EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'
  )
  ORDER BY p.updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_products_by_branch(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_products_for_owner()   TO authenticated;
