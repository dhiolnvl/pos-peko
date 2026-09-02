-- ================================================
-- MIGRATION 053: VARIED PRODUCT STOCKS ACROSS BRANCHES AND WAREHOUSE
-- Variasi jumlah stok produk per cabang dan gudang (bukan lagi 999 seragam)
-- ================================================

-- 1. Update stok di branch_products (Stok Toko Cabang)
UPDATE branch_products bp
SET
  stock = CASE
    WHEN p.barcode = '8993374326970' OR p.name LIKE '%BOLT IKAN%' THEN 85
    WHEN p.barcode = '8994409101401' OR p.name LIKE '%FELIBITE IKAN%' THEN 68
    WHEN p.name LIKE '%BOLT SALMON%' THEN 62
    WHEN p.name LIKE '%MISTER PUSS%' THEN 54
    WHEN p.name LIKE '%EXCEL%' THEN 48
    WHEN p.name LIKE '%ORICAT%' THEN 42
    WHEN p.name LIKE '%WHISKAS POUCH%' THEN 75
    WHEN p.name LIKE '%LIFE CAT%' THEN 50
    WHEN p.name LIKE '%PASIR CROCAT 5L%' THEN 38
    WHEN p.name LIKE '%PASIR CROCAT 10L%' THEN 24
    WHEN p.name LIKE '%PASIR CROCAT 25L%' THEN 15
    WHEN p.name LIKE '%CAT HOTEL%' THEN 99
    ELSE (12 + (abs(hashtext(p.id::text || bp.branch_id::text)) % 45))
  END,
  min_stock = 5
FROM products p
WHERE bp.product_id = p.id;

-- 2. Update stok di warehouse_stock (Stok Gudang Pusat) jika tabel tersedia
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouse_stock') THEN
    UPDATE warehouse_stock ws
    SET
      stock = CASE
        WHEN p.name LIKE '%BOLT%' THEN 240
        WHEN p.name LIKE '%FELIBITE%' THEN 180
        WHEN p.name LIKE '%MISTER PUSS%' THEN 150
        WHEN p.name LIKE '%EXCEL%' THEN 160
        WHEN p.name LIKE '%ORICAT%' THEN 120
        WHEN p.name LIKE '%WHISKAS%' THEN 200
        WHEN p.name LIKE '%PASIR%' THEN 130
        ELSE (45 + (abs(hashtext(p.id::text || ws.warehouse_id::text)) % 110))
      END,
      min_stock = 15
    FROM products p
    WHERE ws.product_id = p.id;
  END IF;
END $$;
