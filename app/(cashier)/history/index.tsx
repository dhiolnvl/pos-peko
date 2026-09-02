import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { offlineQueue } from '@/lib/offlineQueue';
import { processTransaction } from '@/lib/transactionProcessor';
import { useAuthStore } from '@/store/authStore';
import { CashierHeader } from '@/components/CashierHeader';
import { formatCurrency } from '@/constants/config';

type FilterRange = 'today' | 'yesterday' | '7days';

interface TxRow {
  id: string;
  invoice_number: string;
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
  isPending?: boolean;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  qris: 'QRIS',
};

function isoToDisplay(iso: string) {
  try {
    const d = new Date(iso);
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function getDateRange(filter: FilterRange): { from: Date; to: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
  const endOfDay = (d: Date) => { const c = new Date(d); c.setHours(23, 59, 59, 999); return c; };
  if (filter === 'today') return { from: startOfDay(now), to: endOfDay(now) };
  if (filter === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  const week = new Date(now); week.setDate(week.getDate() - 6);
  return { from: startOfDay(week), to: endOfDay(now) };
}

export default function HistoryScreen() {
  const user = useAuthStore((s) => s.user);
  const lastSyncAt = useAuthStore((s) => s.lastSyncAt);

  const [filter, setFilter] = useState<FilterRange>('today');
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadTransactions = useCallback(async (range: FilterRange) => {
    if (!user) return;
    setLoading(true);
    try {
      const { from, to } = getDateRange(range);
      const fromIso = from.toISOString();
      const toIso = to.toISOString();

      // Load dari Supabase (mungkin gagal saat offline)
      let dbRows: TxRow[] = [];
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, invoice_number, total, payment_method, status, created_at')
          .eq('cashier_id', user.id)
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .order('created_at', { ascending: false });
        if (!error) dbRows = data ?? [];
      } catch {}

      // Load transaksi pending dari offline queue
      const queue = await offlineQueue.getAll();
      const pendingRows: TxRow[] = queue
        .filter((o) => {
          const t = new Date(o.queuedAt);
          return t >= from && t <= to && o.input !== undefined;
        })
        .map((o) => ({
          id: o.localId,
          invoice_number: `OFF-${o.queuedAt.slice(0, 10).replace(/-/g, '')}-${o.localId.slice(-6).toUpperCase()}`,
          total: o.input.total,
          payment_method: o.input.paymentMethod,
          status: 'pending',
          created_at: o.queuedAt,
          isPending: true,
        }));

      // Gabung — pending di atas, lalu db, sort by created_at desc
      const all = [...pendingRows, ...dbRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setRows(all);
    } catch (e) {
      console.error('[History] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { loadTransactions(filter); }, [filter, loadTransactions]));

  useEffect(() => {
    if (lastSyncAt > 0) loadTransactions(filter);
  }, [lastSyncAt]);

  const [syncing, setSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    const queue = await offlineQueue.getAll();
    if (queue.length === 0) return;
    setSyncing(true);
    let successCount = 0;
    let failCount = 0;
    for (const order of queue) {
      try {
        await processTransaction(order.input);
        await offlineQueue.remove(order.localId);
        successCount++;
      } catch (e: any) {
        await offlineQueue.incrementRetry(order.localId);
        failCount++;
      }
    }
    setSyncing(false);
    loadTransactions(filter);
    if (failCount > 0) {
      Alert.alert(
        'Sync Sebagian',
        `${successCount} transaksi berhasil disync. ${failCount} gagal — pastikan koneksi internet stabil.`
      );
    }
  }, [filter, loadTransactions]);

  const handleRefresh = () => { setRefreshing(true); loadTransactions(filter); };
  const handleFilterChange = (f: FilterRange) => { setFilter(f); loadTransactions(f); };

  const filterOptions: { key: FilterRange; label: string }[] = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'yesterday', label: 'Kemarin' },
    { key: '7days', label: '7 Hari' },
  ];

  const completedRows = rows.filter((r) => r.status !== 'void' && r.status !== 'pending');
  const pendingCount = rows.filter((r) => r.isPending).length;
  const totalRevenue = completedRows.reduce((sum, r) => sum + r.total, 0);

  return (
    <View style={styles.container}>
      <CashierHeader title="Riwayat Transaksi" />

      <View style={styles.filterRow}>
        {filterOptions.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => handleFilterChange(f.key)}
          >
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Transaksi</Text>
          <Text style={styles.summaryValue}>
            {completedRows.length}
            {pendingCount > 0 && (
              <Text style={styles.summaryPending}> +{pendingCount}</Text>
            )}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Pendapatan</Text>
          <Text style={[styles.summaryValue, { color: '#22C55E' }]}>{formatCurrency(totalRevenue)}</Text>
        </View>
      </View>

      {pendingCount > 0 && (
        <TouchableOpacity
          style={styles.syncBanner}
          onPress={handleSync}
          disabled={syncing}
          activeOpacity={0.8}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#D97706" />
          ) : (
            <Ionicons name="cloud-upload-outline" size={16} color="#D97706" />
          )}
          <Text style={styles.syncBannerText}>
            {syncing
              ? 'Menyinkronkan...'
              : `${pendingCount} transaksi belum tersinkron — Ketuk untuk sync`}
          </Text>
          {!syncing && <Ionicons name="chevron-forward" size={14} color="#D97706" />}
        </TouchableOpacity>
      )}

      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#56B2C1" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#56B2C1" />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>Belum ada transaksi</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, item.status === 'void' && styles.cardVoid, item.isPending && styles.cardPending]}
              onPress={() => {
                if (!item.isPending) router.push(`/(cashier)/history/${item.id}` as any);
              }}
              activeOpacity={item.isPending ? 1 : 0.7}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.cardInvoice}>{item.invoice_number}</Text>
                <Text style={styles.cardTime}>{isoToDisplay(item.created_at)}</Text>
                <View style={styles.methodChip}>
                  <Text style={styles.methodChipText}>{METHOD_LABELS[item.payment_method] || item.payment_method}</Text>
                </View>
              </View>
              <View style={styles.cardRight}>
                <Text style={[styles.cardTotal, item.status === 'void' && styles.cardTotalVoid]}>
                  {formatCurrency(item.total)}
                </Text>
                {item.isPending ? (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>Pending</Text>
                  </View>
                ) : item.status === 'void' ? (
                  <View style={styles.voidBadge}>
                    <Text style={styles.voidBadgeText}>Batal</Text>
                  </View>
                ) : (
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>Selesai</Text>
                  </View>
                )}
                {!item.isPending && (
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" style={{ marginTop: 4 }} />
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  filterChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F3F4F6' },
  filterChipActive: { backgroundColor: '#56B2C1' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  filterChipTextActive: { color: '#fff' },

  summary: {
    flexDirection: 'row', backgroundColor: '#fff',
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },
  summaryLabel: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  summaryValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  summaryPending: { fontSize: 14, fontWeight: '700', color: '#D97706' },

  syncBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFBEB', borderBottomWidth: 1, borderBottomColor: '#FDE68A',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  syncBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#D97706' },

  listContent: { padding: 16, gap: 10, paddingBottom: 32 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardVoid: { opacity: 0.6 },
  cardPending: { borderWidth: 1.5, borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  cardLeft: { flex: 1, gap: 4 },
  cardInvoice: { fontSize: 14, fontWeight: '700', color: '#111827' },
  cardTime: { fontSize: 12, color: '#9CA3AF' },
  methodChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF8FA', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  methodChipText: { fontSize: 11, fontWeight: '600', color: '#347385' },

  cardRight: { alignItems: 'flex-end', gap: 4 },
  cardTotal: { fontSize: 16, fontWeight: '800', color: '#111827' },
  cardTotalVoid: { textDecorationLine: 'line-through', color: '#9CA3AF' },

  completedBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  completedBadgeText: { fontSize: 11, fontWeight: '600', color: '#16A34A' },
  voidBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  voidBadgeText: { fontSize: 11, fontWeight: '600', color: '#DC2626' },
  pendingBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  pendingBadgeText: { fontSize: 11, fontWeight: '600', color: '#D97706' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
});
