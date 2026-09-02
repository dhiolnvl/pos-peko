-- ================================================
-- MIGRATION 060: FIX USER MANAGEMENT RPCs FOR STAFF PUSAT & OWNER
-- Allows staff_pusat to view and manage users via RPC functions
-- ================================================

-- 1. DROP and CREATE get_users_in_branch
DROP FUNCTION IF EXISTS get_users_in_branch(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_users_in_branch() CASCADE;

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
    -- Owner and Staff Pusat can view all users or users in specified branch
    (
      get_user_role() IN ('owner', 'staff_pusat')
      AND (u.branch_id = target_branch_id OR target_branch_id IS NULL)
    )
    OR
    -- Back office / Cashier can view users in their own branch
    (
      get_user_role() IN ('back_office', 'cashier')
      AND (u.branch_id = target_branch_id OR u.branch_id = get_user_branch_id() OR target_branch_id IS NULL)
    )
  ORDER BY u.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_users_in_branch(UUID) TO authenticated;

-- 2. CREATE / REPLACE get_all_users_owner
DROP FUNCTION IF EXISTS get_all_users_owner() CASCADE;

CREATE OR REPLACE FUNCTION get_all_users_owner()
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
  WHERE get_user_role() IN ('owner', 'staff_pusat')
  ORDER BY u.name;
$$;

GRANT EXECUTE ON FUNCTION get_all_users_owner() TO authenticated;

-- 3. RE-VERIFY owner_update_user
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
  IF get_user_role() NOT IN ('owner', 'staff_pusat') THEN
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

GRANT EXECUTE ON FUNCTION owner_update_user(UUID, VARCHAR, VARCHAR, UUID, BOOLEAN) TO authenticated;
