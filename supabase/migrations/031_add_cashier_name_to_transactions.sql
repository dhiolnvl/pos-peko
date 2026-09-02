-- Izinkan semua user yang login baca nama user lain (untuk tampil nama kasir di transaksi)
-- Policy lama hanya allow baca diri sendiri (auth.uid() = id), ini yang menyebabkan
-- join users!cashier_id(name) selalu kosong ketika dilihat backoffice/owner.
CREATE POLICY "allow_read_name_authenticated"
  ON users FOR SELECT
  TO authenticated
  USING (true);
