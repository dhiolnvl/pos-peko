-- ========================================================
-- MIGRATION 047: FIX INFINITE RECURSION IN USERS RLS POLICIES
-- ========================================================
-- Problem: Policies like 'users_staff_pusat_manage_lower' contained
-- subqueries directly querying the 'users' table:
-- (EXISTS (SELECT 1 FROM users WHERE ...)).
-- When any query touches 'users', PostgreSQL checks the RLS policy,
-- which queries 'users', triggering the policy again infinitely.
--
-- Fix:
-- 1. Use SECURITY DEFINER helper function (get_user_role()) which bypasses RLS
-- 2. Drop all recursive policies on table 'users'
-- 3. Create simple, safe policies using get_user_role()
-- 4. Create owner_update_user RPC function
-- ========================================================

-- STEP 1: Ensure helper functions are SECURITY DEFINER (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS VARCHAR
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_user_branch_id()
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT branch_id FROM users WHERE id = auth.uid();
$$;

-- STEP 2: Drop all existing/problematic policies on users table
DROP POLICY IF EXISTS "users_staff_pusat_manage_lower" ON users;
DROP POLICY IF EXISTS "users_staff_pusat_read_self" ON users;
DROP POLICY IF EXISTS "Owner: Full access to users" ON users;
DROP POLICY IF EXISTS "Staff: Read users in own branch" ON users;
DROP POLICY IF EXISTS "Users: Read own record" ON users;
DROP POLICY IF EXISTS "Users can read own record" ON users;
DROP POLICY IF EXISTS "allow_read_own_user" ON users;
DROP POLICY IF EXISTS "allow_read_name_authenticated" ON users;
DROP POLICY IF EXISTS "allow_read_authenticated" ON users;
DROP POLICY IF EXISTS "owner_manage_users" ON users;
DROP POLICY IF EXISTS "staff_pusat_manage_lower_users" ON users;
DROP POLICY IF EXISTS "users_update_self" ON users;

-- STEP 3: Re-create clean, non-recursive RLS policies for 'users'

-- 3a. SELECT: Allow authenticated users to read users table
-- (Needed for showing staff list, cashier names on transactions, etc.)
CREATE POLICY "allow_read_authenticated"
  ON users FOR SELECT
  TO authenticated
  USING (true);

-- 3b. ALL (INSERT, UPDATE, DELETE): Owner can manage all users
CREATE POLICY "owner_manage_users"
  ON users FOR ALL
  TO authenticated
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- 3c. ALL (INSERT, UPDATE, DELETE): Staff Pusat can manage lower roles (back_office, cashier)
CREATE POLICY "staff_pusat_manage_lower_users"
  ON users FOR ALL
  TO authenticated
  USING (get_user_role() = 'staff_pusat' AND role IN ('back_office', 'cashier'))
  WITH CHECK (get_user_role() = 'staff_pusat' AND role IN ('back_office', 'cashier'));

-- 3d. UPDATE: Users can update their own record (e.g. profile update)
CREATE POLICY "users_update_self"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- STEP 4: RPC Function for Owner/Staff Pusat to update user details safely
DROP FUNCTION IF EXISTS owner_update_user(UUID, VARCHAR, VARCHAR, UUID, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS owner_update_user CASCADE;
CREATE OR REPLACE FUNCTION owner_update_user(
  p_user_id UUID,
  p_name VARCHAR,
  p_role VARCHAR,
  p_branch_id UUID,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Verify caller is owner or staff_pusat
  IF (SELECT get_user_role()) NOT IN ('owner', 'staff_pusat') THEN
    RAISE EXCEPTION 'Unauthorized: Only owner or staff_pusat can update users';
  END IF;

  UPDATE users
  SET
    name = p_name,
    role = p_role,
    branch_id = p_branch_id,
    is_active = p_is_active,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;
