import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

// Tabel yang akan dihapus datanya (urutan penting — child dulu sebelum parent)
const RESET_TABLES = [
  // Transaksi & poin
  'point_redemptions',
  'member_point_logs',
  'transaction_items',
  'transactions',
  'shifts',
  // Stok operasional
  'stock_opname_items',
  'stock_opname',
  'stock_request_items',
  'stock_requests',
  'stock_transfer_items',
  'stock_transfers',
  'stock_movements',
  // Pembelian
  'purchase_order_items',
  'purchase_orders',
  // Gudang: hapus warehouse_stock (akan dibuat ulang saat PO)
  'warehouse_stock',
  // branch_products TIDAK dihapus — stok direset ke 0 di bawah
  // Pengeluaran & member
  'expenses',
  'members',
];

// Data master yang TIDAK dihapus:
// products, categories, branches, users, warehouse, suppliers,
// reward_items, reward_item_products, product_units, settings

const WHAT_DELETED = [
  'Semua transaksi penjualan',
  'Riwayat poin & penukaran member',
  'Data shift kasir',
  'Riwayat pembelian (PO)',
  'Riwayat distribusi & permintaan stok',
  'Riwayat penyesuaian & opname stok',
  'Riwayat pergerakan stok',
  'Stok gudang (dihapus) & stok cabang (direset ke 0, produk tetap terdaftar)',
  'Pengeluaran operasional',
  'Data member (nama, poin)',
];

const WHAT_KEPT = [
  'Produk & kategori',
  'Cabang & pengguna',
  'Gudang (entitas)',
  'Supplier',
  'Reward & hadiah poin',
  'Satuan produk',
  'Pengaturan toko',
];

export default function ResetDataScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { user } = useAuthStore();

  const [step, setStep] = useState<'info' | 'confirm' | 'password'>('info');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePasswordConfirm = async () => {
    if (!password.trim()) {
      Alert.alert('Perhatian', 'Masukkan password terlebih dahulu.');
      return;
    }
    if (!user?.email) {
      Alert.alert('Error', 'Sesi tidak valid, silakan login ulang.');
      return;
    }

    setLoading(true);
    try {
      // Verifikasi password dengan sign in ulang
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password.trim(),
      });

      if (error) {
        Alert.alert('Password Salah', 'Password yang dimasukkan tidak cocok.');
        setLoading(false);
        return;
      }

      // Password benar, mulai reset
      await doReset();
    } catch (e: any) {
      Alert.alert('Gagal', e.message);
      setLoading(false);
    }
  };

  const doReset = async () => {
    try {
      for (const table of RESET_TABLES) {
        const { error } = await supabase
          .from(table as any)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        if (error) {
          throw new Error(`Gagal menghapus tabel ${table}: ${error.message}`);
        }
      }

      // Reset stok branch_products ke 0 (tidak dihapus agar produk tetap terdaftar di cabang)
      const { error: bpError } = await supabase
        .from('branch_products')
        .update({ stock: 0, updated_at: new Date().toISOString() })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (bpError) throw new Error(`Gagal mereset stok cabang: ${bpError.message}`);

      Alert.alert(
        'Reset Berhasil',
        'Semua data operasional telah dihapus. Data master tetap tersimpan.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert('Reset Gagal', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#347385" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reset Data</Text>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40 },
            isTablet && styles.contentTablet,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Warning banner */}
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={28} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Tindakan Tidak Dapat Dibatalkan</Text>
              <Text style={styles.warningDesc}>
                Reset data akan menghapus seluruh data operasional secara permanen. Pastikan sudah membuat backup sebelum melanjutkan.
              </Text>
            </View>
          </View>

          {/* Yang dihapus */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.dot, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="trash-outline" size={14} color="#DC2626" />
              </View>
              <Text style={styles.sectionTitle}>Data yang akan dihapus</Text>
            </View>
            <View style={styles.listCard}>
              {WHAT_DELETED.map((item, i) => (
                <View key={i} style={[styles.listRow, i === WHAT_DELETED.length - 1 && { borderBottomWidth: 0 }]}>
                  <Ionicons name="close-circle" size={15} color="#DC2626" />
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Yang disimpan */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.dot, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="shield-checkmark-outline" size={14} color="#16A34A" />
              </View>
              <Text style={styles.sectionTitle}>Data master yang tetap tersimpan</Text>
            </View>
            <View style={styles.listCard}>
              {WHAT_KEPT.map((item, i) => (
                <View key={i} style={[styles.listRow, i === WHAT_KEPT.length - 1 && { borderBottomWidth: 0 }]}>
                  <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Step: info */}
          {step === 'info' && (
            <TouchableOpacity
              style={styles.dangerBtn}
              onPress={() => setStep('confirm')}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-circle-outline" size={20} color="#fff" />
              <Text style={styles.dangerBtnText}>Saya Mengerti, Lanjutkan Reset</Text>
            </TouchableOpacity>
          )}

          {/* Step: konfirmasi teks */}
          {step === 'confirm' && (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Konfirmasi Reset</Text>
              <Text style={styles.confirmDesc}>
                Apakah Anda yakin ingin menghapus semua data operasional? Tindakan ini tidak bisa dibatalkan.
              </Text>
              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={styles.btnCancel}
                  onPress={() => setStep('info')}
                >
                  <Text style={styles.btnCancelText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnProceed}
                  onPress={() => setStep('password')}
                >
                  <Text style={styles.btnProceedText}>Ya, Lanjutkan</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Step: input password */}
          {step === 'password' && (
            <View style={styles.passwordCard}>
              <View style={styles.lockIconWrap}>
                <Ionicons name="lock-closed" size={28} color="#DC2626" />
              </View>
              <Text style={styles.passwordTitle}>Verifikasi Password</Text>
              <Text style={styles.passwordDesc}>
                Masukkan password akun owner untuk mengkonfirmasi reset data.
              </Text>

              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Password"
                  placeholderTextColor="#A0AEC0"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handlePasswordConfirm}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((v) => !v)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={styles.btnCancel}
                  onPress={() => { setStep('info'); setPassword(''); }}
                  disabled={loading}
                >
                  <Text style={styles.btnCancelText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dangerBtnSmall, loading && { opacity: 0.6 }]}
                  onPress={handlePasswordConfirm}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.dangerBtnSmallText}>Reset Sekarang</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },

  content: { padding: 16, gap: 16 },
  contentTablet: { maxWidth: 640, alignSelf: 'center', width: '100%' },

  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  warningTitle: { fontSize: 14, fontWeight: '700', color: '#DC2626', marginBottom: 4 },
  warningDesc: { fontSize: 13, color: '#7F1D1D', lineHeight: 18 },

  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: {
    width: 28, height: 28, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151' },

  listCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  listText: { fontSize: 13, color: '#374151', flex: 1 },

  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 4,
  },
  dangerBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  confirmCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 12,
    marginTop: 4,
  },
  confirmTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  confirmDesc: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 4 },

  btnCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  btnCancelText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  btnProceed: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  btnProceedText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  passwordCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  lockIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  passwordTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  passwordDesc: { fontSize: 13, color: '#6B7280', lineHeight: 19, textAlign: 'center' },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 12,
  },
  eyeBtn: { padding: 4 },

  dangerBtnSmall: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  dangerBtnSmallText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
