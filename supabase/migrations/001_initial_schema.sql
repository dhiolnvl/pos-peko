-- ================================================
-- PEKOPETSHOP DATABASE SCHEMA
-- ================================================
-- Multi-branch POS system with 3 roles:
-- - owner: Full access to all branches
-- - back_office: Manage products, stock, reports for their branch
-- - cashier: POS transactions for their branch
-- ================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
SET search_path TO public, extensions;

-- ================================================
-- 1. BRANCHES TABLE
-- ================================================
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- 2. USERS TABLE
-- ================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'back_office', 'cashier')),
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- 3. CATEGORIES TABLE
-- ================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- 4. PRODUCTS TABLE
-- ================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  price NUMERIC(15, 2) NOT NULL,
  cost_price NUMERIC(15, 2),
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 5,
  unit VARCHAR(50),
  barcode VARCHAR(255),
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_barcode_per_branch UNIQUE (barcode, branch_id)
);

-- Index for barcode lookup
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_branch ON products(branch_id);
CREATE INDEX idx_products_category ON products(category_id);

-- ================================================
-- 5. TRANSACTIONS TABLE
-- ================================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  cashier_id UUID REFERENCES users(id) ON DELETE SET NULL,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  subtotal NUMERIC(15, 2) NOT NULL,
  discount_amount NUMERIC(15, 2) DEFAULT 0,
  tax_amount NUMERIC(15, 2) DEFAULT 0,
  total NUMERIC(15, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'qris')),
  payment_amount NUMERIC(15, 2) NOT NULL,
  change_amount NUMERIC(15, 2) DEFAULT 0,
  notes TEXT,
  status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('completed', 'void')),
  voided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for transactions
CREATE INDEX idx_transactions_branch ON transactions(branch_id);
CREATE INDEX idx_transactions_cashier ON transactions(cashier_id);
CREATE INDEX idx_transactions_invoice ON transactions(invoice_number);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- ================================================
-- 6. TRANSACTION_ITEMS TABLE
-- ================================================
CREATE TABLE transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  product_barcode VARCHAR(255),
  quantity INTEGER NOT NULL,
  price NUMERIC(15, 2) NOT NULL,
  subtotal NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for transaction items
CREATE INDEX idx_transaction_items_transaction ON transaction_items(transaction_id);
CREATE INDEX idx_transaction_items_product ON transaction_items(product_id);

-- ================================================
-- 7. STOCK_MOVEMENTS TABLE
-- ================================================
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('sale', 'purchase', 'adjustment_in', 'adjustment_out', 'opname', 'void')),
  quantity INTEGER NOT NULL,
  qty_before INTEGER NOT NULL,
  qty_after INTEGER NOT NULL,
  reason TEXT,
  reference_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for stock movements
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_branch ON stock_movements(branch_id);
CREATE INDEX idx_stock_movements_type ON stock_movements(type);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at DESC);

