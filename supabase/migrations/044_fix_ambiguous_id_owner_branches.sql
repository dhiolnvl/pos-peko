-- ================================================
-- Fix: get_all_branches_owner() — ambiguous column "id"
-- Output parameter "id" (dari RETURNS TABLE) bentrok dengan
-- kolom "id" pada subquery EXISTS ke tabel users.
-- ================================================

DROP FUNCTION IF EXISTS get_all_branches_owner() CASCADE;
CREATE OR REPLACE FUNCTION get_all_branches_owner()
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
  WHERE EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'
  )
  ORDER BY b.name;
$$;

GRANT EXECUTE ON FUNCTION get_all_branches_owner() TO authenticated;

COMMENT ON FUNCTION get_all_branches_owner() IS
'Owner only: return semua cabang (aktif dan nonaktif) untuk halaman manajemen. SECURITY DEFINER bypass RLS. Fixed ambiguous id reference.';
