# Supabase Database Schema

Database schema lengkap untuk aplikasi **PekoPetshop** dengan 3 role: `owner`, `back_office`, dan `cashier`.

## 📋 Daftar Tabel

1. **branches** - Data cabang/toko
2. **users** - Data pengguna dengan role
3. **categories** - Kategori produk
4. **products** - Data produk
5. **transactions** - Transaksi penjualan
6. **transaction_items** - Detail item transaksi
7. **stock_movements** - Riwayat pergerakan stok
8. **stock_opname** - Stock opname header
9. **stock_opname_items** - Detail stock opname
10. **purchase_orders** - Purchase order header
11. **purchase_order_items** - Detail purchase order

## 🚀 Cara Menggunakan

### 1. Setup Supabase Project

1. Login ke [Supabase Dashboard](https://app.supabase.com)
2. Buat project baru atau gunakan project yang sudah ada
3. Salin Project URL dan Anon Key ke file `.env.local`

### 2. Jalankan Migration

Ada 2 cara untuk menjalankan migration:

#### Opsi A: Melalui Supabase Dashboard (Recommended)

1. Buka Supabase Dashboard > SQL Editor
2. Copy seluruh isi file `migrations/001_initial_schema.sql`
3. Paste ke SQL Editor
4. Klik "Run" untuk mengeksekusi

#### Opsi B: Menggunakan Supabase CLI

```bash
# Install Supabase CLI (jika belum)
npm install -g supabase

# Login
supabase login

# Link ke project
supabase link --project-ref YOUR_PROJECT_REF

# Run migration
supabase db push
```

### 3. Verifikasi

Setelah migration berhasil, cek di Supabase Dashboard:

- **Table Editor**: Pastikan semua 11 tabel sudah terbuat
- **Database > Policies**: Pastikan RLS policies sudah aktif
- **Database > Extensions**: Pastikan extension `uuid-ossp` sudah enable

## 🔐 Row Level Security (RLS)

### Owner Role

- **Full access** ke semua tabel di semua cabang
- Bisa CRUD semua data

### Back Office Role

- **SELECT/INSERT/UPDATE** products, categories, stock_movements, stock_opname, purchase_orders di cabang sendiri
- **SELECT** transactions di cabang sendiri
- **Tidak bisa** manage users, branches, atau data cabang lain

### Cashier Role

- **SELECT** products dan categories di cabang sendiri
- **INSERT** transactions, transaction_items, stock_movements (type 'sale') di cabang sendiri
- **SELECT** transactions milik diri sendiri saja
- **Tidak bisa** manage produk, stok, atau laporan

## 📊 Relationship Diagram

```
branches
  └─ users (branch_id)
  └─ categories (branch_id)
  └─ products (branch_id)
       └─ transaction_items (product_id)
       └─ stock_movements (product_id)
  └─ transactions (branch_id)
       └─ transaction_items (transaction_id)
  └─ purchase_orders (branch_id)
       └─ purchase_order_items (po_id)
  └─ stock_opname (branch_id)
       └─ stock_opname_items (opname_id)
```

## 🔧 Setup Awal (Seed Data)

Setelah migration berhasil, jalankan query berikut untuk membuat data awal:

```sql
-- 1. Buat cabang pertama
INSERT INTO branches (id, name, address, phone, is_active)
VALUES (
  uuid_generate_v4(),
  'Cabang Pusat',
  'Jl. Contoh No. 123, Jakarta',
  '081234567890',
  true
);

-- 2. Buat user owner (setelah user register via Supabase Auth)
-- Ganti 'YOUR-AUTH-USER-ID' dengan auth.uid() dari user yang sudah register
INSERT INTO users (id, email, name, role, branch_id, is_active)
VALUES (
  'YOUR-AUTH-USER-ID',
  'owner@pekopetshop.com',
  'Owner',
  'owner',
  NULL, -- Owner tidak terikat ke satu cabang
  true
);
```

## 📝 Catatan Penting

### Tentang RLS Policies

RLS policies menggunakan helper functions:
- `get_user_role()` - Mendapatkan role user yang sedang login
- `get_user_branch()` - Mendapatkan branch_id user yang sedang login

Fungsi ini menggunakan `auth.uid()` dari Supabase Auth.

### Tentang UUID

Semua tabel menggunakan UUID sebagai primary key dengan `uuid_generate_v4()`.

### Tentang Timestamps

- `created_at` - Otomatis diisi saat insert
- `updated_at` - Otomatis diupdate via trigger saat update

### Tentang Soft Delete

Tabel tidak menggunakan soft delete. Gunakan:
- `is_active` untuk branches, users, products
- `status` untuk transactions, purchase_orders, stock_opname

## 🔄 Migration Selanjutnya

Untuk menambah migration baru:

1. Buat file baru: `migrations/002_nama_migration.sql`
2. Tulis perubahan schema (ALTER TABLE, CREATE INDEX, dll)
3. Jalankan via Supabase Dashboard atau CLI

## 🛠️ Troubleshooting

### Error: "uuid_generate_v4() does not exist"

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Error: "RLS policy blocks operation"

Pastikan:
1. User sudah ada di tabel `users`
2. User memiliki `role` yang benar
3. User memiliki `branch_id` jika bukan owner

### Error: "Function get_user_role() does not exist"

Pastikan migration sudah dijalankan lengkap, termasuk bagian helper functions.

## 📚 Referensi

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [UUID Extension](https://www.postgresql.org/docs/current/uuid-ossp.html)