-- ================================================
-- 8. STOCK_OPNAME TABLE
-- ================================================
CREATE TABLE stock_opname (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for stock opname
CREATE INDEX idx_stock_opname_branch ON stock_opname(branch_id);
CREATE INDEX idx_stock_opname_status ON stock_opname(status);

-- ================================================
-- 9. STOCK_OPNAME_ITEMS TABLE
-- ================================================
CREATE TABLE stock_opname_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opname_id UUID REFERENCES stock_opname(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  system_stock INTEGER NOT NULL,
  physical_stock INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for stock opname items
CREATE INDEX idx_stock_opname_items_opname ON stock_opname_items(opname_id);
CREATE INDEX idx_stock_opname_items_product ON stock_opname_items(product_id);

-- ================================================
-- 10. PURCHASE_ORDERS TABLE
-- ================================================
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  supplier_name VARCHAR(255) NOT NULL,
  supplier_phone VARCHAR(50),
  notes TEXT,
  total_items INTEGER DEFAULT 0,
  total_amount NUMERIC(15, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'received')),
  received_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for purchase orders
CREATE INDEX idx_purchase_orders_branch ON purchase_orders(branch_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);

-- ================================================
-- 11. PURCHASE_ORDER_ITEMS TABLE
-- ================================================
CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  cost_price NUMERIC(15, 2) NOT NULL,
  subtotal NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for purchase order items
CREATE INDEX idx_purchase_order_items_po ON purchase_order_items(po_id);
CREATE INDEX idx_purchase_order_items_product ON purchase_order_items(product_id);

-- ================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to tables
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_stock_opname_updated_at BEFORE UPDATE ON stock_opname FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================

-- Enable RLS on all tables
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_opname ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_opname_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- ================================================
-- HELPER FUNCTION: Get user role and branch
-- ================================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS VARCHAR AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_branch()
RETURNS UUID AS $$
  SELECT branch_id FROM users WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- ================================================
-- RLS POLICIES: BRANCHES
-- ================================================

-- Owner: Full access to all branches
CREATE POLICY "Owner: Full access to branches"
  ON branches FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office & Cashier: Read only their branch
CREATE POLICY "Staff: Read own branch"
  ON branches FOR SELECT
  USING (
    get_user_role() IN ('back_office', 'cashier')
    AND id = get_user_branch()
  );

-- ================================================
-- RLS POLICIES: USERS
-- ================================================

-- Owner: Full access to all users
CREATE POLICY "Owner: Full access to users"
  ON users FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office & Cashier: Read users in their branch
CREATE POLICY "Staff: Read users in own branch"
  ON users FOR SELECT
  USING (
    get_user_role() IN ('back_office', 'cashier')
    AND branch_id = get_user_branch()
  );

-- ================================================
-- RLS POLICIES: CATEGORIES
-- ================================================

-- Owner: Full access to all categories
CREATE POLICY "Owner: Full access to categories"
  ON categories FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office: Full access to categories in their branch
CREATE POLICY "Back office: Manage categories in own branch"
  ON categories FOR ALL
  USING (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  )
  WITH CHECK (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  );

-- Cashier: Read categories in their branch
CREATE POLICY "Cashier: Read categories in own branch"
  ON categories FOR SELECT
  USING (
    get_user_role() = 'cashier'
    AND branch_id = get_user_branch()
  );

-- ================================================
-- RLS POLICIES: PRODUCTS
-- ================================================

-- Owner: Full access to all products
CREATE POLICY "Owner: Full access to products"
  ON products FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office: Full access to products in their branch
CREATE POLICY "Back office: Manage products in own branch"
  ON products FOR ALL
  USING (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  )
  WITH CHECK (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  );

-- Cashier: Read products in their branch
CREATE POLICY "Cashier: Read products in own branch"
  ON products FOR SELECT
  USING (
    get_user_role() = 'cashier'
    AND branch_id = get_user_branch()
  );

-- ================================================
-- RLS POLICIES: TRANSACTIONS
-- ================================================

-- Owner: Full access to all transactions
CREATE POLICY "Owner: Full access to transactions"
  ON transactions FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office: Read transactions in their branch
CREATE POLICY "Back office: Read transactions in own branch"
  ON transactions FOR SELECT
  USING (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  );

-- Cashier: Insert and read their own transactions
CREATE POLICY "Cashier: Create transactions"
  ON transactions FOR INSERT
  WITH CHECK (
    get_user_role() = 'cashier'
    AND branch_id = get_user_branch()
    AND cashier_id = auth.uid()
  );

CREATE POLICY "Cashier: Read own transactions"
  ON transactions FOR SELECT
  USING (
    get_user_role() = 'cashier'
    AND cashier_id = auth.uid()
  );

-- ================================================
-- RLS POLICIES: TRANSACTION_ITEMS
-- ================================================

-- Owner: Full access to all transaction items
CREATE POLICY "Owner: Full access to transaction_items"
  ON transaction_items FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office: Read transaction items for their branch
CREATE POLICY "Back office: Read transaction_items in own branch"
  ON transaction_items FOR SELECT
  USING (
    get_user_role() = 'back_office'
    AND EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_items.transaction_id
      AND t.branch_id = get_user_branch()
    )
  );

-- Cashier: Insert and read their own transaction items
CREATE POLICY "Cashier: Create transaction_items"
  ON transaction_items FOR INSERT
  WITH CHECK (
    get_user_role() = 'cashier'
    AND EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_items.transaction_id
      AND t.cashier_id = auth.uid()
    )
  );

