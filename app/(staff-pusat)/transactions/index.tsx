import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl, useWindowDimensions,
  Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/constants/config';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { useAuthStore } from '@/store/authStore';
import TransactionReportButton from '@/components/TransactionReportButton';

type DateFilter = 'today' | 'yesterday' | '7days' | '30days';
type StatusFilter = 'all' | 'completed' | 'void';
type MethodFilter = 'all' | 'cash' | 'transfer' | 'qris';

interface TxRow {
  id: string;
  invoice_number: string;
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
  cashier_name: string | null;
  member_name: string | null;
  branch_name: string | null;
  branch_id: string | null;
}

interface BranchTab { id: string; name: string; }

const METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  qris: 'QRIS',
};

const DATE_OPTIONS: { key: DateFilter; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: 'yesterday', label: 'Kemarin' },
  { key: '7days', label: '7 Hari' },
  { key: '30days', label: '30 Hari' },
];

const DATE_LABELS: Record<DateFilter, string> = {
  today: 'Hari Ini',
  yesterday: 'Kemarin',
  '7days': '7 Hari Terakhir',
  '30days': '30 Hari Terakhir',
};

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'completed', label: 'Selesai' },
  { key: 'void', label: 'Batal' },
];

const METHOD_OPTIONS: { key: MethodFilter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'cash', label: 'Tunai' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'qris', label: 'QRIS' },
];

function getDateRange(filter: DateFilter): { from: string; to: string } {
  const now = new Date();
  const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c.toISOString(); };
  const endOfDay = (d: Date) => { const c = new Date(d); c.setHours(23, 59, 59, 999); return c.toISOString(); };
  if (filter === 'today') return { from: startOfDay(now), to: endOfDay(now) };
  if (filter === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (filter === '30days') {
    const d = new Date(now); d.setDate(d.getDate() - 29);
    return { from: startOfDay(d), to: endOfDay(now) };
  }
  const d = new Date(now); d.setDate(d.getDate() - 6);
  return { from: startOfDay(d), to: endOfDay(now) };
}

function isoToDisplay(iso: string) {
  try {
    const d = new Date(iso);
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return iso; }
}

