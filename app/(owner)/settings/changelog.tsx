import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { TabletCenteredView } from '@/components/TabletCenteredView';

interface ChangeItem {
  type: 'new' | 'fix' | 'improve';
  text: string;
}

interface Release {
  version: string;
  date: string;
  items: ChangeItem[];
}

const CHANGELOG: Release[] = [
  {
    version: '1.11.0',
    date: '30 Juni 2026',
    items: [
      { type: 'fix', text: '[Owner] Manajemen Cabang: error "column reference id is ambiguous" saat membuka halaman — diperbaiki pada fungsi database get_all_branches_owner' },
      { type: 'fix', text: '[Owner] Manajemen User: role Staff Pusat sekarang tampil dengan benar di daftar dan filter (sebelumnya error karena role belum terdaftar)' },
      { type: 'fix', text: '[Owner] Manajemen Member & Kasir: error "Could not find a relationship between members and branches" saat buka menu Member — relasi database diperbaiki' },
      { type: 'fix', text: '[Owner] List Produk: total stok (cabang + gudang) salah hitung untuk produk dengan banyak cabang — sekarang akurat' },
      { type: 'fix', text: '[Owner] Form Produk: input Harga Promo macet di 3 digit untuk nominal besar — sekarang bisa diisi nominal berapa pun' },
      { type: 'new', text: '[Owner] Laporan Presensi: tombol export PDF — tabel tanggal, nama, jam masuk/pulang, dan total jam kerja' },
      { type: 'fix', text: '[Staff Pusat] Tambah user baru: error "only owner can create users" — sekarang Staff Pusat bisa membuat akun Staff Cabang/Kasir' },
    ],
  },
  {
    version: '1.10.0',
    date: '26 Juni 2026',
    items: [
      // Kasir
      { type: 'new', text: '[Kasir] Ongkos kirim: tombol ikon sepeda di header keranjang untuk input ongkir — tampil di ringkasan total dan nota' },
      { type: 'new', text: '[Kasir] Metode pembayaran Campuran (split): tunai + QRIS/Transfer dalam satu transaksi' },
      { type: 'new', text: '[Kasir] Bagikan struk sebagai gambar ke WhatsApp — tersedia di halaman sukses dan detail transaksi' },
      { type: 'new', text: '[Kasir] Nota gambar memuat QR Code QRIS otomatis jika metode bayar QRIS atau Campuran-QRIS' },
      { type: 'new', text: '[Kasir] Pilih member tetap bisa dilakukan saat offline — data member di-cache lokal otomatis' },
      { type: 'improve', text: '[Kasir] Tampilan pembayaran tablet landscape: 2 kolom (detail kiri, numpad kanan) untuk semua metode termasuk Transfer, QRIS, Campuran' },
      { type: 'improve', text: '[Kasir] Numpad pembayaran mobile: tombol lebih rapi dan full width' },
      { type: 'fix', text: '[Kasir] Ringkasan shift: penjualan Campuran dan Delivery kini dihitung benar (sebelumnya tidak terhitung)' },
      { type: 'fix', text: '[Kasir] Uang tunai di kasir saat tutup shift terisi otomatis (modal awal + total tunai)' },
      // Staff Pusat
      { type: 'new', text: '[Staff Pusat] Detail produk: tap produk → halaman detail berisi stok per cabang/gudang, riwayat transaksi, dan alur stok (PO/distribusi/terjual)' },
      { type: 'new', text: '[Staff Pusat] Cetak label produk: pilih produk, atur jumlah, cetak barcode/QR ke thermal printer' },
      { type: 'new', text: '[Staff Pusat] Laporan Per Produk: qty terjual, HPP, laba kotor per produk dengan filter cabang & periode, export PDF landscape' },
      { type: 'new', text: '[Staff Pusat] Laporan Presensi: rekap jam masuk/keluar karyawan dengan filter cabang & periode' },
      { type: 'new', text: '[Staff Pusat] Halaman stok gudang: tab Semua / Hampir Habis / Habis' },
      { type: 'new', text: '[Staff Pusat] Pengaturan Printer Struk kini berfungsi penuh (sama dengan kasir)' },
      { type: 'new', text: '[Staff Pusat] Periode promo per produk: set harga promo + tanggal mulai-selesai di form produk' },
      { type: 'improve', text: '[Staff Pusat] Purchase Order: semua 767 produk muncul di modal pilih produk (sebelumnya hanya halaman pertama)' },
      { type: 'improve', text: '[Staff Pusat] List produk: stok yang ditampilkan adalah total stok cabang + gudang' },
      { type: 'fix', text: '[Staff Pusat] Form edit produk: data produk yang dibuka tidak berubah saat pindah ke produk lain — kini fetch langsung dari DB' },
      // Owner
      { type: 'new', text: '[Owner] Detail produk: sama seperti Staff Pusat — stok per cabang/gudang, transaksi, alur stok' },
      { type: 'new', text: '[Owner] Laporan Per Produk: qty, HPP, laba kotor per produk dengan export PDF landscape + logo toko' },
      { type: 'new', text: '[Owner] Laporan Presensi karyawan' },
      // Staff Cabang (Backoffice)
      { type: 'new', text: '[Staff Cabang] Dashboard: notifikasi otomatis jika ada distribusi stok masuk yang belum dikonfirmasi' },
      { type: 'new', text: '[Staff Cabang] Laporan Per Produk: qty, HPP, laba kotor per produk' },
      // Umum
      { type: 'new', text: '[Umum] HPP tersimpan di tiap item transaksi — laporan laba kotor akurat meski harga beli berubah setelah transaksi' },
      { type: 'new', text: '[Umum] Harga beli otomatis update ke Weighted Average Cost (WAC) saat PO baru diterima' },
      { type: 'new', text: '[Umum] Reset data: produk di cabang tidak terhapus, stok direset ke 0' },
      { type: 'fix', text: '[Umum] Reset data gagal akibat FK constraint stock_requests → stock_transfers — urutan hapus diperbaiki' },
      { type: 'fix', text: '[Umum] Laporan laba kotor sebelumnya selalu 0 — diperbaiki ke query terpisah yang tidak mengandalkan nested join' },
    ],
  },
  {
    version: '1.10.0',
    date: '14 Juni 2026',
    items: [
      { type: 'new', text: 'Tambah produk: scan barcode yang sudah terdaftar langsung membuka modal edit produk — mencegah input ganda' },
      { type: 'new', text: 'Tambah produk: nama dari OpenFoodFacts yang terlalu pendek kini menawarkan pilihan nama alternatif (brand + nama + ukuran)' },
      { type: 'new', text: 'Tambah produk: form 3-step (harga → stok → detail) kini berlaku di owner, termasuk stok per cabang via numpad' },
      { type: 'new', text: 'Kasir: scan barcode yang tidak ditemukan memunculkan opsi tambah produk baru langsung dari halaman scan' },
      { type: 'new', text: 'Kasir: form tambah produk 3-step (harga → stok → detail) dengan barcode otomatis terisi dari hasil scan' },
      { type: 'improve', text: 'Tambah produk: data produk sudah ada (allProducts) dimuat otomatis saat form dibuka untuk deteksi duplikat yang akurat' },
      { type: 'fix', text: 'Scanner kasir: error "Property products doesn\'t exist" saat buka halaman scan — dependency useCallback salah mereferensikan variabel lama' },
      { type: 'fix', text: 'Form edit produk: semua field kosong saat dibuka langsung — field kini diisi ulang setelah data produk selesai dimuat dari server' },
      { type: 'fix', text: 'Printer Bluetooth: izin selalu gagal meski Bluetooth aktif — permission BLUETOOTH_SCAN dan BLUETOOTH_CONNECT untuk Android 12+ kini didaftarkan ke manifest dengan atribut yang benar via config plugin' },
    ],
  },
  {
    version: '1.10.0',
    date: '2 Juni 2026',
    items: [
      { type: 'new', text: 'Offline: kasir bisa buka shift meski tanpa koneksi internet — shift tersimpan lokal dan otomatis tersinkron ke server saat koneksi kembali' },
      { type: 'new', text: 'Offline: transaksi pending kini tampil di riwayat kasir dengan status Pending, otomatis hilang setelah tersync' },
      { type: 'improve', text: 'Tap produk ke keranjang jauh lebih cepat — satuan produk disimpan di memori, tidak perlu baca storage setiap kali tap' },
      { type: 'fix', text: 'Offline: transaksi yang sudah disync tidak muncul di riwayat — halaman riwayat kini otomatis reload setelah sync berhasil' },
      { type: 'fix', text: 'Offline: transaksi pending tidak masuk ke Supabase saat disync — ID transaksi offline tidak valid sebagai UUID, sekarang dibuat UUID terpisah saat antri' },
      { type: 'fix', text: 'Offline: badge "1 pending" tidak bisa diklik — sekarang bisa diketuk untuk manual sync, dan muncul pesan jika masih offline' },
      { type: 'fix', text: 'Offline: transaksi pending tidak tersync otomatis saat app pertama dibuka dalam kondisi online — sekarang langsung sync tanpa perlu toggle koneksi' },
      { type: 'fix', text: 'Offline: grid produk mandek di halaman 1 saat offline — load more kini tetap berfungsi menggunakan data cache lokal' },
      { type: 'fix', text: 'Offline: form buka shift muncul padahal shift masih aktif saat buka app tanpa internet — shift aktif kini di-cache lokal agar tetap dikenali saat offline' },
      { type: 'fix', text: 'Nama kasir tidak tampil di halaman Detail Transaksi — diperbaiki dengan menambah RLS policy agar semua user terautentikasi bisa membaca nama user lain' },
      { type: 'fix', text: 'Grid produk kasir tidak direset saat buka halaman — pencarian, filter kategori, dan barcode match kini dibersihkan setiap kali halaman aktif' },
      { type: 'fix', text: 'Keranjang belanja tidak terhapus saat ganti akun — cart, diskon, catatan, dan member kini direset otomatis setiap logout' },
      { type: 'fix', text: 'Filter pencarian produk tidak terhapus saat ganti akun — search query dan kategori di store direset saat logout' },
    ],
  },
  {
    version: '1.7.0',
    date: '18 Mei 2026',
    items: [
      { type: 'new', text: 'Halaman Profil di tab navigasi owner dan backoffice: tampilkan nama, email, role, dan cabang' },
      { type: 'new', text: 'Pengaturan owner dipecah menjadi halaman tersendiri per topik (Informasi Toko, Pajak, Struk, Poin, Printer)' },
      { type: 'new', text: 'Pengaturan backoffice: halaman Profil dengan menu Pengaturan Printer dan tombol Keluar' },
      { type: 'new', text: 'Cetak label produk: opsi QR Code selain Barcode, preview QR tampil sesuai mode yang dipilih' },
      { type: 'new', text: 'Kasir: keyboard langsung muncul saat buka halaman, scan barcode hardware bisa langsung dipakai tanpa tap input dulu' },
      { type: 'fix', text: 'Stock opname: progress scan selalu menampilkan 0/0 karena query total produk masih memakai kolom branch_id yang sudah dihapus' },
      { type: 'fix', text: 'Stock opname: tab Belum Dicek tidak memuat produk karena query branch_products tidak dipakai' },
      { type: 'fix', text: 'Stock opname: checked_count dan discrepancy_count selalu 0 di daftar sesi karena salah penggunaan count: exact di Supabase' },
    ],
  },
  {
    version: '1.6.0',
    date: '17 Mei 2026',
    items: [
      { type: 'new', text: 'Sort produk di list owner, backoffice, dan kasir (Nama, Harga, Stok Terendah, Stok Tertinggi, Terbaru)' },
      { type: 'new', text: 'Load more di list produk owner dan backoffice' },
      { type: 'new', text: 'Manajemen stok: load more, sort, dan filter per kategori dalam satu baris chips' },
      { type: 'new', text: 'Kasir: ketik barcode langsung di search bar, produk otomatis masuk keranjang tanpa buka halaman scan' },
      { type: 'new', text: 'Riwayat Pembaruan dapat diakses dari Pengaturan Toko' },
      { type: 'improve', text: 'Placeholder search bar kasir diubah menjadi "Cari nama / ketik barcode..." agar lebih jelas' },
      { type: 'improve', text: 'Tombol sort highlight saat urutan bukan default' },
    ],
  },
  {
    version: '1.5.0',
    date: '16 Mei 2026',
    items: [
      { type: 'new', text: 'Laporan perbandingan antar cabang (omzet, transaksi, produk terlaris per cabang)' },
      { type: 'new', text: 'Reset password user langsung dari manajemen pengguna' },
      { type: 'improve', text: 'Dashboard owner: tampilan ringkasan omzet, transaksi, dan stok lebih informatif' },
      { type: 'improve', text: 'Dashboard backoffice: statistik cabang diperbarui' },
      { type: 'improve', text: 'Header kasir diperbarui' },
    ],
  },
  {
    version: '1.4.0',
    date: '17 Mei 2026',
    items: [
      { type: 'new', text: 'Semua produk bersifat global — stok dikelola per cabang lewat branch_products' },
      { type: 'new', text: 'Cabang baru otomatis mendaftarkan semua produk dengan stok awal 0' },
      { type: 'improve', text: 'Edit produk: field stok dihapus dari form edit, hanya muncul saat tambah produk baru' },
      { type: 'improve', text: 'List produk backoffice hanya menampilkan produk yang terdaftar di cabang tersebut' },
      { type: 'improve', text: 'Card produk owner menampilkan total stok semua cabang, backoffice menampilkan stok cabang sendiri' },
      { type: 'fix', text: 'Card produk tidak lagi menampilkan "Tanpa Kategori" padahal kategori sudah diisi' },
      { type: 'fix', text: 'Perbaikan RLS policy produk dan kategori setelah penghapusan kolom branch_id' },
    ],
  },
  {
    version: '1.3.0',
    date: '14 Mei 2026',
    items: [
      { type: 'new', text: 'Void transaksi sekarang mengembalikan stok ke branch_products cabang yang bersangkutan' },
      { type: 'new', text: 'Thermal printer: perbaikan koneksi Bluetooth, izin lokasi ditambahkan untuk Android' },
      { type: 'improve', text: 'Hapus tabel branch_categories — kategori berlaku global untuk semua cabang' },
      { type: 'improve', text: 'Kolom branch_id dihapus dari tabel produk dan kategori, semua produk bersifat global' },
    ],
  },
  {
    version: '1.2.0',
    date: '5 Mei 2026',
    items: [
      { type: 'new', text: 'Thermal printer: cetak struk langsung dari kasir via Bluetooth' },
      { type: 'new', text: 'Scanner HID: dukung scanner barcode eksternal (USB/Bluetooth keyboard mode)' },
      { type: 'improve', text: 'Performa POS diperbaiki, loading produk lebih cepat' },
    ],
  },
];

