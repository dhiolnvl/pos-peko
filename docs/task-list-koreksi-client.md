# Task List Koreksi Client

Tanggal: 2026-06-25

---

## Status Legend
- [ ] Belum dikerjakan
- [~] Sebagian / perlu revisi
- [x] Selesai

---

## 1. Restrukturisasi Role & Sistem User

### 1a. Ganti Role: Owner -> Pusat, Owner Baru Hanya Laporan
- [x] Rename role `owner` menjadi `pusat` di DB (tabel `users`, RLS policies, semua query)
- [x] Buat role baru `owner` dengan akses terbatas: hanya halaman Laporan
- [x] Update routing: role `owner` masuk ke folder tersendiri dengan menu minimal
- [x] Update label UI di semua screen yang menyebut "Owner"

---

### 1b. Staff Pusat: Dari Multi-Cabang Jadi Terpusat
- [x] Sistem lama: 1 staff mengatur semua cabang (sudah ada role `staff_pusat`)

---

### 1c. Fitur User Pusat dan Owner Hampir Sama
- [x] Pusat: akses penuh operasional (produk, stok, PO, laporan, manajemen user, dll)
- [x] Owner baru: hanya Laporan (penjualan, stok, presensi, per-produk)

---

## 2. Fitur Kasir

### 2a. Pembayaran Campuran (Setengah Tunai + Setengah Non-Tunai)
- [x] Tambah opsi "Bayar Campuran" di halaman payment
- [x] Input: nominal tunai + metode kedua (Transfer / QRIS), nominal kedua otomatis dihitung
- [x] Validasi: nominal tunai tidak boleh melebihi total
- [x] Struk & history transaksi: tampilkan rincian dua metode pembayaran (Tunai + QRIS/Transfer)
- [x] DB: kolom `split_payment_detail` (JSONB) + constraint `payment_method` ditambah `split` — migration `036`, `039`
- [x] RPC `process_transaction` diupdate untuk terima dan simpan `p_split_payment_detail`
- [x] Halaman sukses tampilkan rincian pembayaran campuran
- [x] Preview QRIS / info rekening di mode campuran (tombol "Lihat QR" / "Rekening" di baris nominal)
- [x] Pengaturan QRIS di owner (upload/scan QR → convert statis ke dinamis) — migration `037`
- [x] Pengaturan Info Transfer di owner (nama bank, no rekening, atas nama) — migration `038`
- [x] Kasir: metode Transfer tampilkan kartu info rekening tujuan

**File terkait:** `app/(cashier)/payment.tsx`, `lib/transactionProcessor.ts`, RPC `process_transaction`

---

### 2b. Pilih Member Saat Offline
- [ ] Saat offline, member picker saat ini tidak bisa dipakai (data tidak tersedia)
- [ ] Solusi: cache daftar member ke AsyncStorage saat online (mirip pola cache produk)
- [ ] Tambah `offlineCache.saveMembers` / `getMembers`
- [ ] Member picker di POS gunakan cache jika offline
- [ ] Poin tetap dihitung lokal, di-sync saat online

**File terkait:** `lib/offlineCache.ts`, `lib/memberQueries.ts`, `app/(cashier)/index.tsx`, `components/MemberPicker.tsx`

---

### 2c. Metode Pembayaran Delivery / Antar Jemput Grooming
- [ ] Tambah metode baru: `delivery` di enum/konstanta payment method
- [ ] Saat pilih Delivery: muncul input ongkir (nominal)
- [ ] Total transaksi = subtotal + ongkir (setelah diskon & pajak)
- [ ] Ongkir tersimpan di transaksi (kolom `delivery_fee` atau di `notes`)
- [ ] Struk menampilkan baris "Ongkir: Rp..."
- [ ] Filter laporan bisa filter by metode delivery

**File terkait:** `app/(cashier)/payment.tsx`, `store/posStore.ts`, `lib/transactionProcessor.ts`

---

### 2d. Fitur Presensi Karyawan (Menu Kasir)
- [x] Tabel `employees` — nama, cabang, PIN 4 digit, jabatan — migration `040`
- [x] Tabel `attendances` — check_in/check_out masing-masing dengan branch_id (bisa beda kasir) — migration `040`
- [x] Staff Pusat → Manajemen → Data Karyawan: tambah/edit/nonaktifkan karyawan + set PIN
- [x] Kasir → tombol "Presensi" di header → tab belum check-in / sudah check-in
- [x] Modal PIN numpad 4 digit, auto-submit, check-in & check-out
- [x] Branch dicatat per event (checkin & checkout bisa di kasir berbeda)

**File terkait:** `app/(cashier)/attendance/index.tsx`, `app/(staff-pusat)/management/employees.tsx`, `lib/attendanceService.ts`

---

## 3. Fitur Struk

### 3a. Cetak Struk di Halaman Detail Shift
- [ ] Tambah tombol "Cetak Ringkasan Shift" di `app/(cashier)/shifts/[id].tsx`
- [ ] Format cetak: nama kasir, cabang, waktu buka/tutup, total transaksi, total penjualan, rincian per metode bayar
- [ ] Gunakan `printReceipt` / `thermalPrinterService` yang sudah ada

