# Dokumentasi Offline Mode — Qasio POS

## Gambaran Umum

Offline mode memungkinkan kasir tetap beroperasi penuh meskipun tidak ada koneksi internet. Data penting disimpan di perangkat, dan transaksi yang dibuat saat offline akan otomatis dikirim ke server begitu koneksi pulih.

---

## Prinsip Dasar

Ada tiga prinsip yang mendasari cara kerja offline mode ini:

**1. Cache First**
Setiap data yang dibutuhkan saat transaksi (produk, kategori, satuan produk, data user, data cabang) disimpan lokal di perangkat setiap kali app berhasil terhubung ke internet. Saat offline, data dibaca dari cache lokal — tidak ada request ke server sama sekali.

**2. Optimistic Transaction**
Saat kasir menekan "Bayar" dalam kondisi offline, transaksi tidak ditolak. App langsung menampilkan layar sukses dan menyimpan data transaksi ke antrian lokal. Kasir bisa langsung lanjut ke transaksi berikutnya.

**3. Background Sync**
Begitu koneksi internet terdeteksi kembali, semua transaksi yang tersimpan di antrian lokal dikirim ke Supabase secara otomatis di background, tanpa perlu aksi dari kasir.

---

## Penyimpanan Lokal

Semua data offline disimpan menggunakan **AsyncStorage** (penyimpanan key-value permanen di perangkat). Data tidak hilang meski app ditutup atau perangkat di-restart.

### Data yang Disimpan dan Storage Key-nya

| Data | Storage Key | Disimpan kapan |
|---|---|---|
| Daftar produk | `offline.products` | Setiap `syncFromSupabase()` berhasil |
| Kategori produk | `offline.categories` | Setiap `syncFromSupabase()` berhasil |
| Satuan produk (units) | `offline.product_units` | Setiap `syncFromSupabase()` berhasil |
| Data user (kasir) | `offline.user` | Setiap login berhasil |
| Data cabang | `offline.branch` | Setiap login berhasil |
| Waktu cache terakhir | `offline.cached_at` | Setiap produk disimpan |
| Antrian order offline | `offline.order_queue` | Setiap transaksi gagal dikirim |

---

## Alur Detail Per Fitur

### 1. Login Offline

Saat app dibuka tanpa internet:

```
App start
  └── supabase.auth.getSession() → gagal / tidak ada session
        └── cek offlineCache.getUser() dan offlineCache.getBranch()
              ├── Ada data cached → set isOfflineMode = true, masuk app
              └── Tidak ada data → tampilkan halaman login (harus online dulu)
```

Jika session ada tapi fetch profil gagal (koneksi putus di tengah):

```
App start
  └── supabase.auth.getSession() → berhasil (token masih tersimpan)
        └── getUserProfile() → gagal (network error)
              └── fallback ke offlineCache.getUser() + offlineCache.getBranch()
                    └── isOfflineMode = true, masuk app dengan data cached
```

**Syarat bisa login offline:** kasir harus pernah login online minimal sekali sebelumnya dari perangkat yang sama. Saat login online berhasil, `offlineCache.saveSession(user, branch)` dipanggil otomatis.

---

### 2. Produk dan Kategori Offline

Saat `syncFromSupabase()` dipanggil (online):

```
syncFromSupabase()
  ├── loadCategories() → simpan ke offline.categories
  ├── loadProducts({ reset: true }) → simpan ke offline.products
  └── _prefetchAllUnits() → 1 query ambil semua product_units → simpan ke offline.product_units
```

Saat `loadProducts()` dipanggil tapi network error:

```
loadProducts()
  └── supabase.rpc('get_products_by_branch') → gagal
        └── offlineCache.getProducts() → load dari AsyncStorage
              └── tampilkan produk dari cache (filter, sort tetap berfungsi)
```

---

### 3. Add to Cart Offline (Grid & Barcode)

Ini adalah bagian yang paling sering dipanggil. Sebelumnya lambat karena setiap klik produk langsung fetch `product_units` ke Supabase.

**Alur baru (setelah fix):**

```
handleAddToCart(product)
  └── fetchProductUnits(product.id)
        └── offlineCache.getAllProductUnits()
              ├── Cache ada → return langsung dari AsyncStorage (< 5ms)
              └── Cache kosong → fetch Supabase → simpan cache → return
```

Tidak ada network request saat add to cart — baik online maupun offline. Data units sudah di-prefetch semua saat `syncFromSupabase`.

---

### 4. Transaksi Offline

