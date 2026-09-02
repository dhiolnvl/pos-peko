-- ================================================
-- 016: Settings table (key-value store)
-- ================================================

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default values
INSERT INTO settings (key, value) VALUES
  ('store_name',       'QasioPeko'),
  ('address',          ''),
  ('phone',            ''),
  ('tax_percentage',   '11'),
  ('receipt_footer',   'Terima kasih atas kunjungan Anda!'),
  ('points_per_rupiah','10000')
ON CONFLICT (key) DO NOTHING;

-- RLS: hanya authenticated user yang bisa baca, hanya owner yang bisa update
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read settings" ON settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "owner write settings" ON settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'
    )
  );
