-- ── Reward Items (header) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  points_required INTEGER NOT NULL CHECK (points_required > 0),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_synced BOOLEAN DEFAULT false,
  local_created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Reward Item Products (detail produk per reward) ───────────────────────────
CREATE TABLE IF NOT EXISTS reward_item_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_item_id UUID NOT NULL REFERENCES reward_items(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_products_reward ON reward_item_products(reward_item_id);

-- ── Point Redemptions (riwayat penukaran) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS point_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  reward_item_id UUID REFERENCES reward_items(id) ON DELETE SET NULL,
  reward_name TEXT NOT NULL,
  points_used INTEGER NOT NULL CHECK (points_used > 0),
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_synced BOOLEAN DEFAULT false,
  local_created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redemptions_member ON point_redemptions(member_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE reward_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_item_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reward_items_auth" ON reward_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "reward_item_products_auth" ON reward_item_products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "point_redemptions_auth" ON point_redemptions FOR ALL TO authenticated USING (true) WITH CHECK (true);
