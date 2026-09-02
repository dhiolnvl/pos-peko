import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { TabletCenteredView } from '@/components/TabletCenteredView';

interface ChangeItem { type: 'new' | 'fix' | 'improve'; text: string; }
interface Release { version: string; date: string; items: ChangeItem[]; }

const CHANGELOG: Release[] = [
  {
    version: '1.11.0',
    date: '30 Juni 2026',
    items: [
      { type: 'fix', text: 'Tambah user baru: error "only owner can create users" — sekarang bisa membuat akun Staff Cabang/Kasir' },
      { type: 'fix', text: 'Manajemen User: role Staff Pusat sekarang tampil dengan benar di daftar dan filter (sebelumnya error karena role belum terdaftar)' },
      { type: 'fix', text: 'Menu Member: error "Could not find a relationship between members and branches" saat dibuka — relasi database diperbaiki' },
      { type: 'fix', text: 'List Produk: total stok (cabang + gudang) salah hitung untuk produk dengan banyak cabang — sekarang akurat' },
      { type: 'fix', text: 'Form Produk: input Harga Promo macet di 3 digit untuk nominal besar — sekarang bisa diisi nominal berapa pun' },
      { type: 'new', text: 'Stok Cabang: tambah filter (Semua/Habis/Menipis) dan sort (Stok Terbanyak, Stok Tersedikit, Nama A-Z)' },
      { type: 'new', text: 'Laporan Presensi: tombol export PDF — tabel tanggal, nama, jam masuk/pulang, dan total jam kerja' },
    ],
  },
  {
    version: '1.10.0',
    date: '26 Juni 2026',
    items: [
      { type: 'new', text: 'Detail produk: tap produk → halaman detail berisi stok per gudang & cabang, riwayat transaksi, dan alur stok (PO masuk / distribusi / terjual) — semua bisa diklik ke halaman detailnya' },
      { type: 'new', text: 'Cetak label produk: pilih produk dari daftar, atur jumlah label, pilih mode Barcode atau QR Code, cetak ke thermal printer' },
      { type: 'new', text: 'Laporan Per Produk: qty terjual, rata-rata harga, HPP, dan laba kotor per produk — filter cabang & periode, export PDF landscape dengan logo toko' },
      { type: 'new', text: 'Laporan Presensi karyawan: jam masuk/keluar, durasi kerja, filter cabang & periode' },
      { type: 'new', text: 'Halaman Stok Gudang: tab Semua / Hampir Habis / Habis untuk monitoring stok dengan cepat' },
      { type: 'new', text: 'Pengaturan Printer Struk kini berfungsi penuh — pairing Bluetooth, test print, dan pilih lebar kertas' },
      { type: 'new', text: 'Periode promo per produk: atur harga promo + tanggal mulai dan selesai di form edit produk' },
      { type: 'new', text: 'Harga beli (HPP) otomatis update ke Weighted Average Cost (WAC) saat PO baru diterima — memperhitungkan sisa stok lama' },
      { type: 'improve', text: 'Purchase Order: semua produk muncul di modal pilih produk (sebelumnya hanya halaman pertama karena pagination)' },
      { type: 'improve', text: 'List produk: stok yang ditampilkan adalah total gabungan stok semua cabang + stok gudang' },
      { type: 'fix', text: 'Form edit produk: buka produk berbeda tidak memperbarui data form — kini fetch langsung dari database' },
      { type: 'fix', text: 'Laporan laba kotor selalu 0 — diperbaiki dengan query HPP terpisah yang tidak mengandalkan nested join Supabase' },
      { type: 'fix', text: 'Reset data gagal karena urutan hapus tabel yang salah (stock_requests sebelum stock_transfers)' },
      { type: 'fix', text: 'Reset data: produk di cabang tidak lagi terhapus — stok direset ke 0, daftar produk per cabang tetap ada' },
    ],
  },
  {
    version: '1.10.0',
    date: '14 Juni 2026',
    items: [
      { type: 'new', text: 'Tambah produk: scan barcode yang sudah terdaftar langsung membuka modal edit produk — mencegah input ganda' },
      { type: 'new', text: 'Tambah produk: form 3-step (harga → stok → detail) berlaku di semua role termasuk Staff Pusat' },
      { type: 'fix', text: 'Form edit produk: semua field kosong saat dibuka langsung — field kini diisi ulang setelah data produk selesai dimuat dari server' },
    ],
  },
];

const TYPE_CONFIG = {
  new:     { label: 'Baru',    bg: '#EEF8FA', color: '#347385' },
  fix:     { label: 'Fix',     bg: '#FEF2F2', color: '#DC2626' },
  improve: { label: 'Improve', bg: '#F0FDF4', color: '#16A34A' },
};

export default function ChangelogScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container]}>
      <OwnerPageHeader title="Riwayat Pembaruan" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <TabletCenteredView>
          {CHANGELOG.map((release) => (
            <View key={release.version + release.date} style={styles.release}>
              <View style={styles.releaseHeader}>
                <View style={styles.versionBadge}>
                  <Text style={styles.versionText}>{release.version}</Text>
                </View>
                <Text style={styles.releaseDate}>{release.date}</Text>
              </View>
              {release.items.map((item, i) => {
                const cfg = TYPE_CONFIG[item.type];
                return (
                  <View key={i} style={styles.item}>
                    <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.typeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    <Text style={styles.itemText}>{item.text}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </TabletCenteredView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  release: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16,
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  releaseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  versionBadge: { backgroundColor: '#347385', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  versionText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  releaseDate: { fontSize: 13, color: '#6B7280' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  typeBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 1, flexShrink: 0 },
  typeText: { fontSize: 10, fontWeight: '700' },
  itemText: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 19 },
});
