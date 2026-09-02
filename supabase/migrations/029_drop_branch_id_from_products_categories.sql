-- ================================================
-- 029: Hapus kolom branch_id dari tabel products dan categories
--      Semua produk dan kategori bersifat global sejak 025
-- ================================================

-- ── 1. Update RPC get_categories_by_branch (hapus referensi branch_id) ───────

DROP FUNCTION IF EXISTS get_categories_by_branch(UUID);

CREATE OR REPLACE FUNCTION get_categories_by_branch(p_branch_id UUID)
RETURNS TABLE (
  id         UUID,
  name       VARCHAR,
  sort_order INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    c.id,
    c.name,
    c.sort_order,
    c.created_at,
    c.updated_at
  FROM categories c
  WHERE
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('back_office', 'cashier')
        AND users.branch_id = p_branch_id
    )
  ORDER BY c.sort_order, c.name;
$$;

GRANT EXECUTE ON FUNCTION get_categories_by_branch(UUID) TO authenticated;

-- ── 2. Update RPC get_products_by_branch (hapus p.branch_id dari SELECT & WHERE) ─

DROP FUNCTION IF EXISTS get_products_by_branch(UUID);

CREATE OR REPLACE FUNCTION get_products_by_branch(p_branch_id UUID)
RETURNS TABLE (
  id             UUID,
  name           VARCHAR,
  category_id    UUID,
  category_name  VARCHAR,
  price          NUMERIC,
  cost_price     NUMERIC,
  stock          INTEGER,
  min_stock      INTEGER,
  unit           VARCHAR,
  barcode        VARCHAR,
  image_url      TEXT,
  is_active      BOOLEAN,
  is_available   BOOLEAN,
  price_override NUMERIC,
  created_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    p.id,
    p.name,
    p.category_id,
    c.name                                      AS category_name,
    COALESCE(bp.price_override, p.price)        AS price,
    p.cost_price,
    COALESCE(bp.stock, 0)                       AS stock,
    COALESCE(bp.min_stock, 5)                   AS min_stock,
    p.unit,
    p.barcode,
    p.image_url,
    p.is_active,
    COALESCE(bp.is_available, true)             AS is_available,
    bp.price_override,
    p.created_at,
    p.updated_at
  FROM products p
  INNER JOIN branch_products bp
    ON bp.product_id = p.id AND bp.branch_id = p_branch_id
  LEFT JOIN categories c
    ON c.id = p.category_id
  WHERE
    bp.is_available = true
    AND p.is_active = true
    AND (
      EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
      OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND users.role IN ('back_office', 'cashier')
          AND users.branch_id = p_branch_id
      )
    )
  ORDER BY p.updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_products_by_branch(UUID) TO authenticated;

-- ── 3. Update RPC get_all_products_for_owner (hapus p.branch_id dari SELECT) ─

DROP FUNCTION IF EXISTS get_all_products_for_owner();

CREATE OR REPLACE FUNCTION get_all_products_for_owner()
RETURNS TABLE (
  id            UUID,
  name          VARCHAR,
  category_id   UUID,
  category_name VARCHAR,
  price         NUMERIC,
  cost_price    NUMERIC,
  stock         INTEGER,
  unit          VARCHAR,
  barcode       VARCHAR,
  image_url     TEXT,
  is_active     BOOLEAN,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    p.id,
    p.name,
    p.category_id,
    c.name                                    AS category_name,
    p.price,
    p.cost_price,
    COALESCE(SUM(bp.stock), 0)::INTEGER       AS stock,
    p.unit,
    p.barcode,
    p.image_url,
    p.is_active,
    p.created_at,
    p.updated_at
  FROM products p
  LEFT JOIN categories c
    ON c.id = p.category_id
  LEFT JOIN branch_products bp
    ON bp.product_id = p.id
  WHERE EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'
  )
  GROUP BY p.id, c.name
  ORDER BY p.updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_all_products_for_owner() TO authenticated;

-- ── 4. Update RPC get_branch_stock_summary (hapus p.branch_id dari WHERE) ────

DROP FUNCTION IF EXISTS get_branch_stock_summary(UUID);

CREATE OR REPLACE FUNCTION get_branch_stock_summary(p_branch_id UUID)
RETURNS TABLE (
  product_id    UUID,
  product_name  VARCHAR,
  category_name VARCHAR,
  stock         INTEGER,
  min_stock     INTEGER,
  price         NUMERIC,
  is_low_stock  BOOLEAN
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    p.id                                               AS product_id,
    p.name                                             AS product_name,
    c.name                                             AS category_name,
    COALESCE(bp.stock, 0)                              AS stock,
    COALESCE(bp.min_stock, 5)                          AS min_stock,
    COALESCE(bp.price_override, p.price)               AS price,
    COALESCE(bp.stock, 0) <= COALESCE(bp.min_stock, 5) AS is_low_stock
  FROM products p
  INNER JOIN branch_products bp
    ON bp.product_id = p.id AND bp.branch_id = p_branch_id
  LEFT JOIN categories c
    ON c.id = p.category_id
  WHERE
    bp.is_available = true
    AND p.is_active = true
    AND (
      EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
      OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND users.role IN ('back_office', 'cashier')
          AND users.branch_id = p_branch_id
      )
    )
  ORDER BY is_low_stock DESC, p.name;
$$;

GRANT EXECUTE ON FUNCTION get_branch_stock_summary(UUID) TO authenticated;

-- ── 5. Update RPC init_branch_products (hapus filter p.branch_id IS NULL) ────

DROP FUNCTION IF EXISTS init_branch_products(UUID);

CREATE OR REPLACE FUNCTION init_branch_products(p_branch_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO branch_products (branch_id, product_id, stock, min_stock, is_available)
  SELECT p_branch_id, p.id, 0, 5, true
  FROM products p
  WHERE p.is_active = true
  ON CONFLICT (branch_id, product_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION init_branch_products(UUID) TO authenticated;

-- ── 6. Drop RLS policies yang depend pada branch_id ──────────────────────────
-- products
DROP POLICY IF EXISTS "products_backoffice_all"        ON products;
DROP POLICY IF EXISTS "products_cashier_read"          ON products;
DROP POLICY IF EXISTS "Back office: Manage products in own branch" ON products;
DROP POLICY IF EXISTS "Cashier: Read products in own branch"      ON products;

-- categories
DROP POLICY IF EXISTS "categories_backoffice_all"      ON categories;
DROP POLICY IF EXISTS "categories_cashier_read"        ON categories;
DROP POLICY IF EXISTS "Back office: Manage categories in own branch" ON categories;
DROP POLICY IF EXISTS "Cashier: Read categories in own branch"       ON categories;

-- ── 7. Buat ulang policy products & categories tanpa branch_id ───────────────
-- Semua role boleh baca products & categories (akses dikontrol di level RPC)
-- Back office & cashier tetap bisa insert/update via RPC SECURITY DEFINER

CREATE POLICY "products_backoffice_all"
  ON products FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('owner', 'back_office'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('owner', 'back_office'))
  );

CREATE POLICY "products_cashier_read"
  ON products FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'cashier')
  );

CREATE POLICY "categories_backoffice_all"
  ON categories FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('owner', 'back_office'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('owner', 'back_office'))
  );

CREATE POLICY "categories_cashier_read"
  ON categories FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'cashier')
  );

-- ── 8. Drop kolom branch_id dari kedua tabel ─────────────────────────────────

ALTER TABLE products   DROP COLUMN IF EXISTS branch_id;
ALTER TABLE categories DROP COLUMN IF EXISTS branch_id;
