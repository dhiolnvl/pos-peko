-- ================================================
-- RPC FUNCTION TO GET BRANCHES (BYPASS RLS)
-- ================================================
-- This completely bypasses RLS to avoid any recursion issues
-- Permission checks are done inside the function
-- ================================================

-- Function: Get active branches (for owner to select)
CREATE OR REPLACE FUNCTION get_active_branches()
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
  -- Get branches that the current user can access
  SELECT
    b.id,
    b.name,
    b.address,
    b.phone,
    b.is_active,
    b.created_at,
    b.updated_at
  FROM branches b
  WHERE b.is_active = true
  AND (
    -- Owner can see all branches
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
    OR
    -- Staff can only see their own branch
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('back_office', 'cashier')
      AND branch_id = b.id
    )
  )
  ORDER BY b.name;
$$;

-- Function: Get single branch by ID
CREATE OR REPLACE FUNCTION get_branch_by_id(branch_id UUID)
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
  WHERE b.id = branch_id
  AND (
    -- Owner can see any branch
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
    OR
    -- Staff can only see their own branch
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('back_office', 'cashier')
      AND branch_id = b.id
    )
  );
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_active_branches() TO authenticated;
GRANT EXECUTE ON FUNCTION get_branch_by_id(UUID) TO authenticated;

-- ================================================
-- COMMENTS
-- ================================================
COMMENT ON FUNCTION get_active_branches() IS
'Get all active branches that the current user can access. Uses SECURITY DEFINER to bypass RLS and avoid recursion.';

COMMENT ON FUNCTION get_branch_by_id(UUID) IS
'Get a single branch by ID if user has permission. Uses SECURITY DEFINER to bypass RLS.';

-- ================================================
-- END OF MIGRATION
-- ================================================