**File terkait:** `app/(cashier)/shifts/[id].tsx`, `lib/printerHelper.ts`

---

### 3b. Bagikan Struk ke WhatsApp
- [ ] Tombol "Bagikan ke WA" di halaman sukses transaksi dan detail transaksi
- [ ] Generate teks struk (plain text) atau PDF
- [ ] Gunakan `Linking.openURL('whatsapp://send?text=...')` untuk buka WA langsung
- [ ] Fallback: `Share` API jika WA tidak tersedia

**File terkait:** `app/(cashier)/pos/success.tsx`, `app/(cashier)/history/[id].tsx`

---

## 4. Stok & Distribusi

### 4a. Distribusi Stok: Pusat Kirim ke Cabang (Pusat -, Cabang +)
- [x] Alur distribusi sudah ada (transfer dari `warehouse_stock` ke `branch_products`)
- [x] Saat pusat kirim, `warehouse_stock` berkurang
- [x] Saat cabang konfirmasi terima, `branch_products` bertambah
- [x] UI staff pusat (transfers/new) dan backoffice (incoming-transfer-detail) sudah benar

**File terkait:** `app/(staff-pusat)/transfers/new.tsx`, `app/(backoffice)/stock/incoming-transfer-detail.tsx`

---

## 5. Laporan

### 5a. Laporan Per Produk
- [ ] Halaman baru: laporan penjualan dikelompokkan per produk
- [ ] Kolom: nama produk, total qty terjual, total pendapatan, rata-rata harga jual
- [ ] Filter: rentang tanggal, cabang (untuk pusat/owner)
- [ ] Export PDF

**Tambahkan di:**
- `app/(owner)/reports/` -> `per-product.tsx`
- `app/(staff-pusat)/reports/` -> `per-product.tsx`
- `app/(backoffice)/reports/` -> `per-product.tsx`

---

### 5b. Laporan Presensi
- [ ] Halaman laporan presensi: daftar karyawan, jam masuk/keluar, total jam kerja per hari
- [ ] Filter: tanggal, cabang, nama karyawan
- [ ] Tampilkan status: Hadir / Tidak Hadir / Terlambat (jika ada jam kerja yang dikonfigurasi)
- [ ] Export PDF

**Tambahkan di:**
- `app/(owner)/reports/` -> `attendance.tsx`
- `app/(staff-pusat)/reports/` -> `attendance.tsx`

---

## 6. Promo & Produk

### 6a. Setting Periode Promo Per Produk
- [ ] Di form produk: tambah section "Harga Promo"
- [ ] Field: harga promo, tanggal mulai, tanggal selesai
- [ ] DB: tambah kolom `promo_price`, `promo_start`, `promo_end` di tabel `products`
- [ ] POS: saat tambah ke keranjang, cek apakah produk sedang dalam periode promo — jika ya, gunakan `promo_price`
- [ ] Tampilkan badge "PROMO" di list produk POS jika sedang aktif
- [ ] Harga promo otomatis tidak berlaku setelah `promo_end`

**File terkait:** `app/(owner)/products/form.tsx`, `app/(staff-pusat)/products/form.tsx`, `store/posStore.ts`

---

## Ringkasan Status

| No | Fitur | Status | Prioritas |
|----|-------|--------|-----------|
| 1a | Restrukturisasi role Owner/Pusat | [x] | Tinggi |
| 1b | Staff Pusat multi-cabang | [x] | Medium |
| 1c | Perbedaan menu Owner vs Pusat | [x] | Tinggi |
| 2a | Pembayaran campuran + QRIS dinamis + info transfer | [x] | Tinggi |
| 2b | Pilih member saat offline | [ ] | Medium |
| 2c | Metode Delivery + ongkir | [ ] | Medium |
| 2d | Fitur Presensi karyawan | [x] | Medium |
| 3a | Cetak struk di detail shift | [ ] | Rendah |
| 3b | Bagikan struk ke WA | [ ] | Rendah |
| 4a | Distribusi stok pusat ke cabang | [x] | Tinggi |
| 5a | Laporan per produk | [ ] | Medium |
| 5b | Laporan presensi | [ ] | Medium |
| 6a | Periode promo per produk | [ ] | Rendah |

---

## Catatan Teknis Penting

- **Role rename:** Perlu migrasi DB + update semua RLS policy + update semua `get_user_role()` check. Ini perubahan besar, kerjakan di awal sebelum fitur lain.
- **Split payment:** Perlu diskusi apakah simpan di kolom terpisah di `transactions` atau buat tabel `transaction_payments` (lebih fleksibel untuk 3+ metode di masa depan).
- **Presensi:** Tabel baru, tidak ada dependensi ke fitur lain — bisa dikerjakan paralel.
- **Promo per produk:** Hati-hati dengan cache produk offline — cache harus menyertakan field promo agar berlaku saat offline juga.