```
handlePaymentConfirm()
  └── processTransaction(input)
        ├── supabase.rpc('process_transaction') → berhasil → return hasil normal
        └── supabase.rpc('process_transaction') → gagal (network error)
              └── offlineQueue.enqueue(input)
                    ├── Generate localId: "offline_xxxxxxxx-..."
                    ├── Generate invoice: "OFF-20260601-XXXXXX"
                    ├── Simpan ke AsyncStorage key: offline.order_queue
                    └── Return hasil dengan isOffline: true
```

Struktur data satu order di antrian:

```json
{
  "localId": "offline_a1b2c3d4-...",
  "input": {
    "cart": [...],
    "discount": { "type": "nominal", "value": 0 },
    "paymentMethod": "cash",
    "total": 150000,
    ...
  },
  "queuedAt": "2026-06-01T10:30:00.000Z",
  "retries": 0
}
```

---

### 5. Sinkronisasi Otomatis (Flush Queue)

Di-handle oleh `useOfflineSync` hook yang dipasang di `CashierHeader`.

```
useOfflineSync
  └── useNetworkStatus (polling setiap 5 detik)
        └── isOnline berubah: false → true
              └── flushQueue()
                    └── untuk setiap order di antrian:
                          ├── supabase.rpc('process_transaction', order.input)
                          │     ├── Berhasil → offlineQueue.remove(localId)
                          │     └── Gagal → offlineQueue.incrementRetry(localId)
                          └── Setelah semua diproses → update pendingCount
```

**Batas retry:** maksimal 3 kali. Order yang sudah retry 3x akan dihapus dari antrian (dianggap gagal permanen, misal karena data tidak valid).

---

## Indikator di UI

### Header Kasir (CashierHeader)

| Kondisi | Tampilan |
|---|---|
| Online, tidak ada pending | Normal (tidak ada badge) |
| Offline | Badge merah "Offline" |
| Ada order pending di antrian | Badge oranye "X pending" |
| Sedang sync | Badge oranye "Sync..." |

### Layar Sukses Transaksi

Jika transaksi disimpan offline (bukan langsung ke server), muncul banner kuning:

> "Mode offline — transaksi tersimpan dan akan dikirim saat koneksi pulih"

---

## Batasan Offline Mode

1. **Stok tidak update real-time.** Saat offline, stok yang ditampilkan adalah stok terakhir saat sync. Jika ada kasir lain di cabang yang sama yang juga bertransaksi, stok di perangkat ini tidak tahu. Validasi stok final tetap dilakukan di server saat order di-flush.

2. **Poin member tidak dihitung.** Order offline tidak menghitung atau menambah poin member. Field `pointsEarned` di-set 0 saat offline.

3. **Nomor invoice tidak sequential.** Invoice offline menggunakan format `OFF-YYYYMMDD-XXXXXX`, bukan nomor urut seperti biasa.

4. **Order offline bisa ditolak server.** Jika saat flush ternyata stok sudah habis (karena kasir lain bertransaksi saat kita offline), RPC akan mengembalikan error dan order masuk retry. Setelah 3x retry gagal, order dihapus dari antrian.

5. **Login offline butuh pernah online sebelumnya.** Perangkat yang baru pertama kali dipakai harus login online dulu untuk mengisi cache.

---

## File-file yang Terlibat

```
lib/
  offlineCache.ts      — simpan/baca data lokal (produk, user, branch, units)
  offlineQueue.ts      — kelola antrian order offline

hooks/
  useNetworkStatus.ts  — deteksi koneksi internet (polling 5 detik)
  useOfflineSync.ts    — flush antrian saat koneksi pulih

store/
  authStore.ts         — login offline dari cache, flag isOfflineMode
  productStore.ts      — load produk dari cache, prefetch units

lib/
  transactionProcessor.ts  — queue order ke antrian jika RPC gagal

components/
  CashierHeader.tsx    — tampilkan badge offline dan pending count

app/(cashier)/
  success.tsx          — banner peringatan jika transaksi disimpan offline
```

---

## Diagram Lengkap

```
ONLINE                              OFFLINE
------                              -------

Login
  └── Supabase auth ──────────────► AsyncStorage
                                      offline.user
                                      offline.branch

Sync Produk
  └── Supabase RPC ───────────────► AsyncStorage
                                      offline.products
                                      offline.categories
                                      offline.product_units

                                    App Start (offline)
                                      AsyncStorage ──► Zustand store
                                                        user, branch, produk

                                    Add to Cart
                                      AsyncStorage ──► fetchProductUnits()
                                                        (instant, no network)

                                    Transaksi
                                      Supabase RPC gagal
                                        └──► offlineQueue.enqueue()
                                               AsyncStorage
                                               offline.order_queue

Koneksi Pulih
  useOfflineSync deteksi
    └── flushQueue()
          AsyncStorage ──► Supabase RPC (process_transaction)
          order berhasil ──► hapus dari antrian
          order gagal   ──► increment retry (max 3x)
```
