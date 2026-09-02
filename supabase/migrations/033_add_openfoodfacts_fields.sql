-- Tambah kolom OpenFoodFacts ke tabel products
-- Field dipilih yang relevan untuk POS: merek, kemasan, nutrisi, barcode scanner

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS brands TEXT,
  ADD COLUMN IF NOT EXISTS off_image_url TEXT,
  ADD COLUMN IF NOT EXISTS ingredients_text TEXT,
  ADD COLUMN IF NOT EXISTS product_quantity NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS product_quantity_unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS serving_size TEXT,
  ADD COLUMN IF NOT EXISTS nutriscore_grade VARCHAR(1),
  ADD COLUMN IF NOT EXISTS nova_group SMALLINT,
  ADD COLUMN IF NOT EXISTS allergens TEXT,
  ADD COLUMN IF NOT EXISTS off_categories TEXT,
  ADD COLUMN IF NOT EXISTS energy_kcal_100g NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS carbohydrates_100g NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS fat_100g NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS saturated_fat_100g NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS sugars_100g NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS proteins_100g NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS salt_100g NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS off_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN products.brands IS 'Merek produk dari OpenFoodFacts (misal: Coca-Cola)';
COMMENT ON COLUMN products.off_image_url IS 'URL gambar produk dari OpenFoodFacts (image_front_url)';
COMMENT ON COLUMN products.ingredients_text IS 'Daftar bahan-bahan dari OpenFoodFacts';
COMMENT ON COLUMN products.product_quantity IS 'Ukuran/berat kemasan (misal: 330)';
COMMENT ON COLUMN products.product_quantity_unit IS 'Satuan kemasan (misal: ml, g, cl)';
COMMENT ON COLUMN products.serving_size IS 'Serving size teks (misal: 1 Can (330 ml))';
COMMENT ON COLUMN products.nutriscore_grade IS 'Nilai Nutri-Score: a, b, c, d, atau e';
COMMENT ON COLUMN products.nova_group IS 'NOVA food processing group: 1-4 (4 = ultra-processed)';
COMMENT ON COLUMN products.allergens IS 'Daftar alergen dari OpenFoodFacts';
COMMENT ON COLUMN products.off_categories IS 'Kategori dari OpenFoodFacts';
COMMENT ON COLUMN products.energy_kcal_100g IS 'Energi per 100g/ml dalam kkal';
COMMENT ON COLUMN products.carbohydrates_100g IS 'Total karbohidrat per 100g/ml dalam gram';
COMMENT ON COLUMN products.fat_100g IS 'Total lemak per 100g/ml dalam gram';
COMMENT ON COLUMN products.saturated_fat_100g IS 'Lemak jenuh per 100g/ml dalam gram';
COMMENT ON COLUMN products.sugars_100g IS 'Total gula per 100g/ml dalam gram';
COMMENT ON COLUMN products.proteins_100g IS 'Protein per 100g/ml dalam gram';
COMMENT ON COLUMN products.salt_100g IS 'Garam per 100g/ml dalam gram';
COMMENT ON COLUMN products.off_synced_at IS 'Waktu terakhir data disinkronkan dari OpenFoodFacts';