export default function OwnerTransactionsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const userName = useAuthStore((s) => s.user?.name ?? '');

  const [branches, setBranches] = useState<BranchTab[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [showFilter, setShowFilter] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');

  const [tempDate, setTempDate] = useState<DateFilter>('today');
  const [tempStatus, setTempStatus] = useState<StatusFilter>('all');
  const [tempMethod, setTempMethod] = useState<MethodFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: branchData } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      setBranches(branchData ?? []);

      const { from, to } = getDateRange(dateFilter);

      let q = supabase
        .from('transactions')
        .select('id, invoice_number, total, payment_method, status, created_at, branch_id, users!cashier_id(name), members!member_id(name), branches!branch_id(name)')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })
        .limit(500);

      if (statusFilter === 'completed') q = (q as any).neq('status', 'void');
      else if (statusFilter === 'void') q = (q as any).eq('status', 'void');
      if (methodFilter !== 'all') q = (q as any).eq('payment_method', methodFilter);

      const { data } = await q;
      setRows((data ?? []).map((r: any) => ({
        id: r.id,
        invoice_number: r.invoice_number,
        total: r.total,
        payment_method: r.payment_method,
        status: r.status,
        created_at: r.created_at,
        branch_id: r.branch_id,
        cashier_name: r.users?.name ?? null,
        member_name: r.members?.name ?? null,
        branch_name: r.branches?.name ?? null,
      })));
    } catch (e) {
      console.error('[OwnerTransactions] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFilter, statusFilter, methodFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (selectedBranchId && r.branch_id !== selectedBranchId) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !r.invoice_number.toLowerCase().includes(q) &&
          !(r.cashier_name ?? '').toLowerCase().includes(q) &&
          !(r.member_name ?? '').toLowerCase().includes(q) &&
          !(r.branch_name ?? '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [rows, selectedBranchId, search]);

  const totalRevenue = filtered.filter((r) => r.status !== 'void').reduce((s, r) => s + r.total, 0);
  const countCompleted = filtered.filter((r) => r.status !== 'void').length;
  const countVoid = filtered.filter((r) => r.status === 'void').length;

  const activeFilterCount =
    (dateFilter !== 'today' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (methodFilter !== 'all' ? 1 : 0);

  const numColumns = isTablet ? 2 : 1;

  const subtitleLabel = selectedBranchId
    ? (branches.find((b) => b.id === selectedBranchId)?.name ?? DATE_LABELS[dateFilter])
    : DATE_LABELS[dateFilter];

  return (
    <View style={styles.container}>
      <OwnerPageHeader title="Transaksi" subtitle={subtitleLabel} />

      {/* Branch filter tabs */}
      <View style={styles.branchTabs}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.branchTabsContent}
        >
          <TouchableOpacity
            style={[styles.branchTab, selectedBranchId === null && styles.branchTabActive]}
            onPress={() => setSelectedBranchId(null)}
          >
            <Text style={[styles.branchTabText, selectedBranchId === null && styles.branchTabTextActive]}>
              Semua Cabang
            </Text>
          </TouchableOpacity>
          {branches.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[styles.branchTab, selectedBranchId === b.id && styles.branchTabActive]}
              onPress={() => setSelectedBranchId(b.id)}
            >
              <Text style={[styles.branchTabText, selectedBranchId === b.id && styles.branchTabTextActive]}>
                {b.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Search + filter */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" style={{ marginLeft: 12 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari invoice, kasir, member, cabang..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={{ paddingHorizontal: 8 }}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        <TransactionReportButton
          printerName={userName}
          branchId={selectedBranchId ?? undefined}
          branchName={selectedBranchId ? (branches.find((b) => b.id === selectedBranchId)?.name) : undefined}
          showBranch={!selectedBranchId}
          initialStatus={statusFilter}
          initialMethod={methodFilter}
        />
        <TouchableOpacity
          style={[styles.filterToggleBtn, activeFilterCount > 0 && styles.filterToggleBtnActive]}
          onPress={() => {
            setTempDate(dateFilter);
            setTempStatus(statusFilter);
            setTempMethod(methodFilter);
            setShowFilter(true);
          }}
        >
          <Ionicons name="options-outline" size={18} color={activeFilterCount > 0 ? '#fff' : '#347385'} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <View style={styles.activeFiltersRow}>
          <TouchableOpacity style={styles.activeDateChip}>
            <Text style={styles.activeChipText}>{DATE_OPTIONS.find((o) => o.key === dateFilter)?.label}</Text>
          </TouchableOpacity>
          {statusFilter !== 'all' && (
            <TouchableOpacity style={styles.activeDateChip}>
              <Text style={styles.activeChipText}>{STATUS_OPTIONS.find((o) => o.key === statusFilter)?.label}</Text>
            </TouchableOpacity>
          )}
          {methodFilter !== 'all' && (
            <TouchableOpacity style={styles.activeDateChip}>
              <Text style={styles.activeChipText}>{METHOD_OPTIONS.find((o) => o.key === methodFilter)?.label}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => { setDateFilter('today'); setStatusFilter('all'); setMethodFilter('all'); }}>
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter Modal */}
      <Modal visible={showFilter} transparent animationType="fade" onRequestClose={() => setShowFilter(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowFilter(false)}>
          <TouchableOpacity style={styles.filterModal} activeOpacity={1}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Filter</Text>
              <TouchableOpacity onPress={() => setShowFilter(false)}>
                <Ionicons name="close" size={22} color="#374151" />
              </TouchableOpacity>
            </View>

            <Text style={styles.filterGroupLabel}>Periode</Text>
            <View style={styles.chipRow}>
              {DATE_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.chip, tempDate === o.key && styles.chipActive]}
                  onPress={() => setTempDate(o.key)}
                >
                  <Text style={[styles.chipText, tempDate === o.key && styles.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterGroupLabel}>Status</Text>
            <View style={styles.chipRow}>
              {STATUS_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.chip, tempStatus === o.key && styles.chipActive]}
                  onPress={() => setTempStatus(o.key)}
                >
                  <Text style={[styles.chipText, tempStatus === o.key && styles.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterGroupLabel}>Metode Bayar</Text>
            <View style={styles.chipRow}>
              {METHOD_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.chip, tempMethod === o.key && styles.chipActive]}
                  onPress={() => setTempMethod(o.key)}
                >
                  <Text style={[styles.chipText, tempMethod === o.key && styles.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.filterModalActions}>
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => { setTempDate('today'); setTempStatus('all'); setTempMethod('all'); }}
              >
                <Text style={styles.resetBtnText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => {
                  setDateFilter(tempDate);
                  setStatusFilter(tempStatus);
                  setMethodFilter(tempMethod);
                  setShowFilter(false);
                }}
              >
                <Text style={styles.applyBtnText}>Terapkan</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Pendapatan</Text>
          <Text style={[styles.summaryValue, { color: '#16A34A' }]}>{formatCurrency(totalRevenue)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Selesai</Text>
          <Text style={styles.summaryValue}>{countCompleted}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Dibatalkan</Text>
          <Text style={[styles.summaryValue, { color: '#DC2626' }]}>{countVoid}</Text>
        </View>
      </View>

      {/* List */}
      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#56B2C1" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          key={numColumns}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          columnWrapperStyle={isTablet ? { gap: 12 } : undefined}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor="#56B2C1"
            />
          }
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={5}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>Tidak ada transaksi</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, isTablet && styles.cardTablet, item.status === 'void' && styles.cardVoid]}
              onPress={() => router.push(`/(staff-pusat)/transactions/${item.id}` as any)}
              activeOpacity={0.7}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardInvoice}>{item.invoice_number}</Text>
                {item.status === 'void' ? (
                  <View style={styles.voidBadge}><Text style={styles.voidBadgeText}>Batal</Text></View>
                ) : (
                  <View style={styles.completedBadge}><Text style={styles.completedBadgeText}>Selesai</Text></View>
                )}
              </View>

              {!!item.branch_name && (
                <View style={styles.cardMeta}>
                  <Ionicons name="business-outline" size={12} color="#347385" />
                  <Text style={[styles.cardMetaText, { color: '#347385', fontWeight: '600' }]}>{item.branch_name}</Text>
                </View>
              )}

              <View style={styles.cardMeta}>
                <Ionicons name="time-outline" size={12} color="#9CA3AF" />
                <Text style={styles.cardMetaText}>{isoToDisplay(item.created_at)}</Text>
              </View>
              {!!item.cashier_name && (
                <View style={styles.cardMeta}>
                  <Ionicons name="person-outline" size={12} color="#9CA3AF" />
                  <Text style={styles.cardMetaText}>{item.cashier_name}</Text>
                </View>
              )}
              {!!item.member_name && (
                <View style={styles.cardMeta}>
                  <Ionicons name="star-outline" size={12} color="#D97706" />
                  <Text style={[styles.cardMetaText, { color: '#D97706' }]}>{item.member_name}</Text>
                </View>
              )}

              <View style={styles.cardBottom}>
                <View style={styles.methodChip}>
                  <Text style={styles.methodChipText}>{METHOD_LABELS[item.payment_method] || item.payment_method}</Text>
                </View>
                <Text style={[styles.cardTotal, item.status === 'void' && styles.cardTotalVoid]}>
                  {formatCurrency(item.total)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  branchTabs: {
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
    height: 40, justifyContent: 'center',
  },
  branchTabsContent: {
    paddingHorizontal: 12, gap: 6,
    alignItems: 'center',
  },
  branchTab: {
    paddingHorizontal: 12, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  branchTabActive: { backgroundColor: '#347385', borderColor: '#347385' },
  branchTabText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  branchTabTextActive: { color: '#fff' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingRight: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  searchInput: { flex: 1, paddingVertical: 12, paddingRight: 4, fontSize: 14, color: '#111827' },

  filterToggleBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#A9DFE9',
  },
  filterToggleBtnActive: { backgroundColor: '#347385', borderColor: '#347385' },
  filterBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#EF4444', borderRadius: 8,
    width: 16, height: 16, justifyContent: 'center', alignItems: 'center',
  },
  filterBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  activeFiltersRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  activeDateChip: {
    backgroundColor: '#EEF8FA', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, borderColor: '#A9DFE9',
  },
  activeChipText: { fontSize: 12, fontWeight: '600', color: '#347385' },
  resetText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', paddingHorizontal: 4 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  filterModal: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    width: '88%', maxWidth: 400, gap: 10,
  },
  filterModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  filterModalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  filterGroupLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterModalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  resetBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center',
  },
  resetBtnText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  applyBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#347385', alignItems: 'center',
  },
  applyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: '#F3F4F6' },
  chipActive: { backgroundColor: '#347385' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },

  summaryBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    marginHorizontal: 16, marginVertical: 12,
    borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },
  summaryLabel: { fontSize: 11, color: '#6B7280' },
  summaryValue: { fontSize: 16, fontWeight: '800', color: '#111827' },

  listContent: { paddingHorizontal: 16, gap: 10 },
  centered: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },

  card: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardTablet: { flex: 1 },
  cardVoid: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardInvoice: { fontSize: 14, fontWeight: '700', color: '#111827' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaText: { fontSize: 12, color: '#6B7280' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  methodChip: { backgroundColor: '#EEF8FA', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  methodChipText: { fontSize: 11, fontWeight: '600', color: '#347385' },
  cardTotal: { fontSize: 15, fontWeight: '800', color: '#111827' },
  cardTotalVoid: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  completedBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  completedBadgeText: { fontSize: 11, fontWeight: '600', color: '#16A34A' },
  voidBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  voidBadgeText: { fontSize: 11, fontWeight: '600', color: '#DC2626' },
});
