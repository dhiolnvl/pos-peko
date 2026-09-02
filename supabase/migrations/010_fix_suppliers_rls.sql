-- ================================================
-- MIGRATION 010: FIX SUPPLIERS RLS RECURSION
-- ================================================
-- Run this in your Supabase SQL Editor to fix the
-- "infinite recursion" error when adding suppliers.
-- ================================================

-- Drop the old recursive policies
DROP POLICY IF EXISTS "suppliers_owner_all" ON suppliers;
DROP POLICY IF EXISTS "suppliers_backoffice_all" ON suppliers;
DROP POLICY IF EXISTS "suppliers_cashier_read" ON suppliers;

-- Ensure helper functions exist (from migration 999)
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

GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_branch() TO authenticated;

-- Create new policies using the SECURITY DEFINER functions
-- This bypasses the users table RLS and prevents infinite recursion

-- Owner: Full access to all suppliers
CREATE POLICY "suppliers_owner_all"
  ON suppliers FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office: Full access to suppliers in their branch
CREATE POLICY "suppliers_backoffice_all"
  ON suppliers FOR ALL
  USING (get_user_role() = 'back_office' AND get_user_branch() = branch_id)
  WITH CHECK (get_user_role() = 'back_office' AND get_user_branch() = branch_id);

-- Cashier: Read-only access to suppliers in their branch
CREATE POLICY "suppliers_cashier_read"
  ON suppliers FOR SELECT
  USING (get_user_role() = 'cashier' AND get_user_branch() = branch_id);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Suppliers RLS recursion fixed successfully!';
END $$;
