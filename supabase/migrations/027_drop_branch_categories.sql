-- ================================================
-- 027: Hapus tabel branch_categories
--      Kategori bersifat global, tidak perlu visibility per cabang
-- ================================================

-- ── 1. Update RPC get_categories_by_branch (hapus JOIN ke branch_categories) ─

DROP FUNCTION IF EXISTS get_categories_by_branch(UUID);

CREATE OR REPLACE FUNCTION get_categories_by_branch(p_branch_id UUID)
RETURNS TABLE (
  id           UUID,
  name         VARCHAR,
  branch_id    UUID,
  sort_order   INTEGER,
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    c.id,
    c.name,
    c.branch_id,
    c.sort_order,
    c.created_at,
    c.updated_at
  FROM categories c
  WHERE
    (c.branch_id IS NULL OR c.branch_id = p_branch_id)
    AND (
      EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
      OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND users.role IN ('back_office', 'cashier')
          AND users.branch_id = p_branch_id
      )
    )
  ORDER BY c.sort_order, c.name;
$$;

GRANT EXECUTE ON FUNCTION get_categories_by_branch(UUID) TO authenticated;

-- ── 2. Drop tabel branch_categories ─────────────────────────────────────────

DROP TABLE IF EXISTS branch_categories CASCADE;
