/**
 * Laporan Stok
 * Tab 1: Nilai Stok (by category + product list)
 * Tab 2: Mutasi Stok (filter produk & periode, timeline)
 * Tab 3: Produk Terlaris (ranking by qty & revenue)
 */

import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  FlatList, Share, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { useReportStore } from '@/store/reportStore';
import {
  getStockMutations, getTopProducts,
  fmtCurrency, fmtNumber,
  startOfDay, endOfDay, weekRange, monthRange,
  type StockProduct, type StockMutation, type TopProduct,
} from '@/lib/reportQueries';

type SortMode = 'value' | 'stock_asc';
type MutPeriod = 'today' | 'week' | 'month';
type TopPeriod = 'week' | 'month';

const MUTATION_LABELS: Record<string, string> = {
  sale: 'Penjualan',
  purchase: 'Pembelian',
  adjustment_in: 'Penyesuaian +',
  adjustment_out: 'Penyesuaian -',
  opname: 'Opname',
  void: 'Void',
};

const MUTATION_COLORS: Record<string, string> = {
  sale: '#EF4444',
  purchase: '#22C55E',
  adjustment_in: '#22C55E',
  adjustment_out: '#EF4444',
  opname: '#347385',
  void: '#F59E0B',
};

function isoShort(iso: string) {
  try {
    const d = new Date(iso);
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return iso; }
}

// ─── Tab 1: Stock Value ───────────────────────────────────────────────────────

