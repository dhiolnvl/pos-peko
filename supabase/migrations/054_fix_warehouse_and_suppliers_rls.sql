-- ================================================
-- MIGRATION 054: FIX WAREHOUSE & SUPPLIERS RLS + SEED INITIAL DATA
-- Fixes RLS policies for staff_pusat on warehouse, warehouse_stock & suppliers tables
-- ================================================

-- 1. FIX SUPPLIERS RLS POLICIES
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_owner_all" ON suppliers;
DROP POLICY IF EXISTS "suppliers_backoffice_all" ON suppliers;
DROP POLICY IF EXISTS "suppliers_cashier_read" ON suppliers;
DROP POLICY IF EXISTS "suppliers_all_policy" ON suppliers;
DROP POLICY IF EXISTS "suppliers_staff_pusat_all" ON suppliers;
DROP POLICY IF EXISTS "suppliers_owner_staff_all" ON suppliers;

CREATE POLICY "suppliers_owner_staff_all" ON suppliers FOR ALL
  USING (get_user_role() IN ('owner', 'staff_pusat'))
  WITH CHECK (get_user_role() IN ('owner', 'staff_pusat'));

CREATE POLICY "suppliers_backoffice_all" ON suppliers FOR ALL
  USING (get_user_role() = 'back_office' AND (branch_id IS NULL OR get_user_branch_id() = branch_id))
  WITH CHECK (get_user_role() = 'back_office' AND (branch_id IS NULL OR get_user_branch_id() = branch_id));

CREATE POLICY "suppliers_cashier_read" ON suppliers FOR SELECT
  USING (get_user_role() = 'cashier' AND (branch_id IS NULL OR get_user_branch_id() = branch_id));

-- 2. FIX WAREHOUSE RLS POLICIES
ALTER TABLE warehouse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouse_owner_staff_all" ON warehouse;
DROP POLICY IF EXISTS "warehouse_staff_read" ON warehouse;
DROP POLICY IF EXISTS "warehouse_all_policy" ON warehouse;

CREATE POLICY "warehouse_owner_staff_all" ON warehouse FOR ALL
  USING (get_user_role() IN ('owner', 'staff_pusat'))
  WITH CHECK (get_user_role() IN ('owner', 'staff_pusat'));

CREATE POLICY "warehouse_staff_read" ON warehouse FOR SELECT
  USING (get_user_role() IN ('back_office', 'cashier'));

-- 3. FIX WAREHOUSE_STOCK RLS POLICIES
ALTER TABLE warehouse_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouse_stock_owner_staff_all" ON warehouse_stock;
DROP POLICY IF EXISTS "warehouse_stock_backoffice_read" ON warehouse_stock;
DROP POLICY IF EXISTS "warehouse_stock_all_policy" ON warehouse_stock;

CREATE POLICY "warehouse_stock_owner_staff_all" ON warehouse_stock FOR ALL
  USING (get_user_role() IN ('owner', 'staff_pusat'))
  WITH CHECK (get_user_role() IN ('owner', 'staff_pusat'));

CREATE POLICY "warehouse_stock_backoffice_read" ON warehouse_stock FOR SELECT
  USING (get_user_role() IN ('back_office', 'cashier'));

-- 4. FIX PURCHASE ORDERS & STOCK TRANSFERS RLS POLICIES
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_orders_staff_pusat_all" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_order_items_staff_pusat_all" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_all" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_order_items_all" ON purchase_order_items;

CREATE POLICY "purchase_orders_all" ON purchase_orders FOR ALL
  USING (get_user_role() IN ('owner', 'staff_pusat'))
  WITH CHECK (get_user_role() IN ('owner', 'staff_pusat'));

CREATE POLICY "purchase_order_items_all" ON purchase_order_items FOR ALL
  USING (get_user_role() IN ('owner', 'staff_pusat'))
  WITH CHECK (get_user_role() IN ('owner', 'staff_pusat'));

