import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBackFromDashboard } from '@/hooks/useBackFromDashboard';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { fetchAllBranches } from '@/lib/ownerQueries';
import { getAllExpenses, getExpenseStats, EXPENSE_CATEGORIES, type ExpenseWithBranch, type ExpenseStats } from '@/lib/expenseQueries';
import type { Branch } from '@/types';

function fmtMoney(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PM_LABELS: Record<string, string> = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS' };
const PM_COLORS: Record<string, string> = { cash: '#16A34A', transfer: '#347385', qris: '#7C3AED' };
const PM_BG: Record<string, string> = { cash: '#F0FDF4', transfer: '#EEF8FA', qris: '#F5F3FF' };

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconBox, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={statStyles.col}>
        <Text style={[statStyles.value, { color }]} numberOfLines={1}>{value}</Text>
        <Text style={statStyles.label}>{label}</Text>
      </View>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2, minWidth: 140 },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  col: { flex: 1 },
  value: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 11, color: '#6B7280', marginTop: 1 },
});

// ─── Expense card ─────────────────────────────────────────────────────────────

function ExpenseCard({ item }: { item: ExpenseWithBranch }) {
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.left}>
        <View style={cardStyles.catDot} />
        <View style={{ flex: 1 }}>
          <View style={cardStyles.topRow}>
            <Text style={cardStyles.desc} numberOfLines={1}>{item.description}</Text>
            <Text style={cardStyles.amount}>{fmtMoney(item.amount)}</Text>
          </View>
          <Text style={cardStyles.branch} numberOfLines={1}>{item.branch_name}</Text>
          <View style={cardStyles.metaRow}>
            <View style={cardStyles.catChip}>
              <Text style={cardStyles.catText}>{item.category}</Text>
            </View>
            <View style={[cardStyles.pmChip, { backgroundColor: PM_BG[item.payment_method] }]}>
              <Text style={[cardStyles.pmText, { color: PM_COLORS[item.payment_method] }]}>{PM_LABELS[item.payment_method]}</Text>
            </View>
            <Text style={cardStyles.date}>{fmtDate(item.date)}</Text>
          </View>
          {!!item.notes && <Text style={cardStyles.notes} numberOfLines={1}>{item.notes}</Text>}
        </View>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  left: { flexDirection: 'row', gap: 10 },
  catDot: { width: 4, borderRadius: 2, alignSelf: 'stretch', marginTop: 2, minHeight: 40, backgroundColor: '#56B2C1' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 2 },
  desc: { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  amount: { fontSize: 14, fontWeight: '800', color: '#DC2626' },
  branch: { fontSize: 12, color: '#56B2C1', fontWeight: '600', marginBottom: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  catChip: { backgroundColor: '#F0F7F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  catText: { fontSize: 11, fontWeight: '600', color: '#347385' },
  pmChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  pmText: { fontSize: 11, fontWeight: '600' },
  date: { fontSize: 11, color: '#9CA3AF' },
  notes: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
});

// ─── Breakdown modal ──────────────────────────────────────────────────────────

function BreakdownModal({ stats, onClose }: { stats: ExpenseStats; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const maxAmount = Math.max(...stats.byCategory.map((c) => c.amount), 1);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[brkStyles.container, { paddingTop: insets.top }]}>
        <View style={brkStyles.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={brkStyles.headerTitle}>Breakdown Kategori</Text>
          <View style={{ width: 30 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={brkStyles.totalCard}>
            <Text style={brkStyles.totalLabel}>Total Pengeluaran</Text>
            <Text style={brkStyles.totalValue}>{fmtMoney(stats.totalAmount)}</Text>
            <Text style={brkStyles.totalCount}>{stats.totalCount} catatan</Text>
          </View>

          {stats.byCategory.map((cat) => {
            const pct = stats.totalAmount > 0 ? (cat.amount / stats.totalAmount) * 100 : 0;
            const barPct = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0;
            return (
              <View key={cat.category} style={brkStyles.catRow}>
                <View style={brkStyles.catInfo}>
                  <Text style={brkStyles.catName}>{cat.category}</Text>
                  <Text style={brkStyles.catCount}>{cat.count} catatan</Text>
                </View>
                <View style={brkStyles.barWrap}>
                  <View style={[brkStyles.bar, { width: `${barPct}%` as any }]} />
                </View>
                <View style={brkStyles.catAmountCol}>
                  <Text style={brkStyles.catAmount}>{fmtMoney(cat.amount)}</Text>
                  <Text style={brkStyles.catPct}>{pct.toFixed(1)}%</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const brkStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F7F9' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 8 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827' },
  totalCard: { backgroundColor: '#347385', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 20 },
  totalLabel: { fontSize: 13, color: '#D4EFF4', marginBottom: 4 },
  totalValue: { fontSize: 28, fontWeight: '800', color: '#fff' },
  totalCount: { fontSize: 12, color: '#A9DFE9', marginTop: 4 },
  catRow: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  catInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  catName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  catCount: { fontSize: 12, color: '#9CA3AF' },
  barWrap: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, marginBottom: 8, overflow: 'hidden' },
  bar: { height: 8, backgroundColor: '#56B2C1', borderRadius: 4 },
  catAmountCol: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catAmount: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  catPct: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OwnerExpensesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const goBack = useBackFromDashboard();

  const [expenses, setExpenses] = useState<ExpenseWithBranch[]>([]);
  const [stats, setStats] = useState<ExpenseStats>({ totalAmount: 0, totalCount: 0, byCategory: [] });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const loadBranches = useCallback(async () => {
    try { setBranches(await fetchAllBranches()); } catch {}
  }, []);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const branchId = selectedBranch === 'all' ? undefined : selectedBranch;
      const [list, statsData] = await Promise.all([
        getAllExpenses({ limit: 200, branchId, category: categoryFilter }),
        getExpenseStats(branchId),
      ]);
      setExpenses(list);
      setStats(statsData);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBranch, categoryFilter]);

  useEffect(() => { loadBranches(); }, []);
  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(true); }, [loadData]);

  const numCols = isTablet ? 2 : 1;

  return (
    <View style={styles.container}>
      <OwnerPageHeader
        title="Pengeluaran"
        subtitle={stats.totalCount > 0 ? `${stats.totalCount} catatan` : undefined}
        onBack={goBack}
        rightElement={
          <TouchableOpacity
            style={styles.breakdownBtn}
            onPress={() => setShowBreakdown(true)}
          >
            <Ionicons name="pie-chart-outline" size={18} color="#fff" />
          </TouchableOpacity>
        }
      />

      <TabletCenteredView style={{ backgroundColor: '#F0F7F9' }}>
        {/* Stats */}
        <View style={styles.statsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10, alignItems: 'center' }}
          >
            <StatCard label="Total Pengeluaran" value={fmtMoney(stats.totalAmount)} icon="cash-outline" color="#DC2626" />
            <StatCard label="Jumlah Catatan" value={stats.totalCount} icon="document-text-outline" color="#347385" />
            {stats.byCategory.slice(0, 2).map((c) => (
              <StatCard key={c.category} label={c.category} value={fmtMoney(c.amount)} icon="folder-outline" color="#E69738" />
            ))}
          </ScrollView>
        </View>

        {/* Filter cabang */}
        {branches.length > 1 && (
          <View style={styles.filterWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
            >
              <TouchableOpacity
                style={[styles.chip, selectedBranch === 'all' && styles.chipActive]}
                onPress={() => setSelectedBranch('all')}
              >
                <Text style={[styles.chipText, selectedBranch === 'all' && styles.chipTextActive]}>Semua Cabang</Text>
              </TouchableOpacity>
              {branches.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.chip, selectedBranch === b.id && styles.chipActive]}
                  onPress={() => setSelectedBranch(b.id)}
                >
                  <Text style={[styles.chipText, selectedBranch === b.id && styles.chipTextActive]}>{b.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Filter kategori */}
        <View style={styles.filterWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
          >
            <TouchableOpacity
              style={[styles.chip, categoryFilter === 'all' && styles.chipActive]}
              onPress={() => setCategoryFilter('all')}
            >
              <Text style={[styles.chipText, categoryFilter === 'all' && styles.chipTextActive]}>Semua</Text>
            </TouchableOpacity>
            {EXPENSE_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, categoryFilter === cat && styles.chipActive]}
                onPress={() => setCategoryFilter(cat)}
              >
                <Text style={[styles.chipText, categoryFilter === cat && styles.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#56B2C1" />
          </View>
        ) : expenses.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>Belum ada pengeluaran</Text>
            <Text style={styles.emptyDesc}>Pengeluaran dicatat oleh staff cabang di masing-masing cabang</Text>
          </View>
        ) : (
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id}
            numColumns={numCols}
            key={String(numCols)}
            contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 24 }}
            columnWrapperStyle={numCols > 1 ? { paddingHorizontal: 8 } : undefined}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#56B2C1" />}
            renderItem={({ item }) => (
              <View style={numCols > 1 ? { flex: 1, paddingHorizontal: 8 } : {}}>
                <ExpenseCard item={item} />
              </View>
            )}
          />
        )}
      </TabletCenteredView>

      {showBreakdown && (
        <BreakdownModal stats={stats} onClose={() => setShowBreakdown(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F7F9' },
  statsWrap: { height: 90, justifyContent: 'center', paddingVertical: 12 },
  breakdownBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  filterWrap: { height: 40, justifyContent: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  chipActive: { backgroundColor: '#347385' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 60 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },
  emptyDesc: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', maxWidth: 280 },
});
