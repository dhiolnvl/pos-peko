-- ================================================
-- MIGRATION 055: CREATE STOCK REQUESTS TABLES & RLS POLICIES
-- Fixes missing stock_requests and stock_request_items tables for Staff Cabang & Staff Pusat
-- ================================================

-- 1. CREATE TABLE stock_requests
CREATE TABLE IF NOT EXISTS stock_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  notes        TEXT,
  review_notes TEXT,
  transfer_id  UUID        REFERENCES stock_transfers(id) ON DELETE SET NULL,
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. CREATE TABLE stock_request_items
CREATE TABLE IF NOT EXISTS stock_request_items (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID        NOT NULL REFERENCES stock_requests(id) ON DELETE CASCADE,
  product_id UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity   INTEGER     NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_stock_requests_branch    ON stock_requests(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_requests_status    ON stock_requests(status);
CREATE INDEX IF NOT EXISTS idx_stock_requests_created   ON stock_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_request_items_req  ON stock_request_items(request_id);
CREATE INDEX IF NOT EXISTS idx_stock_request_items_prod ON stock_request_items(product_id);

-- 4. TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_stock_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_requests_updated_at ON stock_requests;

CREATE TRIGGER trg_stock_requests_updated_at
  BEFORE UPDATE ON stock_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_stock_requests_updated_at();

-- 5. ENABLE ROW LEVEL SECURITY
ALTER TABLE stock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_request_items ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "stock_requests_owner_staff_all" ON stock_requests;
DROP POLICY IF EXISTS "stock_requests_branch_access" ON stock_requests;
DROP POLICY IF EXISTS "stock_request_items_owner_staff_all" ON stock_request_items;
DROP POLICY IF EXISTS "stock_request_items_branch_access" ON stock_request_items;

-- 6. RLS POLICIES FOR stock_requests
CREATE POLICY "stock_requests_owner_staff_all" ON stock_requests FOR ALL
  USING (get_user_role() IN ('owner', 'staff_pusat'))
  WITH CHECK (get_user_role() IN ('owner', 'staff_pusat'));

CREATE POLICY "stock_requests_branch_access" ON stock_requests FOR ALL
  USING (get_user_role() IN ('back_office', 'cashier') AND branch_id = get_user_branch_id())
  WITH CHECK (get_user_role() IN ('back_office', 'cashier') AND branch_id = get_user_branch_id());

-- 7. RLS POLICIES FOR stock_request_items
CREATE POLICY "stock_request_items_owner_staff_all" ON stock_request_items FOR ALL
  USING (get_user_role() IN ('owner', 'staff_pusat'))
  WITH CHECK (get_user_role() IN ('owner', 'staff_pusat'));

CREATE POLICY "stock_request_items_branch_access" ON stock_request_items FOR ALL
  USING (
    get_user_role() IN ('back_office', 'cashier')
    AND EXISTS (
      SELECT 1 FROM stock_requests sr
      WHERE sr.id = stock_request_items.request_id
        AND sr.branch_id = get_user_branch_id()
    )
  )
  WITH CHECK (
    get_user_role() IN ('back_office', 'cashier')
    AND EXISTS (
      SELECT 1 FROM stock_requests sr
      WHERE sr.id = stock_request_items.request_id
        AND sr.branch_id = get_user_branch_id()
    )
  );

GRANT ALL ON stock_requests TO authenticated;
GRANT ALL ON stock_request_items TO authenticated;
