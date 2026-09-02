-- ================================================
-- FIX ALL RLS POLICIES - REMOVE HELPER FUNCTION CALLS
-- ================================================
-- Problem: Policies using get_user_role() and get_user_branch()
-- still cause infinite recursion
-- Solution: Rewrite all policies to NOT use helper functions
-- ================================================

-- ================================================
-- DROP ALL EXISTING POLICIES THAT USE HELPER FUNCTIONS
-- ================================================

-- Branches
DROP POLICY IF EXISTS "Owner: Full access to branches" ON branches;
DROP POLICY IF EXISTS "Staff: Read own branch" ON branches;

-- Categories
DROP POLICY IF EXISTS "Owner: Full access to categories" ON categories;
DROP POLICY IF EXISTS "Back office: Manage categories in own branch" ON categories;
DROP POLICY IF EXISTS "Cashier: Read categories in own branch" ON categories;

-- Products
DROP POLICY IF EXISTS "Owner: Full access to products" ON products;
DROP POLICY IF EXISTS "Back office: Manage products in own branch" ON products;
DROP POLICY IF EXISTS "Cashier: Read products in own branch" ON products;

-- Transactions
DROP POLICY IF EXISTS "Owner: Full access to transactions" ON transactions;
DROP POLICY IF EXISTS "Back office: Read transactions in own branch" ON transactions;
DROP POLICY IF EXISTS "Cashier: Create transactions" ON transactions;
DROP POLICY IF EXISTS "Cashier: Read own transactions" ON transactions;

-- Transaction Items
DROP POLICY IF EXISTS "Owner: Full access to transaction_items" ON transaction_items;
DROP POLICY IF EXISTS "Back office: Read transaction_items in own branch" ON transaction_items;
DROP POLICY IF EXISTS "Cashier: Create transaction_items" ON transaction_items;
DROP POLICY IF EXISTS "Cashier: Read own transaction_items" ON transaction_items;

-- Stock Movements
DROP POLICY IF EXISTS "Owner: Full access to stock_movements" ON stock_movements;
DROP POLICY IF EXISTS "Back office: Manage stock_movements in own branch" ON stock_movements;
DROP POLICY IF EXISTS "Cashier: Create sale movements" ON stock_movements;

-- Stock Opname
DROP POLICY IF EXISTS "Owner: Full access to stock_opname" ON stock_opname;
DROP POLICY IF EXISTS "Back office: Manage stock_opname in own branch" ON stock_opname;

-- Stock Opname Items
DROP POLICY IF EXISTS "Owner: Full access to stock_opname_items" ON stock_opname_items;
DROP POLICY IF EXISTS "Back office: Manage stock_opname_items in own branch" ON stock_opname_items;

-- Purchase Orders
DROP POLICY IF EXISTS "Owner: Full access to purchase_orders" ON purchase_orders;
DROP POLICY IF EXISTS "Back office: Manage purchase_orders in own branch" ON purchase_orders;

-- Purchase Order Items
DROP POLICY IF EXISTS "Owner: Full access to purchase_order_items" ON purchase_order_items;
DROP POLICY IF EXISTS "Back office: Manage purchase_order_items in own branch" ON purchase_order_items;

-- ================================================
-- SIMPLE POLICIES WITHOUT HELPER FUNCTIONS
-- ================================================

-- BRANCHES: Simple policies using direct subquery
CREATE POLICY "branches_owner_all"
  ON branches FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

CREATE POLICY "branches_staff_read_own"
  ON branches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('back_office', 'cashier')
      AND users.branch_id = branches.id
    )
  );

-- CATEGORIES
CREATE POLICY "categories_owner_all"
  ON categories FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

CREATE POLICY "categories_backoffice_all"
  ON categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = categories.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = categories.branch_id
    )
  );

CREATE POLICY "categories_cashier_read"
  ON categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'cashier'
      AND users.branch_id = categories.branch_id
    )
  );

-- PRODUCTS
CREATE POLICY "products_owner_all"
  ON products FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