CREATE POLICY "Cashier: Read own transaction_items"
  ON transaction_items FOR SELECT
  USING (
    get_user_role() = 'cashier'
    AND EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_items.transaction_id
      AND t.cashier_id = auth.uid()
    )
  );

-- ================================================
-- RLS POLICIES: STOCK_MOVEMENTS
-- ================================================

-- Owner: Full access to all stock movements
CREATE POLICY "Owner: Full access to stock_movements"
  ON stock_movements FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office: Full access to stock movements in their branch
CREATE POLICY "Back office: Manage stock_movements in own branch"
  ON stock_movements FOR ALL
  USING (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  )
  WITH CHECK (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  );

-- Cashier: Insert sale movements only
CREATE POLICY "Cashier: Create sale movements"
  ON stock_movements FOR INSERT
  WITH CHECK (
    get_user_role() = 'cashier'
    AND branch_id = get_user_branch()
    AND type = 'sale'
    AND created_by = auth.uid()
  );

-- ================================================
-- RLS POLICIES: STOCK_OPNAME
-- ================================================

-- Owner: Full access to all stock opname
CREATE POLICY "Owner: Full access to stock_opname"
  ON stock_opname FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office: Full access to stock opname in their branch
CREATE POLICY "Back office: Manage stock_opname in own branch"
  ON stock_opname FOR ALL
  USING (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  )
  WITH CHECK (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  );

-- ================================================
-- RLS POLICIES: STOCK_OPNAME_ITEMS
-- ================================================

-- Owner: Full access to all stock opname items
CREATE POLICY "Owner: Full access to stock_opname_items"
  ON stock_opname_items FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office: Full access to stock opname items in their branch
CREATE POLICY "Back office: Manage stock_opname_items in own branch"
  ON stock_opname_items FOR ALL
  USING (
    get_user_role() = 'back_office'
    AND EXISTS (
      SELECT 1 FROM stock_opname so
      WHERE so.id = stock_opname_items.opname_id
      AND so.branch_id = get_user_branch()
    )
  )
  WITH CHECK (
    get_user_role() = 'back_office'
    AND EXISTS (
      SELECT 1 FROM stock_opname so
      WHERE so.id = stock_opname_items.opname_id
      AND so.branch_id = get_user_branch()
    )
  );

-- ================================================
-- RLS POLICIES: PURCHASE_ORDERS
-- ================================================

-- Owner: Full access to all purchase orders
CREATE POLICY "Owner: Full access to purchase_orders"
  ON purchase_orders FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office: Full access to purchase orders in their branch
CREATE POLICY "Back office: Manage purchase_orders in own branch"
  ON purchase_orders FOR ALL
  USING (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  )
  WITH CHECK (
    get_user_role() = 'back_office'
    AND branch_id = get_user_branch()
  );

-- ================================================
-- RLS POLICIES: PURCHASE_ORDER_ITEMS
-- ================================================

-- Owner: Full access to all purchase order items
CREATE POLICY "Owner: Full access to purchase_order_items"
  ON purchase_order_items FOR ALL
  USING (get_user_role() = 'owner')
  WITH CHECK (get_user_role() = 'owner');

-- Back office: Full access to purchase order items in their branch
CREATE POLICY "Back office: Manage purchase_order_items in own branch"
  ON purchase_order_items FOR ALL
  USING (
    get_user_role() = 'back_office'
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_items.po_id
      AND po.branch_id = get_user_branch()
    )
  )
  WITH CHECK (
    get_user_role() = 'back_office'
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_items.po_id
      AND po.branch_id = get_user_branch()
    )
  );

-- ================================================
-- SEED DATA (Optional)
-- ================================================

-- Insert default owner (you'll need to update the ID after creating auth user)
-- INSERT INTO users (id, email, name, role, is_active)
-- VALUES ('YOUR-AUTH-USER-ID-HERE', 'owner@pekopetshop.com', 'Owner', 'owner', true);

-- Insert sample branch
-- INSERT INTO branches (name, address, phone, is_active)
-- VALUES ('Cabang Pusat', 'Jl. Contoh No. 123', '081234567890', true);

-- ================================================
-- END OF MIGRATION
-- ================================================
