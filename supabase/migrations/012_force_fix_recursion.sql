-- ================================================
-- MIGRATION 012: FORCE FIX ALL RECURSION
-- ================================================
-- This script uses a dynamic approach to forcefully
-- drop EVERY existing policy on the users table,
-- regardless of what it is named, and replace it
-- with a safe non-recursive one.
-- ================================================

DO $$ 
DECLARE 
    pol record;
BEGIN 
    -- 1. Loop through ALL existing policies on the 'users' table
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'users' LOOP 
        -- 2. Drop them one by one
        EXECUTE format('DROP POLICY IF EXISTS %I ON users', pol.policyname); 
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP; 
END $$;

-- 3. Create the simple, non-recursive policy for users
CREATE POLICY "allow_read_own_user"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- 4. Do the same for purchase_orders just in case
DO $$ 
DECLARE 
    pol record;
BEGIN 
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'purchase_orders' LOOP 
        EXECUTE format('DROP POLICY IF EXISTS %I ON purchase_orders', pol.policyname); 
    END LOOP; 
END $$;

-- Recreate purchase_orders policies using safe subqueries instead of helper functions
CREATE POLICY "po_owner_all"
  ON purchase_orders FOR ALL
  USING ( (SELECT role FROM users WHERE id = auth.uid()) = 'owner' )
  WITH CHECK ( (SELECT role FROM users WHERE id = auth.uid()) = 'owner' );

CREATE POLICY "po_staff_branch"
  ON purchase_orders FOR ALL
  USING ( 
    (SELECT role FROM users WHERE id = auth.uid()) IN ('back_office', 'cashier') 
    AND branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK ( 
    (SELECT role FROM users WHERE id = auth.uid()) IN ('back_office', 'cashier') 
    AND branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Force fix applied successfully!';
END $$;
