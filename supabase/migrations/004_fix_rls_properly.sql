-- ================================================
-- FIX RLS PROPERLY - NO RECURSION
-- ================================================
-- Problem: Cannot use subquery to users table in users RLS policy
-- Solution: Create simple policies + use RPC functions for complex operations
-- ================================================

-- Step 1: Drop ALL existing users policies
DROP POLICY IF EXISTS "Owner: Full access to users" ON users;
DROP POLICY IF EXISTS "Staff: Read users in own branch" ON users;
DROP POLICY IF EXISTS "Users: Read own record" ON users;
DROP POLICY IF EXISTS "Users can read own record" ON users;

-- Step 2: Create simple, non-recursive policy
-- Users can ONLY read their own record - this is safe and has no recursion
CREATE POLICY "allow_read_own_user"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- ================================================
-- HELPER RPC FUNCTIONS FOR COMPLEX QUERIES
-- ================================================
-- For operations that need more than "read own record",
-- we use RPC functions with SECURITY DEFINER
-- ================================================

-- Function: Get user profile with branch (used after login)
-- This bypasses RLS by using SECURITY DEFINER
CREATE OR REPLACE FUNCTION get_current_user_profile()
RETURNS TABLE (
  id UUID,
  email VARCHAR,
  name VARCHAR,
  role VARCHAR,
  branch_id UUID,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  branch JSON
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.name,
    u.role,
    u.branch_id,
    u.is_active,
    u.created_at,
    u.updated_at,
    CASE
      WHEN b.id IS NOT NULL THEN
        json_build_object(
          'id', b.id,
          'name', b.name,
          'address', b.address,
          'phone', b.phone,
          'is_active', b.is_active,
          'created_at', b.created_at,
          'updated_at', b.updated_at
        )
      ELSE NULL
    END as branch
  FROM users u
  LEFT JOIN branches b ON u.branch_id = b.id
  WHERE u.id = auth.uid();
END;
$$;

-- Function: Get all users in branch (for owner/back_office)
CREATE OR REPLACE FUNCTION get_users_in_branch(target_branch_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  email VARCHAR,
  name VARCHAR,
  role VARCHAR,
  branch_id UUID,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  -- Get current user info and return users based on their role
  SELECT
    u.id,
    u.email,
    u.name,
    u.role,
    u.branch_id,
    u.is_active,
    u.created_at,
    u.updated_at
  FROM users u
  WHERE
    -- Owner can see all users in specified branch or all if NULL
    (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
      AND (u.branch_id = target_branch_id OR target_branch_id IS NULL)
    )
    OR
    -- Back office can see users in their own branch only
    (
      EXISTS (
        SELECT 1 FROM users caller
        WHERE caller.id = auth.uid()
        AND caller.role = 'back_office'
        AND caller.branch_id = target_branch_id
        AND u.branch_id = target_branch_id
      )
    )
  ORDER BY u.created_at DESC;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_current_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION get_users_in_branch(UUID) TO authenticated;

-- ================================================
-- UPDATE HELPER FUNCTIONS TO WORK WITHOUT RLS
-- ================================================
-- Since we removed complex RLS policies, we need to ensure
-- helper functions still work
-- ================================================

-- Recreate get_user_role function (already has SECURITY DEFINER)
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS VARCHAR
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

-- Recreate get_user_branch function
CREATE OR REPLACE FUNCTION get_user_branch()
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT branch_id FROM users WHERE id = auth.uid();
$$;

-- ================================================
-- COMMENTS
-- ================================================
COMMENT ON POLICY "allow_read_own_user" ON users IS
'Simple policy: users can only read their own record. No recursion possible. For complex queries, use RPC functions like get_current_user_profile() and get_users_in_branch().';

COMMENT ON FUNCTION get_current_user_profile() IS
'RPC function to get current user profile with branch info. Bypasses RLS using SECURITY DEFINER.';

COMMENT ON FUNCTION get_users_in_branch(UUID) IS
'RPC function for owner/back_office to get users in a branch. Checks permissions internally.';

-- ================================================
-- END OF MIGRATION
-- ================================================