DROP POLICY IF EXISTS "stock_transfers_owner_staff_all" ON stock_transfers;
DROP POLICY IF EXISTS "stock_transfers_backoffice_read" ON stock_transfers;
DROP POLICY IF EXISTS "stock_transfers_all" ON stock_transfers;

CREATE POLICY "stock_transfers_all" ON stock_transfers FOR ALL
  USING (get_user_role() IN ('owner', 'staff_pusat', 'back_office', 'cashier'))
  WITH CHECK (get_user_role() IN ('owner', 'staff_pusat', 'back_office', 'cashier'));

DROP POLICY IF EXISTS "stock_transfer_items_owner_staff_all" ON stock_transfer_items;
DROP POLICY IF EXISTS "stock_transfer_items_backoffice_read" ON stock_transfer_items;
DROP POLICY IF EXISTS "stock_transfer_items_all" ON stock_transfer_items;

CREATE POLICY "stock_transfer_items_all" ON stock_transfer_items FOR ALL
  USING (get_user_role() IN ('owner', 'staff_pusat', 'back_office', 'cashier'))
  WITH CHECK (get_user_role() IN ('owner', 'staff_pusat', 'back_office', 'cashier'));

-- 5. ENSURE WAREHOUSE EXISTS & POPULATE WAREHOUSE_STOCK FOR ALL PRODUCTS
INSERT INTO warehouse (id, name, address, is_active)
VALUES ('a0000000-0000-4000-a000-000000000001', 'Gudang Utama Pusat', 'Jl. Ahmad Dahlan No. 12', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO warehouse_stock (warehouse_id, product_id, stock, min_stock)
SELECT
  w.id,
  p.id,
  CASE
    WHEN p.name LIKE '%BOLT%' THEN 240
    WHEN p.name LIKE '%FELIBITE%' THEN 180
    WHEN p.name LIKE '%MISTER PUSS%' THEN 150
    WHEN p.name LIKE '%EXCEL%' THEN 160
    WHEN p.name LIKE '%ORICAT%' THEN 120
    WHEN p.name LIKE '%WHISKAS%' THEN 200
    WHEN p.name LIKE '%PASIR%' THEN 130
    ELSE (45 + (abs(hashtext(p.id::text)) % 110))
  END AS stock,
  15 AS min_stock
FROM warehouse w
CROSS JOIN products p
ON CONFLICT (warehouse_id, product_id) DO NOTHING;

-- 6. SEED INITIAL SUPPLIERS DATA
INSERT INTO suppliers (id, name, phone, address, notes, is_active)
VALUES
  ('b0000000-0000-4000-a000-000000000001', 'PT Central Pet Indonesia (CPI)', '081234567890', 'Jl. Industri Petshop No. 8, Jakarta', 'Supplier Dry Food Bolt, Felibite, Chester', true),
  ('b0000000-0000-4000-a000-000000000002', 'PT Perfect Companion Indonesia', '081198765432', 'Kawasan Industri Jababeka, Cikarang', 'Supplier Me-O, Cat Choize, Cutie Catz', true),
  ('b0000000-0000-4000-a000-000000000003', 'PT Royal Canin Indonesia', '021-55566778', 'Menara BTPN Lt. 22, Mega Kuningan, Jakarta', 'Supplier Premium Royal Canin', true),
  ('b0000000-0000-4000-a000-000000000004', 'CV Animal & Co Supplies', '085711223344', 'Jl. Peternakan Utama No. 45, Bandung', 'Supplier Wet Food Animal & Co, Aksesoris', true),
  ('b0000000-0000-4000-a000-000000000005', 'PT Crocat Pasir Indonesia', '081399887766', 'Jl. Raya Surabaya Malang Km 32', 'Distributor Pasir Gumpal Crocat & Lemiao', true),
  ('b0000000-0000-4000-a000-000000000006', 'CV Peko Medika Pet', '082144556677', 'Jl. Kesehatan Hewan No. 12, Yogyakarta', 'Supplier Obat-obatan, Vitamin & Shampo', true)
ON CONFLICT (id) DO NOTHING;