const TYPE_CONFIG = {
  new: { label: 'Baru', color: '#347385', bg: '#EEF8FA' },
  improve: { label: 'Peningkatan', color: '#D97706', bg: '#FFFBEB' },
  fix: { label: 'Perbaikan', color: '#16A34A', bg: '#F0FDF4' },
};

export default function ChangelogScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <OwnerPageHeader title="Riwayat Pembaruan" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <TabletCenteredView>
          <View style={styles.content}>
            {CHANGELOG.map((release, ri) => (
              <View key={release.version} style={styles.release}>
                <View style={styles.releaseHeader}>
                  <View style={styles.versionBadge}>
                    <Text style={styles.versionText}>v{release.version}</Text>
                  </View>
                  {ri === 0 && (
                    <View style={styles.latestBadge}>
                      <Text style={styles.latestText}>Terbaru</Text>
                    </View>
                  )}
                  <Text style={styles.dateText}>{release.date}</Text>
                </View>

                <View style={styles.items}>
                  {release.items.map((item, ii) => {
                    const cfg = TYPE_CONFIG[item.type];
                    return (
                      <View key={ii} style={styles.item}>
                        <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
                          <Text style={[styles.typeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                        <Text style={styles.itemText}>{item.text}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </TabletCenteredView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16, gap: 16 },

  release: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  releaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  versionBadge: {
    backgroundColor: '#347385',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  versionText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  latestBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  latestText: { fontSize: 11, fontWeight: '700', color: '#16A34A' },
  dateText: { fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' },

  items: { gap: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
    marginTop: 1,
  },
  typeText: { fontSize: 11, fontWeight: '700' },
  itemText: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 20 },
});
