-- ================================================
-- MIGRATION 048: SEED GROOMING PRODUCTS DATA
-- Inserter data produk Grooming dari Laporan Penjualan
-- ================================================

-- 1. Ensure category 'GROOMING' exists
INSERT INTO categories (id, name, sort_order)
VALUES ('a1b2c3d4-e5f6-7890-abcd-111122223333', 'GROOMING', 1)
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Grooming products from report
INSERT INTO products (id, name, category_id, price, cost_price, unit, barcode, is_active)
VALUES
  ('c1000001-0000-0000-0000-000000000001', 'GROOMING FULL BATH (DEWASA)',   (SELECT id FROM categories WHERE UPPER(name) = 'GROOMING' LIMIT 1), 65000.00, 0.00,     'Paket', 'PAKET8',  true),
  ('c1000001-0000-0000-0000-000000000002', 'GROOMING FULL BATH (KITTEN)',   (SELECT id FROM categories WHERE UPPER(name) = 'GROOMING' LIMIT 1), 60000.00, 0.00,     'Paket', 'PAKET7',  true),
  ('c1000001-0000-0000-0000-000000000003', 'GROOMING SEHAT BASIC (DEWASA)', (SELECT id FROM categories WHERE UPPER(name) = 'GROOMING' LIMIT 1), 50000.00, 20000.00, 'Paket', 'PAKET2',  true),
  ('c1000001-0000-0000-0000-000000000004', 'GROOMING FLEA & TICK (DEWASA)', (SELECT id FROM categories WHERE UPPER(name) = 'GROOMING' LIMIT 1), 60000.00, 0.00,     'Paket', 'PAKET4',  true),
  ('c1000001-0000-0000-0000-000000000005', 'GROOMING SEHAT BASIC (KITTEN)', (SELECT id FROM categories WHERE UPPER(name) = 'GROOMING' LIMIT 1), 45000.00, 19802.00, 'Paket', 'PAKET1',  true),
  ('c1000001-0000-0000-0000-000000000006', 'GROOMING LION CAT',             (SELECT id FROM categories WHERE UPPER(name) = 'GROOMING' LIMIT 1), 100000.00, 0.00,    'Paket', 'LIONCAT', true),
  ('c1000001-0000-0000-0000-000000000007', 'GROOMING FUNGUS (DEWASA)',      (SELECT id FROM categories WHERE UPPER(name) = 'GROOMING' LIMIT 1), 60000.00, 0.00,     'Paket', 'PAKET6',  true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  cost_price = EXCLUDED.cost_price,
  barcode = EXCLUDED.barcode;

-- 3. Populate branch_products for all active branches
INSERT INTO branch_products (branch_id, product_id, stock, min_stock, is_available)
SELECT b.id, p.id, 999, 5, true
FROM branches b
CROSS JOIN products p
WHERE p.barcode IN ('PAKET8', 'PAKET7', 'PAKET2', 'PAKET4', 'PAKET1', 'LIONCAT', 'PAKET6')
ON CONFLICT (branch_id, product_id) DO NOTHING;

-- 4. Populate warehouse_stock if warehouse table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouse') THEN
    INSERT INTO warehouse_stock (warehouse_id, product_id, stock, min_stock)
    SELECT w.id, p.id, 999, 5
    FROM warehouse w
    CROSS JOIN products p
    WHERE p.barcode IN ('PAKET8', 'PAKET7', 'PAKET2', 'PAKET4', 'PAKET1', 'LIONCAT', 'PAKET6')
    ON CONFLICT (warehouse_id, product_id) DO NOTHING;
  END IF;
END $$;