CREATE POLICY "products_backoffice_all"
  ON products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = products.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = products.branch_id
    )
  );

CREATE POLICY "products_cashier_read"
  ON products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'cashier'
      AND users.branch_id = products.branch_id
    )
  );

-- TRANSACTIONS
CREATE POLICY "transactions_owner_all"
  ON transactions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

CREATE POLICY "transactions_backoffice_read"
  ON transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = transactions.branch_id
    )
  );

CREATE POLICY "transactions_cashier_insert"
  ON transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'cashier'
      AND users.branch_id = transactions.branch_id
      AND transactions.cashier_id = auth.uid()
    )
  );

CREATE POLICY "transactions_cashier_read"
  ON transactions FOR SELECT
  USING (
    transactions.cashier_id = auth.uid()
  );

-- TRANSACTION_ITEMS
CREATE POLICY "transaction_items_owner_all"
  ON transaction_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

CREATE POLICY "transaction_items_backoffice_read"
  ON transaction_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      JOIN transactions ON transactions.id = transaction_items.transaction_id
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = transactions.branch_id
    )
  );

CREATE POLICY "transaction_items_cashier_insert"
  ON transaction_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM transactions
      WHERE transactions.id = transaction_items.transaction_id
      AND transactions.cashier_id = auth.uid()
    )
  );

CREATE POLICY "transaction_items_cashier_read"
  ON transaction_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM transactions
      WHERE transactions.id = transaction_items.transaction_id
      AND transactions.cashier_id = auth.uid()
    )
  );

-- STOCK_MOVEMENTS
CREATE POLICY "stock_movements_owner_all"
  ON stock_movements FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

CREATE POLICY "stock_movements_backoffice_all"
  ON stock_movements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = stock_movements.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = stock_movements.branch_id
    )
  );

CREATE POLICY "stock_movements_cashier_insert_sale"
  ON stock_movements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'cashier'
      AND users.branch_id = stock_movements.branch_id
      AND stock_movements.type = 'sale'
      AND stock_movements.created_by = auth.uid()
    )
  );

-- STOCK_OPNAME
CREATE POLICY "stock_opname_owner_all"
  ON stock_opname FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

CREATE POLICY "stock_opname_backoffice_all"
  ON stock_opname FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = stock_opname.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = stock_opname.branch_id
    )
  );

-- STOCK_OPNAME_ITEMS
CREATE POLICY "stock_opname_items_owner_all"
  ON stock_opname_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

CREATE POLICY "stock_opname_items_backoffice_all"
  ON stock_opname_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      JOIN stock_opname ON stock_opname.id = stock_opname_items.opname_id
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = stock_opname.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      JOIN stock_opname ON stock_opname.id = stock_opname_items.opname_id
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = stock_opname.branch_id
    )
  );

-- PURCHASE_ORDERS
CREATE POLICY "purchase_orders_owner_all"
  ON purchase_orders FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

CREATE POLICY "purchase_orders_backoffice_all"
  ON purchase_orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = purchase_orders.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = purchase_orders.branch_id
    )
  );

-- PURCHASE_ORDER_ITEMS
CREATE POLICY "purchase_order_items_owner_all"
  ON purchase_order_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

CREATE POLICY "purchase_order_items_backoffice_all"
  ON purchase_order_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      JOIN purchase_orders ON purchase_orders.id = purchase_order_items.po_id
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = purchase_orders.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      JOIN purchase_orders ON purchase_orders.id = purchase_order_items.po_id
      WHERE users.id = auth.uid()
      AND users.role = 'back_office'
      AND users.branch_id = purchase_orders.branch_id
    )
  );

-- ================================================
-- COMMENTS
-- ================================================
COMMENT ON POLICY "branches_owner_all" ON branches IS
'Owner has full access to all branches. Uses direct subquery instead of helper function to avoid recursion.';

COMMENT ON POLICY "allow_read_own_user" ON users IS
'Users can read their own record. This is the ONLY policy on users table to prevent recursion.';

-- ================================================
-- END OF MIGRATION
-- ================================================
