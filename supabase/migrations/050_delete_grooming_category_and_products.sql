-- ================================================
-- MIGRATION 050: DELETE GROOMING CATEGORY AND PRODUCTS
-- Hapus kategori GROOMING dan seluruh produk grooming dari database
-- ================================================

DO $$
DECLARE
  v_cat_id UUID;
BEGIN
  -- Cari ID kategori GROOMING
  SELECT id INTO v_cat_id FROM categories WHERE UPPER(name) = 'GROOMING';

  IF v_cat_id IS NOT NULL THEN
    -- 1. Hapus referensi stok cabang untuk produk grooming
    DELETE FROM branch_products
    WHERE product_id IN (SELECT id FROM products WHERE category_id = v_cat_id OR UPPER(name) LIKE '%GROOMING%');

    -- 2. Hapus referensi stok gudang jika ada
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouse_stock') THEN
      DELETE FROM warehouse_stock
      WHERE product_id IN (SELECT id FROM products WHERE category_id = v_cat_id OR UPPER(name) LIKE '%GROOMING%');
    END IF;

    -- 3. Hapus produk-produk grooming
    DELETE FROM products WHERE category_id = v_cat_id OR UPPER(name) LIKE '%GROOMING%';

    -- 4. Hapus kategori GROOMING
    DELETE FROM categories WHERE id = v_cat_id;
  ELSE
    -- Jika kategori tidak ada, tetap bersihkan produk dengan kata GROOMING
    DELETE FROM branch_products WHERE product_id IN (SELECT id FROM products WHERE UPPER(name) LIKE '%GROOMING%');

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouse_stock') THEN
      DELETE FROM warehouse_stock WHERE product_id IN (SELECT id FROM products WHERE UPPER(name) LIKE '%GROOMING%');
    END IF;

    DELETE FROM products WHERE UPPER(name) LIKE '%GROOMING%';
  END IF;

  -- Hapus juga kategori GROOMING jika ada sisa nama sama
  DELETE FROM categories WHERE UPPER(name) = 'GROOMING';
END $$;
