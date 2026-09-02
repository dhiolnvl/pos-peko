import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, ScrollView, Alert,
  useWindowDimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { useShiftStore } from '@/store/shiftStore';
import { closeShift, getShiftSummary, syncShiftsToSupabase, type ShiftSummary } from '@/lib/shiftQueries';
import { printShiftReceipt } from '@/lib/printerHelper';
import { formatCurrency } from '@/constants/config';

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, highlight && styles.summaryValueHighlight]}>{value}</Text>
    </View>
  );
}

export default function CloseShiftScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const user = useAuthStore((s) => s.user);
  const currentBranch = useAuthStore((s) => s.currentBranch);
  const { activeShift, setActiveShift } = useShiftStore();

  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [closing, setClosing] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const notesRef = useRef<View>(null);

  const formatThousands = (v: string) => {
    const digits = v.replace(/\D/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  const parseAmount = (v: string) => parseFloat(v.replace(/\./g, '')) || 0;

  useEffect(() => {
    if (!activeShift) {
      router.replace('/(cashier)');
      return;
    }
    getShiftSummary(activeShift.id, activeShift.cashier_id, activeShift.branch_id, activeShift.opened_at)
      .then((s) => {
        setSummary(s);
        const defaultCash = (activeShift.opening_cash ?? 0) + s.cashSales;
        setClosingCash(formatThousands(String(defaultCash)));
      })
      .catch(() => {})
      .finally(() => setLoadingSummary(false));
  }, []);

  const formatDuration = () => {
    if (!activeShift) return '-';
    const start = new Date(activeShift.opened_at).getTime();
    const now = Date.now();
    const mins = Math.floor((now - start) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h} jam ${m} menit` : `${m} menit`;
  };

  const handleClose = () => {
    if (!activeShift || !user || !currentBranch) return;
    Alert.alert(
      'Tutup Shift',
      'Yakin ingin menutup shift? Kasir tidak bisa bertransaksi setelah shift ditutup.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Tutup Shift',
          style: 'destructive',
          onPress: async () => {
            setClosing(true);
            try {
              const cashAmt = parseAmount(closingCash);
              const closedShift = await closeShift({
                shiftId: activeShift.id,
                cashierId: activeShift.cashier_id,
                branchId: activeShift.branch_id,
                openedAt: activeShift.opened_at,
                closingCash: cashAmt,
                notes: notes.trim() || undefined,
              });

              await printShiftReceipt({
                storeName: currentBranch.name,
                storeAddress: currentBranch.address,
                storePhone: currentBranch.phone,
                cashierName: user.name,
                type: 'close',
                openedAt: closedShift.opened_at,
                closedAt: closedShift.closed_at,
                openingCash: closedShift.opening_cash,
                closingCash: cashAmt,
                totalTransactions: summary?.totalTransactions ?? 0,
                totalSales: summary?.totalSales ?? 0,
                cashSales: summary?.cashSales ?? 0,
                transferSales: summary?.transferSales ?? 0,
                qrisSales: summary?.qrisSales ?? 0,
              });

              syncShiftsToSupabase().catch(() => {});
              setActiveShift(null);
              router.replace('/(cashier)');
            } catch (e: any) {
              Alert.alert('Gagal', e.message ?? 'Gagal menutup shift');
            } finally {
              setClosing(false);
            }
          },
        },
      ]
    );
  };

  if (!activeShift) return null;

  const contentMaxWidth = isTablet ? 560 : undefined;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} disabled={closing}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { fontSize: isTablet ? 18 : 15 }]}>Tutup Shift</Text>
          <Text style={styles.headerSub}>Durasi: {formatDuration()}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32, alignItems: isTablet ? 'center' : undefined },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: contentMaxWidth }}>

          {/* Ringkasan shift */}
          <Text style={styles.sectionTitle}>Ringkasan Shift</Text>
          {loadingSummary ? (
            <ActivityIndicator color="#56B2C1" style={{ paddingVertical: 20 }} />
          ) : (
            <View style={styles.summaryCard}>
              <SummaryRow label="Kasir" value={activeShift.cashier_name} />
              <SummaryRow
                label="Buka Shift"
                value={new Date(activeShift.opened_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              />
              <View style={styles.divider} />
              <SummaryRow label="Total Transaksi" value={`${summary?.totalTransactions ?? 0} transaksi`} />
              <SummaryRow label="Total Penjualan" value={formatCurrency(summary?.totalSales ?? 0)} highlight />
              {(summary?.cashSales ?? 0) > 0 && (
                <SummaryRow label="  Tunai" value={formatCurrency(summary?.cashSales ?? 0)} />
              )}
              {(summary?.transferSales ?? 0) > 0 && (
                <SummaryRow label="  Transfer" value={formatCurrency(summary?.transferSales ?? 0)} />
              )}
              {(summary?.qrisSales ?? 0) > 0 && (
                <SummaryRow label="  QRIS" value={formatCurrency(summary?.qrisSales ?? 0)} />
              )}
              {(summary?.splitSales ?? 0) > 0 && (
                <SummaryRow label="  Campuran" value={formatCurrency(summary?.splitSales ?? 0)} />
              )}
              {(summary?.deliverySales ?? 0) > 0 && (
                <SummaryRow label="  Delivery" value={formatCurrency(summary?.deliverySales ?? 0)} />
              )}
              <View style={styles.divider} />
              <SummaryRow label="Modal Awal" value={formatCurrency(activeShift.opening_cash ?? 0)} />
            </View>
          )}

          {/* Uang akhir */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Uang Tunai di Kasir</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.prefix}>Rp</Text>
            <TextInput
              style={styles.input}
              value={closingCash}
              onChangeText={(v) => setClosingCash(formatThousands(v))}
              placeholder="0"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              returnKeyType="done"
            />
          </View>

          {/* Catatan */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Catatan (opsional)</Text>
          <View
            ref={notesRef}
            style={[styles.inputWrap, { alignItems: 'flex-start' }]}
          >
            <Ionicons name="create-outline" size={15} color="#9CA3AF" style={{ marginHorizontal: 12, marginTop: 13 }} />
            <TextInput
              style={[styles.input, { minHeight: 72, paddingTop: 12, paddingBottom: 12 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Keterangan penutupan shift..."
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

          {/* Tombol tutup */}
          <TouchableOpacity
            style={[styles.closeBtn, closing && { opacity: 0.7 }, { marginTop: 32 }]}
            onPress={handleClose}
            disabled={closing}
            activeOpacity={0.85}
          >
            {closing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="stop-circle-outline" size={20} color="#fff" />
                <Text style={styles.closeBtnText}>Tutup Shift & Cetak Struk</Text>
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#56B2C1',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 11, color: '#D4EFF4', marginTop: 1 },

  scroll: { padding: 20 },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
  },

  summaryCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    gap: 10, borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: '#6B7280' },
  summaryValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  summaryValueHighlight: { fontSize: 15, fontWeight: '800', color: '#347385' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 2 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  prefix: { paddingLeft: 14, fontSize: 15, color: '#347385', fontWeight: '700' },
  input: {
    flex: 1, paddingVertical: 13, paddingHorizontal: 10,
    fontSize: 16, color: '#111827', fontWeight: '600',
  },

  closeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#DC2626', borderRadius: 14, paddingVertical: 16,
  },
  closeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