function StockValueTab({ branchId }: { branchId: string }) {
  const { stockReport, isLoadingStock, loadStockReport } = useReportStore();
  const [sort, setSort] = useState<SortMode>('value');

  useFocusEffect(useCallback(() => { loadStockReport(branchId); }, [branchId]));

  const sorted = (() => {
    if (!stockReport?.products) return [];
    const arr = [...stockReport.products];
    return sort === 'value'
      ? arr.sort((a, b) => b.stock_value - a.stock_value)
      : arr.sort((a, b) => a.stock - b.stock);
  })();

  const handleExport = async () => {
    if (!stockReport) return;
    const lines = [
      'LAPORAN NILAI STOK',
      `Total Nilai: ${fmtCurrency(stockReport.total_value)}`,
      '',
      ...stockReport.products.map((p) =>
        `${p.name}  |  Stok: ${p.stock}  |  ${fmtCurrency(p.stock_value)}`
      ),
    ];
    try { await Share.share({ message: lines.join('\n') }); } catch {}
  };

  if (isLoadingStock) {
    return <View style={st.centered}><ActivityIndicator size="large" color="#347385" /></View>;
  }

  return (
    <ScrollView contentContainerStyle={st.tabScroll}>
      {/* Total value */}
      <View style={st.totalCard}>
        <Text style={st.totalLabel}>Total Nilai Stok</Text>
        <Text style={st.totalValue}>{fmtCurrency(stockReport?.total_value ?? 0)}</Text>
        <TouchableOpacity style={st.exportBtn} onPress={handleExport}>
          <Ionicons name="share-outline" size={14} color="#347385" />
          <Text style={st.exportBtnText}>Export</Text>
        </TouchableOpacity>
      </View>

      {/* By category */}
      {!!stockReport?.by_category?.length && (
        <View style={st.card}>
          <Text style={st.cardTitle}>Per Kategori</Text>
          {stockReport.by_category.map((cat, i) => {
            const pct = stockReport.total_value > 0 ? (cat.total_value / stockReport.total_value) * 100 : 0;
            return (
              <View key={i} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{cat.category_name}</Text>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>{fmtCurrency(cat.total_value)} · {cat.product_count} produk</Text>
                </View>
                <View style={{ height: 6, backgroundColor: '#F3F4F6', borderRadius: 3 }}>
                  <View style={{ height: 6, width: `${pct}%` as any, backgroundColor: '#347385', borderRadius: 3 }} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Sort + product list */}
      <View style={st.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={st.cardTitle}>Daftar Produk ({sorted.length})</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['value', 'stock_asc'] as SortMode[]).map((s) => (
              <TouchableOpacity
                key={s}
                style={[st.sortChip, sort === s && st.sortChipActive]}
                onPress={() => setSort(s)}
              >
                <Text style={[st.sortChipText, sort === s && st.sortChipTextActive]}>
                  {s === 'value' ? 'Nilai' : 'Stok Rendah'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {sorted.map((p) => (
          <View key={p.id} style={st.productRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.productName}>{p.name}</Text>
              <Text style={st.productMeta}>{p.category_name} · HPP {fmtCurrency(p.cost_price)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={st.productValue}>{fmtCurrency(p.stock_value)}</Text>
              <Text style={[st.productStock, p.stock === 0 && { color: '#EF4444' }, p.stock > 0 && p.stock <= 5 && { color: '#F59E0B' }]}>
                Stok: {p.stock}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Tab 2: Mutations ─────────────────────────────────────────────────────────

function MutationsTab({ branchId }: { branchId: string }) {
  const [period, setPeriod] = useState<MutPeriod>('week');
  const [search, setSearch] = useState('');
  const [mutations, setMutations] = useState<StockMutation[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: MutPeriod, q?: string) => {
    setLoading(true);
    try {
      const range = p === 'today'
        ? { from: startOfDay(), to: endOfDay() }
        : p === 'week' ? weekRange() : monthRange();
      const data = await getStockMutations(branchId, undefined, range.from, range.to);
      const filtered = q ? data.filter((m) => m.product_name.toLowerCase().includes(q.toLowerCase())) : data;
      setMutations(filtered);
    } catch {} finally { setLoading(false); }
  }, [branchId]);

  useFocusEffect(useCallback(() => { load(period); }, [branchId]));

  const handleExport = async () => {
    const lines = [
      'MUTASI STOK',
      ...mutations.map((m) =>
        `${isoShort(m.created_at)}  ${m.product_name}  ${MUTATION_LABELS[m.type] || m.type}  ${m.quantity > 0 ? '+' : ''}${m.quantity}  → ${m.qty_after}`
      ),
    ];
    try { await Share.share({ message: lines.join('\n') }); } catch {}
  };

  const periods: { key: MutPeriod; label: string }[] = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'week', label: '7 Hari' },
    { key: 'month', label: 'Bulan Ini' },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* Period filter */}
      <View style={st.subFilter}>
        {periods.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[st.sortChip, period === p.key && st.sortChipActive]}
            onPress={() => { setPeriod(p.key); load(p.key, search); }}
          >
            <Text style={[st.sortChipText, period === p.key && st.sortChipTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={st.sortChip} onPress={handleExport}>
          <Ionicons name="share-outline" size={14} color="#347385" />
          <Text style={st.sortChipText}>Export</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={st.searchBar}>
        <Ionicons name="search-outline" size={16} color="#9CA3AF" />
        <TextInput
          style={st.searchInput}
          placeholder="Cari produk..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={(q) => { setSearch(q); load(period, q); }}
        />
      </View>

      {loading ? (
        <View style={st.centered}><ActivityIndicator size="large" color="#347385" /></View>
      ) : (
        <FlatList
          data={mutations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 8 }}
          ListEmptyComponent={
            <View style={st.centered}>
              <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Tidak ada mutasi stok</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={st.mutRow}>
              <View style={[st.mutTypeIcon, { backgroundColor: (MUTATION_COLORS[item.type] || '#347385') + '18' }]}>
                <Ionicons
                  name={item.type === 'sale' || item.type === 'adjustment_out' ? 'arrow-down' : 'arrow-up'}
                  size={14}
                  color={MUTATION_COLORS[item.type] || '#347385'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.mutProduct}>{item.product_name}</Text>
                <Text style={st.mutMeta}>{MUTATION_LABELS[item.type] || item.type} · {item.created_by_name}</Text>
                {item.reason && <Text style={st.mutReason}>{item.reason}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[st.mutQty, { color: MUTATION_COLORS[item.type] || '#347385' }]}>
                  {item.quantity > 0 ? '+' : ''}{item.quantity}
                </Text>
                <Text style={st.mutAfter}>→ {item.qty_after}</Text>
                <Text style={st.mutTime}>{isoShort(item.created_at)}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

// ─── Tab 3: Top Products ──────────────────────────────────────────────────────

function TopProductsTab({ branchId }: { branchId: string }) {
  const [topPeriod, setTopPeriod] = useState<TopPeriod>('week');
  const [sortBy, setSortBy] = useState<'qty' | 'revenue'>('qty');
  const [products, setProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: TopPeriod) => {
    setLoading(true);
    try {
      const range = p === 'week' ? weekRange() : monthRange();
      const data = await getTopProducts(range.from, range.to, branchId, 30);
      setProducts(data);
    } catch {} finally { setLoading(false); }
  }, [branchId]);

  useFocusEffect(useCallback(() => { load(topPeriod); }, [branchId]));

  const sorted = [...products].sort((a, b) => sortBy === 'qty' ? b.qty_sold - a.qty_sold : b.revenue - a.revenue);
  const maxVal = Math.max(...sorted.map((p) => sortBy === 'qty' ? p.qty_sold : p.revenue), 1);

  return (
    <ScrollView contentContainerStyle={st.tabScroll}>
      <View style={st.subFilter}>
        {(['week', 'month'] as TopPeriod[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[st.sortChip, topPeriod === p && st.sortChipActive]}
            onPress={() => { setTopPeriod(p); load(p); }}
          >
            <Text style={[st.sortChipText, topPeriod === p && st.sortChipTextActive]}>
              {p === 'week' ? '7 Hari' : 'Bulan Ini'}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        {(['qty', 'revenue'] as ('qty' | 'revenue')[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[st.sortChip, sortBy === s && st.sortChipActive]}
            onPress={() => setSortBy(s)}
          >
            <Text style={[st.sortChipText, sortBy === s && st.sortChipTextActive]}>
              {s === 'qty' ? 'Qty' : 'Revenue'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={st.centered}><ActivityIndicator size="large" color="#347385" /></View>
      ) : (
        <View style={st.card}>
          <Text style={st.cardTitle}>
            Top {sorted.length} Produk · {topPeriod === 'week' ? '7 Hari' : 'Bulan Ini'}
          </Text>
          {!sorted.length ? (
            <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>Belum ada data penjualan</Text>
          ) : (
            sorted.map((p, i) => {
              const val = sortBy === 'qty' ? p.qty_sold : p.revenue;
              const pct = (val / maxVal) * 100;
              return (
                <View key={p.product_id} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: i < 3 ? '#F59E0B' : '#6B7280', width: 20 }}>#{i + 1}</Text>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#111827' }}>{p.product_name}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#347385' }}>
                      {sortBy === 'qty' ? `${fmtNumber(p.qty_sold)} pcs` : fmtCurrency(p.revenue)}
                    </Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: '#F3F4F6', borderRadius: 3 }}>
                    <View style={{ height: 6, width: `${pct}%` as any, backgroundColor: i < 3 ? '#F59E0B' : '#347385', borderRadius: 3 }} />
                  </View>
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                    {sortBy === 'qty' ? fmtCurrency(p.revenue) : `${fmtNumber(p.qty_sold)} pcs terjual`}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const TABS = ['Nilai Stok', 'Mutasi', 'Terlaris'];

export default function StockReportScreen() {
  const insets = useSafeAreaInsets();
  const { currentBranch } = useAuth();
  const branchId = currentBranch?.id ?? '';
  const [activeTab, setActiveTab] = useState(0);

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={st.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={st.topBarTitle}>Laporan Stok</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={st.tabBar}>
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={i}
            style={[st.tabBtn, activeTab === i && st.tabBtnActive]}
            onPress={() => setActiveTab(i)}
          >
            <Text style={[st.tabBtnText, activeTab === i && st.tabBtnTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 0 && <StockValueTab branchId={branchId} />}
      {activeTab === 1 && <MutationsTab branchId={branchId} />}
      {activeTab === 2 && <TopProductsTab branchId={branchId} />}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  tabBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#347385' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  tabBtnTextActive: { color: '#347385' },

  tabScroll: { padding: 14, gap: 12, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 48 },

  totalCard: {
    backgroundColor: '#347385', borderRadius: 14, padding: 16, gap: 4,
    shadowColor: '#347385', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  totalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  totalValue: { fontSize: 24, fontWeight: '800', color: '#fff' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginTop: 4 },
  exportBtnText: { fontSize: 12, fontWeight: '600', color: '#347385' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 },

  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  sortChipActive: { backgroundColor: '#347385' },
  sortChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  sortChipTextActive: { color: '#fff' },

  productRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  productName: { fontSize: 13, fontWeight: '600', color: '#111827' },
  productMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  productValue: { fontSize: 13, fontWeight: '700', color: '#111827' },
  productStock: { fontSize: 12, color: '#22C55E' },

  subFilter: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 14, marginVertical: 8,
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: '#111827' },

  mutRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  mutTypeIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  mutProduct: { fontSize: 13, fontWeight: '700', color: '#111827' },
  mutMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  mutReason: { fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginTop: 1 },
  mutQty: { fontSize: 14, fontWeight: '800' },
  mutAfter: { fontSize: 11, color: '#9CA3AF' },
  mutTime: { fontSize: 10, color: '#D1D5DB', marginTop: 2 },
});
