-- ================================================
-- FIX RLS INFINITE RECURSION
-- ================================================
-- The issue: get_user_role() and get_user_branch() functions
-- query the users table, which triggers RLS policies that call
-- those same functions, causing infinite recursion.
--
-- Solution: Add a policy that allows users to read their own
-- record WITHOUT calling helper functions.
-- ================================================

-- Drop existing users policies
DROP POLICY IF EXISTS "Owner: Full access to users" ON users;
DROP POLICY IF EXISTS "Staff: Read users in own branch" ON users;

-- ================================================
-- NEW RLS POLICIES: USERS (Fix recursion)
-- ================================================

-- CRITICAL: Allow users to read their own record (breaks recursion)
CREATE POLICY "Users: Read own record"
  ON users FOR SELECT
  USING (id = auth.uid());

-- Owner: Full access to all users
CREATE POLICY "Owner: Full access to users"
  ON users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'owner'
    )
  );

-- Back office & Cashier: Read users in their branch
CREATE POLICY "Staff: Read users in own branch"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('back_office', 'cashier')
      AND users.branch_id = u.branch_id
    )
  );

-- ================================================
-- COMMENT
-- ================================================
COMMENT ON POLICY "Users: Read own record" ON users IS
'Critical policy to break RLS recursion. Users can always read their own record, which allows helper functions like get_user_role() and get_user_branch() to work.';

-- ================================================
-- END OF MIGRATION
-- ================================================
