-- ================================================
-- RPC FUNCTIONS FOR PRODUCTS AND CATEGORIES
-- ================================================
-- These functions bypass RLS to avoid recursion issues
-- Permission checks are done inside the function
-- ================================================

-- ================================================
-- FUNCTION: Get Products by Branch ID
-- ================================================
CREATE OR REPLACE FUNCTION get_products_by_branch(p_branch_id UUID)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  category_id UUID,
  branch_id UUID,
  price NUMERIC,
  cost_price NUMERIC,
  stock INTEGER,
  min_stock INTEGER,
  unit VARCHAR,
  barcode VARCHAR,
  image_url TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  -- Owner can see any branch, staff can only see their own branch
  SELECT
    p.id,
    p.name,
    p.category_id,
    p.branch_id,
    p.price,
    p.cost_price,
    p.stock,
    p.min_stock,
    p.unit,
    p.barcode,
    p.image_url,
    p.is_active,
    p.created_at,
    p.updated_at
  FROM products p
  WHERE p.branch_id = p_branch_id
  AND (
    -- Owner can see any branch
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
    OR
    -- Staff can only see their own branch
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('back_office', 'cashier')
      AND users.branch_id = p_branch_id
    )
  )
  ORDER BY p.updated_at DESC;
$$;

-- ================================================
-- FUNCTION: Get Categories by Branch ID
-- ================================================
CREATE OR REPLACE FUNCTION get_categories_by_branch(p_branch_id UUID)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  branch_id UUID,
  sort_order INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  -- Owner can see any branch, staff can only see their own branch
  SELECT
    c.id,
    c.name,
    c.branch_id,
    c.sort_order,
    c.created_at,
    c.updated_at
  FROM categories c
  WHERE c.branch_id = p_branch_id
  AND (
    -- Owner can see any branch
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
    OR
    -- Staff can only see their own branch
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('back_office', 'cashier')
      AND users.branch_id = p_branch_id
    )
  )
  ORDER BY c.sort_order, c.name;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_products_by_branch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_categories_by_branch(UUID) TO authenticated;

-- Comments
COMMENT ON FUNCTION get_products_by_branch(UUID) IS 'Get products for specific branch. Bypasses RLS to avoid recursion.';
COMMENT ON FUNCTION get_categories_by_branch(UUID) IS 'Get categories for specific branch. Bypasses RLS to avoid recursion.';
