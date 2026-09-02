/**
 * Cashier Profile
 * Nome, cabang, role, link printer, ganti password, logout.
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ScrollView, Modal, TextInput, ActivityIndicator,
  useWindowDimensions, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { CashierHeader } from '@/components/CashierHeader';
import { APP_ENV } from '@/constants/config';
import { TabletCenteredView } from '@/components/TabletCenteredView';

const APP_VERSION = '1.10.0';

const ENV_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  production:  { label: 'Production',  color: '#16A34A', bg: '#DCFCE7' },
  staging:     { label: 'Staging',     color: '#D97706', bg: '#FEF3C7' },
  development: { label: 'Development', color: '#6366F1', bg: '#EEF2FF' },
};
const envInfo = ENV_CONFIG[APP_ENV] ?? ENV_CONFIG.development;

interface ChangeItem {
  type: 'new' | 'fix' | 'improve';
  text: string;
}

interface ChangelogEntry {
  version: string;
  date: string;
  items: ChangeItem[];
}

const TYPE_CONFIG = {
  new:     { label: 'Baru',        color: '#347385', bg: '#EEF8FA' },
  improve: { label: 'Peningkatan', color: '#D97706', bg: '#FFFBEB' },
  fix:     { label: 'Perbaikan',   color: '#16A34A', bg: '#F0FDF4' },
};

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.10.0',
    date: '26 Juni 2026',
    items: [
      { type: 'new', text: 'Ongkos kirim: tombol ikon sepeda di header keranjang untuk input ongkir — tampil di ringkasan total dan nota struk' },
      { type: 'new', text: 'Metode pembayaran Campuran: bayar sebagian tunai + sisanya QRIS atau Transfer dalam satu transaksi' },
      { type: 'new', text: 'Bagikan struk sebagai gambar ke WhatsApp — tersedia di halaman sukses dan detail transaksi' },
      { type: 'new', text: 'Nota gambar WhatsApp memuat QR Code QRIS otomatis jika metode bayar QRIS atau Campuran-QRIS' },
      { type: 'new', text: 'Pilih member tetap bisa dilakukan saat offline — data member di-cache lokal saat pertama kali picker dibuka' },
      { type: 'new', text: 'Badge promo pada kartu produk saat harga promo sedang aktif, harga coret ditampilkan' },
      { type: 'improve', text: 'Tampilan pembayaran tablet landscape: 2 kolom — detail pembayaran di kiri, numpad di kanan untuk semua metode' },
      { type: 'improve', text: 'Numpad pembayaran mobile portrait: tombol lebih rapi, full width, dan angka centered' },
      { type: 'improve', text: 'Cetak struk di halaman detail shift: tombol print muncul otomatis jika printer terhubung' },
      { type: 'fix', text: 'Ringkasan shift tutup: penjualan metode Campuran dan Delivery kini ikut terhitung (sebelumnya tidak masuk)' },
      { type: 'fix', text: 'Uang tunai di kasir saat tutup shift kini terisi otomatis dengan nilai modal awal + total penjualan tunai' },
    ],
  },
  {
    version: '1.10.0',
    date: '14 Juni 2026',
    items: [
      { type: 'new', text: 'Scan barcode yang tidak ditemukan kini memunculkan opsi tambah produk baru langsung dari halaman scan' },
      { type: 'new', text: 'Form tambah produk 3-step (harga → stok → detail) dengan barcode otomatis terisi dari hasil scan' },
      { type: 'fix', text: 'Error "Property products doesn\'t exist" saat buka halaman scan — dependency useCallback salah mereferensikan variabel lama' },
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

function ChangelogModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={cpStyles.overlay}>
        <View style={[cpStyles.sheet, { maxHeight: '85%' }]}>
          <View style={cpStyles.handle} />
          <View style={clStyles.header}>
            <Text style={cpStyles.title}>Riwayat Pembaruan</Text>
            <View style={clStyles.currentBadge}>
              <Text style={clStyles.currentBadgeText}>v{APP_VERSION}</Text>
            </View>
          </View>
          <View style={[clStyles.envRow, { backgroundColor: envInfo.bg }]}>
            <View style={[clStyles.envDot, { backgroundColor: envInfo.color }]} />
            <Text style={[clStyles.envLabel, { color: envInfo.color }]}>{envInfo.label}</Text>
            <Text style={clStyles.envSub}>· {process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0] ?? '-'}.supabase.co</Text>
          </View>
          <FlatList
            data={CHANGELOG}
            keyExtractor={(item) => `${item.version}-${item.date}`}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <View style={[clStyles.entry, index < CHANGELOG.length - 1 && clStyles.entryBorder]}>
                <View style={clStyles.entryHeader}>
                  <View style={clStyles.versionRow}>
                    <Text style={clStyles.versionText}>v{item.version}</Text>
                    {index === 0 && (
                      <View style={clStyles.latestBadge}>
                        <Text style={clStyles.latestBadgeText}>Terbaru</Text>
                      </View>
                    )}
                    <Text style={clStyles.dateText}>{item.date}</Text>
                  </View>
                </View>
                {item.items.map((ci, i) => {
                  const cfg = TYPE_CONFIG[ci.type];
                  return (
                    <View key={i} style={clStyles.changeRow}>
                      <View style={[clStyles.typeBadge, { backgroundColor: cfg.bg }]}>
                        <Text style={[clStyles.typeText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      <Text style={clStyles.changeText}>{ci.text}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          />
          <TouchableOpacity style={cpStyles.cancelBtn} onPress={onClose}>
            <Text style={{ color: '#6B7280', fontWeight: '600' }}>Tutup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const changePassword = useAuthStore((s) => s.changePassword);
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (next.length < 6) { setError('Password minimal 6 karakter'); return; }
    if (next !== confirm) { setError('Konfirmasi password tidak cocok'); return; }
    setLoading(true);
    setError('');
    try {
      await changePassword(next);
      Alert.alert('Berhasil', 'Password berhasil diubah.', [{ text: 'OK', onPress: onClose }]);
    } catch (e: any) {
      setError(e.message ?? 'Gagal mengubah password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={cpStyles.overlay}>
        <View style={cpStyles.sheet}>
          <View style={cpStyles.handle} />
          <Text style={cpStyles.title}>Ganti Password</Text>
          {!!error && <View style={cpStyles.errorBox}><Text style={{ color: '#DC2626', fontSize: 13 }}>{error}</Text></View>}
          <View style={cpStyles.field}>
            <Text style={cpStyles.label}>Password Baru</Text>
            <TextInput style={cpStyles.input} value={next} onChangeText={setNext}
              placeholder="Min. 6 karakter" placeholderTextColor="#9CA3AF" secureTextEntry />
          </View>
          <View style={cpStyles.field}>
            <Text style={cpStyles.label}>Konfirmasi Password</Text>
            <TextInput style={cpStyles.input} value={confirm} onChangeText={setConfirm}
              placeholder="Ulangi password baru" placeholderTextColor="#9CA3AF" secureTextEntry />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <TouchableOpacity style={[cpStyles.cancelBtn, { flex: 1 }]} onPress={onClose}>
              <Text style={{ color: '#6B7280', fontWeight: '600' }}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cpStyles.submitBtn} onPress={submit} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={cpStyles.submitBtnText}>Simpan</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ProfileScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const user = useAuthStore((s) => s.user);
  const branch = useAuthStore((s) => s.currentBranch);
  const logout = useAuthStore((s) => s.logout);
  const [showChangePass, setShowChangePass] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  const handleLogout = () => {
    Alert.alert('Keluar', 'Apakah Anda yakin ingin keluar?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
    ]);
  };

  const ROLE_LABEL: Record<string, string> = { cashier: 'Kasir', back_office: 'Staff Cabang', owner: 'Owner' };

  return (
    <View style={styles.container}>
      <CashierHeader title="Profil" />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <TabletCenteredView>
          <View style={[styles.userCard, isTablet && { marginHorizontal: 32 }]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user?.name ?? 'K').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user?.name ?? '-'}</Text>
              <Text style={styles.userEmail}>{user?.email ?? '-'}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{ROLE_LABEL[user?.role ?? ''] ?? user?.role}</Text>
              </View>
            </View>
          </View>
          {branch && (
            <View style={styles.branchCard}>
              <Ionicons name="storefront-outline" size={16} color="#347385" />
              <Text style={styles.branchText}>{branch.name}</Text>
            </View>
          )}
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(cashier)/profile/printer' as any)}>
              <View style={[styles.menuIcon, { backgroundColor: '#EEF8FA' }]}>
                <Ionicons name="print-outline" size={20} color="#347385" />
              </View>
              <Text style={styles.menuLabel}>Pengaturan Printer</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => setShowChangePass(true)}>
              <View style={[styles.menuIcon, { backgroundColor: '#FFFBEB' }]}>
                <Ionicons name="key-outline" size={20} color="#D97706" />
              </View>
              <Text style={styles.menuLabel}>Ganti Password</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => setShowChangelog(true)}>
              <View style={[styles.menuIcon, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="information-circle-outline" size={20} color="#16A34A" />
              </View>
              <Text style={styles.menuLabel}>Versi Aplikasi</Text>
              <View style={styles.versionRight}>
                <View style={[styles.envPill, { backgroundColor: envInfo.bg }]}>
                  <Text style={[styles.envPillText, { color: envInfo.color }]}>{envInfo.label}</Text>
                </View>
                <Text style={styles.versionText}>v{APP_VERSION}</Text>
                <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
              </View>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color="#DC2626" />
            <Text style={styles.logoutText}>Keluar</Text>
          </TouchableOpacity>
        </TabletCenteredView>
      </ScrollView>
      {showChangePass && <ChangePasswordModal onClose={() => setShowChangePass(false)} />}
      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', margin: 16, borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#56B2C1', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#fff' },
  userInfo: { flex: 1, gap: 3 },
  userName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  userEmail: { fontSize: 13, color: '#6B7280' },
  roleBadge: { alignSelf: 'flex-start', backgroundColor: '#EEF8FA', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10 },
  roleBadgeText: { fontSize: 11, fontWeight: '600', color: '#56B2C1' },
  branchCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EEF8FA', marginHorizontal: 16, marginBottom: 8, borderRadius: 10, padding: 10,
  },
  branchText: { fontSize: 13, fontWeight: '600', color: '#4338CA' },
  menuCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 4, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 64 },
  versionRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  versionText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  envPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  envPillText: { fontSize: 11, fontWeight: '700' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, margin: 16, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#DC2626', backgroundColor: '#FEF2F2',
  },
  logoutText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
});

const cpStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, gap: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10 },
  field: { gap: 5 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14, color: '#111827' },
  cancelBtn: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitBtn: { flex: 2, backgroundColor: '#56B2C1', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

const clStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  currentBadge: {
    backgroundColor: '#EEF8FA', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 20,
  },
  currentBadgeText: { fontSize: 12, fontWeight: '700', color: '#56B2C1' },
  entry: { paddingVertical: 16, gap: 10 },
  entryBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  entryHeader: { gap: 2 },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  versionText: { fontSize: 15, fontWeight: '800', color: '#111827' },
  latestBadge: {
    backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10,
  },
  latestBadgeText: { fontSize: 11, fontWeight: '700', color: '#16A34A' },
  dateText: { fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' },
  changeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingRight: 4 },
  typeBadge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    flexShrink: 0, marginTop: 1,
  },
  typeText: { fontSize: 11, fontWeight: '700' },
  changeText: { fontSize: 13, color: '#374151', flex: 1, lineHeight: 20 },
  envRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  envDot: { width: 7, height: 7, borderRadius: 4 },
  envLabel: { fontSize: 13, fontWeight: '700' },
  envSub: { fontSize: 12, color: '#9CA3AF', flex: 1 },
});
