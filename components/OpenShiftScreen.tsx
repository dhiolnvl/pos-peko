import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Image, useWindowDimensions, KeyboardAvoidingView,
  Platform, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { useShiftStore } from '@/store/shiftStore';
import { openShift, ensureShiftTable, syncShiftsToSupabase } from '@/lib/shiftQueries';
import { offlineCache } from '@/lib/offlineCache';
import { printShiftReceipt, isPrinterConnected } from '@/lib/printerHelper';
import { formatCurrency } from '@/constants/config';

export function OpenShiftScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const user = useAuthStore((s) => s.user);
  const currentBranch = useAuthStore((s) => s.currentBranch);
  const setActiveShift = useShiftStore((s) => s.setActiveShift);

  const scrollRef = useRef<ScrollView>(null);
  const notesRef = useRef<View>(null);
  const [openingCash, setOpeningCash] = useState('');

  const formatThousands = (v: string) => {
    const digits = v.replace(/\D/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  const parseAmount = (v: string) => parseFloat(v.replace(/\./g, '')) || 0;
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doOpenShift = async () => {
    if (!user || !currentBranch) return;
    const cashAmount = parseAmount(openingCash);

    setLoading(true);
    setError('');
    try {
      await ensureShiftTable();
      const shift = await openShift({
        cashierId: user.id,
        cashierName: user.name,
        branchId: currentBranch.id,
        openingCash: cashAmount,
        notes: notes.trim() || undefined,
      });

      await printShiftReceipt({
        storeName: currentBranch.name,
        storeAddress: currentBranch.address,
        storePhone: currentBranch.phone,
        cashierName: user.name,
        type: 'open',
        openedAt: shift.opened_at,
        openingCash: cashAmount,
      });

      setActiveShift(shift);

      // Cek apakah shift ini dibuka offline (pending)
      const pending = await offlineCache.getPendingShift();
      if (pending?.id === shift.id) {
        Alert.alert(
          'Shift Dibuka (Mode Offline)',
          'Tidak ada koneksi internet. Shift berhasil dibuka secara offline dan akan otomatis tersinkron ke server saat koneksi kembali.',
          [{ text: 'OK' }]
        );
      } else {
        syncShiftsToSupabase().catch(() => {});
      }
    } catch (e: any) {
      setError(e.message ?? 'Gagal membuka shift');
    } finally {
      setLoading(false);
    }
  };


  const handleOpen = async () => {
    if (!user || !currentBranch) return;
    if (!isPrinterConnected()) {
      Alert.alert(
        'Printer Belum Terhubung',
        'Printer belum dikonfigurasi. Shift akan dibuka tanpa mencetak struk. Lanjutkan?',
        [
          { text: 'Batal', style: 'cancel' },
          { text: 'Buka Tanpa Print', style: 'default', onPress: doOpenShift },
        ]
      );
      return;
    }
    doOpenShift();
  };

  const cardWidth = isTablet ? 440 : '100%' as const;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Image
          source={require('@/assets/logo.png')}
          style={{ width: isTablet ? 150 : 110, height: isTablet ? 68 : 50 }}
          resizeMode="contain"
        />
        <View>
          <Text style={[styles.headerSub, { fontSize: isTablet ? 15 : 11 }]}>
            {user?.name} · {currentBranch?.name}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { width: cardWidth, alignSelf: 'center' }]}>
          {/* Icon */}
          <View style={styles.iconWrap}>
            <Ionicons name="time-outline" size={isTablet ? 52 : 42} color="#347385" />
          </View>

          <Text style={[styles.title, { fontSize: isTablet ? 24 : 20 }]}>Buka Shift</Text>
          <Text style={styles.subtitle}>
            Masukkan jumlah uang tunai di laci kasir untuk memulai shift kerja
          </Text>

          {/* Info kasir */}
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="person-outline" size={14} color="#6B7280" />
              <Text style={styles.infoText}>{user?.name}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="business-outline" size={14} color="#6B7280" />
              <Text style={styles.infoText}>{currentBranch?.name}</Text>
            </View>
          </View>

          {/* Modal awal */}
          <View style={styles.field}>
            <Text style={styles.label}>Modal Awal (Uang Tunai di Kasir)</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.prefix}>Rp</Text>
              <TextInput
                style={styles.input}
                value={openingCash}
                onChangeText={(v) => setOpeningCash(formatThousands(v))}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Catatan */}
          <View
            ref={notesRef}
            style={styles.field}
            onLayout={() => {}}
          >
            <Text style={styles.label}>Catatan (opsional)</Text>
            <View style={[styles.inputWrap, { alignItems: 'flex-start' }]}>
              <Ionicons name="create-outline" size={15} color="#9CA3AF" style={{ marginHorizontal: 12, marginTop: 12 }} />
              <TextInput
                style={[styles.input, { minHeight: 60, paddingTop: 10, paddingBottom: 10 }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Keterangan shift..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                onFocus={() => {
                  notesRef.current?.measureLayout(
                    scrollRef.current as any,
                    (_x, y) => {
                      scrollRef.current?.scrollTo({ y: y - 16, animated: true });
                    },
                    () => {}
                  );
                }}
              />
            </View>
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.openBtn, loading && { opacity: 0.7 }]}
            onPress={handleOpen}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="play-circle-outline" size={20} color="#fff" />
                <Text style={styles.openBtnText}>Buka Shift & Cetak Struk</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F7F9' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#56B2C1',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerSub: { color: '#D4EFF4', marginTop: 1 },

  scroll: {
    flexGrow: 1,
    padding: 20,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  iconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center',
  },

  title: { fontWeight: '800', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20 },

  infoRow: {
    flexDirection: 'row', gap: 16,
    backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12,
  },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  infoText: { fontSize: 13, color: '#374151', fontWeight: '600', flexShrink: 1 },

  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: '700', color: '#374151' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  prefix: { paddingLeft: 14, fontSize: 15, color: '#347385', fontWeight: '700' },
  input: {
    flex: 1, paddingVertical: 13, paddingHorizontal: 10,
    fontSize: 16, color: '#111827', fontWeight: '600',
  },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10,
  },
  errorText: { color: '#DC2626', fontSize: 12, flex: 1 },

  openBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#347385', borderRadius: 14,
    paddingVertical: 15, marginTop: 4,
  },
  openBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
