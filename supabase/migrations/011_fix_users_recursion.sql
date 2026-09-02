-- ================================================
-- MIGRATION 011: FIX USERS RLS RECURSION
-- ================================================
-- Run this in your Supabase SQL Editor to fix the
-- "infinite recursion" error across all tables.
-- ================================================

-- 1. Drop the recursive policies on users table
DROP POLICY IF EXISTS "Owner: Full access to users" ON users;
DROP POLICY IF EXISTS "Staff: Read users in own branch" ON users;
DROP POLICY IF EXISTS "allow_read_own_user" ON users;

-- 2. Create a simple, non-recursive policy for users
-- This completely stops any infinite loops when other tables
-- check the users table for foreign keys or roles.
CREATE POLICY "allow_read_own_user"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- 3. Just to be safe, ensure the helper functions are set correctly
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

DO $$
BEGIN
  RAISE NOTICE 'Users RLS recursion fixed successfully!';
END $$;
