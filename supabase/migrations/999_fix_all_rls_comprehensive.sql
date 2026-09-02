-- ================================================
-- COMPREHENSIVE RLS FIX - RUN THIS IN SUPABASE SQL EDITOR
-- ================================================
-- This migration fixes all RLS infinite recursion issues
-- by simplifying policies and using RPC functions
-- ================================================

-- ================================================
-- STEP 1: DROP ALL PROBLEMATIC POLICIES
-- ================================================

-- Users table
DROP POLICY IF EXISTS "Owner: Full access to users" ON users;
DROP POLICY IF EXISTS "Staff: Read users in own branch" ON users;
DROP POLICY IF EXISTS "Users: Read own record" ON users;
DROP POLICY IF EXISTS "Users can read own record" ON users;
DROP POLICY IF EXISTS "allow_read_own_user" ON users;

-- Branches
DROP POLICY IF EXISTS "Owner: Full access to branches" ON branches;
DROP POLICY IF EXISTS "Staff: Read own branch" ON branches;
DROP POLICY IF EXISTS "branches_owner_all" ON branches;
DROP POLICY IF EXISTS "branches_staff_read_own" ON branches;

-- Categories
DROP POLICY IF EXISTS "Owner: Full access to categories" ON categories;
DROP POLICY IF EXISTS "Back office: Manage categories in own branch" ON categories;
DROP POLICY IF EXISTS "Cashier: Read categories in own branch" ON categories;
DROP POLICY IF EXISTS "categories_owner_all" ON categories;
DROP POLICY IF EXISTS "categories_backoffice_all" ON categories;
DROP POLICY IF EXISTS "categories_cashier_read" ON categories;

-- Products
DROP POLICY IF EXISTS "Owner: Full access to products" ON products;
DROP POLICY IF EXISTS "Back office: Manage products in own branch" ON products;
DROP POLICY IF EXISTS "Cashier: Read products in own branch" ON products;
DROP POLICY IF EXISTS "products_owner_all" ON products;
DROP POLICY IF EXISTS "products_backoffice_all" ON products;
DROP POLICY IF EXISTS "products_cashier_read" ON products;

-- ================================================
-- STEP 2: CREATE SIMPLE, NON-RECURSIVE USER POLICY
-- ================================================

-- CRITICAL: This breaks the recursion loop
CREATE POLICY "allow_read_own_user"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- ================================================
-- STEP 3: UPDATE HELPER FUNCTIONS (NO RECURSION)
-- ================================================

-- Recreate helper functions with SQL language (no PL/pgSQL variables)
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS VARCHAR
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_user_branch()
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT branch_id FROM users WHERE id = auth.uid();
$$;

-- ================================================
-- STEP 4: CREATE RPC FUNCTIONS FOR COMPLEX QUERIES
-- ================================================

-- Get current user profile with branch
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

-- Get active branches
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
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('back_office', 'cashier')
      AND branch_id = b.id
    )
  )
  ORDER BY b.name;
$$;

-- Get branch by ID
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
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('back_office', 'cashier')
      AND branch_id = b.id
    )
  );
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_current_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_branches() TO authenticated;
GRANT EXECUTE ON FUNCTION get_branch_by_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_branch() TO authenticated;

-- ================================================
-- STEP 5: CREATE SIMPLIFIED POLICIES FOR BRANCHES
-- ================================================

-- Simple policies without recursive calls
CREATE POLICY "branches_select_policy"
  ON branches FOR SELECT
  USING (
    is_active = true AND (
      get_user_role() IN ('owner', 'staff_pusat')
      OR (
        get_user_role() IN ('back_office', 'cashier')
        AND get_user_branch() = branches.id
      )
    )
  );

CREATE POLICY "branches_owner_all_policy"
  ON branches FOR ALL
  USING (
    get_user_role() IN ('owner', 'staff_pusat')
  )
  WITH CHECK (
    get_user_role() IN ('owner', 'staff_pusat')
  );

-- ================================================
-- STEP 6: CREATE POLICIES FOR CATEGORIES
-- ================================================

CREATE POLICY "categories_owner_all"
  ON categories FOR ALL
  USING (
    get_user_role() IN ('owner', 'staff_pusat')
  )
  WITH CHECK (
    get_user_role() IN ('owner', 'staff_pusat')
  );

CREATE POLICY "categories_backoffice_all"
  ON categories FOR ALL
  USING (
    get_user_role() = 'back_office'
  )
  WITH CHECK (
    get_user_role() = 'back_office'
  );

CREATE POLICY "categories_cashier_read"
  ON categories FOR SELECT
  USING (
    get_user_role() = 'cashier'
  );

-- ================================================
-- STEP 7: CREATE POLICIES FOR PRODUCTS
-- ================================================

CREATE POLICY "products_owner_all"
  ON products FOR ALL
  USING (
    get_user_role() IN ('owner', 'staff_pusat')
  )
  WITH CHECK (
    get_user_role() IN ('owner', 'staff_pusat')
  );

CREATE POLICY "products_backoffice_all"
  ON products FOR ALL
  USING (
    get_user_role() = 'back_office'
  )
  WITH CHECK (
    get_user_role() = 'back_office'
  );

CREATE POLICY "products_cashier_read"
  ON products FOR SELECT
  USING (
    get_user_role() = 'cashier'
  );

-- ================================================
-- COMMENTS
-- ================================================

COMMENT ON POLICY "allow_read_own_user" ON users IS
'Simple policy: users can only read their own record. No recursion. For complex queries use RPC functions.';

COMMENT ON FUNCTION get_current_user_profile() IS
'RPC function to get current user profile with branch info. Bypasses RLS using SECURITY DEFINER.';

COMMENT ON FUNCTION get_active_branches() IS
'RPC function to get active branches user can access. Bypasses RLS using SECURITY DEFINER.';

-- ================================================
-- END OF MIGRATION
-- ================================================

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'RLS policies fixed successfully! App should now work properly.';
END $$;
