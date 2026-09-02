import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { CashierHeader } from '@/components/CashierHeader';
import { getShiftHistory, type Shift } from '@/lib/shiftQueries';
import { formatCurrency } from '@/constants/config';

const METHOD_COLORS: Record<string, string> = {
  cash: '#22C55E',
  transfer: '#3B82F6',
  qris: '#8B5CF6',
};

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return iso; }
}

function fmtDuration(openedAt: string, closedAt: string | null) {
  if (!closedAt) return null;
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

function ShiftCard({ shift, onPress }: { shift: Shift; onPress: () => void }) {
  const isOpen = shift.status === 'open';
  const duration = fmtDuration(shift.opened_at, shift.closed_at);

  return (
    <TouchableOpacity style={[styles.card, isOpen && styles.cardOpen]} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardTop}>
        <View style={styles.cardTopLeft}>
          <View style={[styles.statusDot, { backgroundColor: isOpen ? '#22C55E' : '#9CA3AF' }]} />
          <Text style={styles.cardDate}>{fmtDateTime(shift.opened_at)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: isOpen ? '#DCFCE7' : '#F3F4F6' }]}>
          <Text style={[styles.statusBadgeText, { color: isOpen ? '#16A34A' : '#6B7280' }]}>
            {isOpen ? 'Buka' : 'Tutup'}
          </Text>
        </View>
      </View>

      <View style={styles.cardStats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Transaksi</Text>
          <Text style={styles.statValue}>{shift.total_transactions ?? '-'}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Total Penjualan</Text>
          <Text style={[styles.statValue, { color: '#347385' }]}>
            {shift.total_sales != null ? formatCurrency(shift.total_sales) : '-'}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Durasi</Text>
          <Text style={styles.statValue}>{duration ?? (isOpen ? 'Berlangsung' : '-')}</Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.cashInfo}>
          <Ionicons name="cash-outline" size={13} color="#9CA3AF" />
          <Text style={styles.cashText}>
            Buka: {formatCurrency(shift.opening_cash)}
            {shift.closing_cash != null ? `  ·  Tutup: ${formatCurrency(shift.closing_cash)}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
      </View>
    </TouchableOpacity>
  );
}

export default function ShiftsScreen() {
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id || !user?.branch_id) return;
    try {
      const data = await getShiftHistory(user.id, user.branch_id, 50);
      setShifts(data);
    } catch (e) {
      console.error('[Shifts] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleRefresh = () => { setRefreshing(true); load(); };

  const numCols = isTablet ? 2 : 1;
  const totalSales = shifts.reduce((s, sh) => s + (sh.total_sales ?? 0), 0);
  const totalTx = shifts.reduce((s, sh) => s + (sh.total_transactions ?? 0), 0);

  return (
    <View style={styles.root}>
      <CashierHeader title="Riwayat Shift" />

      {/* Summary bar */}
      <View style={[styles.summary, isTablet && { paddingHorizontal: 24 }]}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Shift</Text>
          <Text style={styles.summaryValue}>{shifts.length}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Transaksi</Text>
          <Text style={styles.summaryValue}>{totalTx}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Penjualan</Text>
          <Text style={[styles.summaryValue, { color: '#22C55E' }]}>{formatCurrency(totalSales)}</Text>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#56B2C1" />
        </View>
      ) : (
        <FlatList
          data={shifts}
          key={numCols}
          keyExtractor={(s) => s.id}
          numColumns={numCols}
          columnWrapperStyle={numCols > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#56B2C1" />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="time-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>Belum ada shift</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={numCols > 1 ? styles.colItem : styles.fullItem}>
              <ShiftCard
                shift={item}
                onPress={() => router.push(`/(cashier)/shifts/${item.id}` as any)}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },

  summary: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: '#E5E7EB', marginVertical: 2 },
  summaryLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', marginBottom: 2 },
  summaryValue: { fontSize: 16, fontWeight: '800', color: '#111827' },

  list: { padding: 16, gap: 12 },
  columnWrapper: { gap: 12 },
  colItem: { flex: 1, minWidth: 0 },
  fullItem: { width: '100%' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...StyleSheet.flatten({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    }),
  },
  cardOpen: { borderColor: '#A9DFE9', backgroundColor: '#FAFFFE' },

  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  cardDate: { fontSize: 13, fontWeight: '600', color: '#374151' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  cardStats: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { width: 1, backgroundColor: '#E5E7EB', marginVertical: 2 },
  statLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },
  statValue: { fontSize: 14, fontWeight: '800', color: '#111827' },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cashInfo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cashText: { fontSize: 11, color: '#9CA3AF' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
});
