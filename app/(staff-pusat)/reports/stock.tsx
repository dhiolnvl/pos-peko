/**
 * Laporan Stok - Staff Pusat
 * Filter cabang, tampil stok produk per cabang dengan badge kritis/rendah
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, FlatList, ListRenderItemInfo,
  useWindowDimensions, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import {
  fetchAllBranches, getCrossStockTable, getBranchStockSummaries,
  fmtCurrency, type ProductCrossStock, type BranchStockSummary,
} from '@/lib/ownerQueries';

interface Branch { id: string; name: string; is_active: boolean }
type StockFilter = 'all' | 'low' | 'empty';

const BRANCH_COLORS = ['#347385', '#7C3AED', '#D97706', '#059669', '#DC2626', '#0284C7', '#9333EA'];

const STOCK_FILTERS: { key: StockFilter; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'all',   label: 'Semua',       icon: 'layers-outline',       color: '#347385' },
  { key: 'low',   label: 'Stok Rendah', icon: 'warning-outline',      color: '#D97706' },
  { key: 'empty', label: 'Habis',       icon: 'close-circle-outline', color: '#DC2626' },
];

// ─── Branch summary card ──────────────────────────────────────────────────────

function BranchCard({
  summary, color, isSelected, onPress,
}: {
  summary: BranchStockSummary;
  color: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const hasAlert = summary.out_of_stock_count > 0 || summary.low_stock_count > 0;
  return (
    <TouchableOpacity
      style={[bStyles.card, isSelected && { borderColor: color, backgroundColor: color + '08' }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={bStyles.top}>
        <View style={[bStyles.dot, { backgroundColor: color }]} />
        <Text style={bStyles.name} numberOfLines={2}>{summary.branch_name}</Text>
        {isSelected && (
          <View style={[bStyles.checkDot, { backgroundColor: color }]}>
            <Ionicons name="checkmark" size={9} color="#fff" />
          </View>
        )}
      </View>
      <Text style={[bStyles.value, { color }]}>{fmtCurrency(summary.total_stock_value)}</Text>
      <View style={bStyles.statusRow}>
        {summary.out_of_stock_count > 0 && (
          <View style={[bStyles.statusPill, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="close-circle" size={10} color="#DC2626" />
            <Text style={[bStyles.statusText, { color: '#DC2626' }]}>{summary.out_of_stock_count} habis</Text>
          </View>
        )}
        {summary.low_stock_count > 0 && (
          <View style={[bStyles.statusPill, { backgroundColor: '#FFFBEB' }]}>
            <Ionicons name="warning" size={10} color="#D97706" />
            <Text style={[bStyles.statusText, { color: '#D97706' }]}>{summary.low_stock_count} rendah</Text>
          </View>
        )}
        {!hasAlert && (
          <View style={[bStyles.statusPill, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="checkmark-circle" size={10} color="#16A34A" />
            <Text style={[bStyles.statusText, { color: '#16A34A' }]}>Aman</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const bStyles = StyleSheet.create({
  card: {
    width: 140,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5 },
      android: { elevation: 2 },
    }),
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 3, flexShrink: 0 },
  name: { flex: 1, fontSize: 12, fontWeight: '700', color: '#374151', lineHeight: 16 },
  checkDot: {
    width: 16, height: 16, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1,
  },
  value: { fontSize: 13, fontWeight: '800' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 3,
  },
  statusText: { fontSize: 10, fontWeight: '700' },
});

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product, branches, activeBranchId, branchColors,
}: {
  product: ProductCrossStock;
  branches: Branch[];
  activeBranchId: string | null;
  branchColors: Record<string, string>;
}) {
  const displayBranches = activeBranchId
    ? branches.filter((b) => b.id === activeBranchId)
    : branches;

  const hasEmpty = displayBranches.some((b) => (product.stocks[b.id] ?? 0) === 0);
  const hasLow = displayBranches.some((b) => {
    const s = product.stocks[b.id] ?? 0;
    return s > 0 && s <= product.min_stock;
  });

  const statusColor = hasEmpty ? '#DC2626' : hasLow ? '#D97706' : '#16A34A';
  const statusBg = hasEmpty ? '#FEF2F2' : hasLow ? '#FFFBEB' : '#F0FDF4';
  const statusIcon: keyof typeof Ionicons.glyphMap = hasEmpty
    ? 'close-circle' : hasLow ? 'warning' : 'checkmark-circle';
  const statusLabel = hasEmpty ? 'Habis' : hasLow ? 'Rendah' : 'Aman';

  return (
    <View style={pcStyles.card}>
      <View style={pcStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={pcStyles.productName} numberOfLines={1}>{product.product_name}</Text>
          <Text style={pcStyles.categoryName}>{product.category_name}</Text>
        </View>
        <View style={[pcStyles.statusBadge, { backgroundColor: statusBg }]}>
          <Ionicons name={statusIcon} size={11} color={statusColor} />
          <Text style={[pcStyles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={pcStyles.branchList}>
        {displayBranches.map((b) => {
          const stock = product.stocks[b.id] ?? 0;
          const isEmpty = stock === 0;
          const isLow = stock > 0 && stock <= product.min_stock;
          const numColor = isEmpty ? '#DC2626' : isLow ? '#D97706' : '#111827';
          const chipBg = isEmpty ? '#FEF2F2' : isLow ? '#FFFBEB' : '#F9FAFB';
          const bColor = branchColors[b.id] ?? '#347385';

          return (
            <View key={b.id} style={[pcStyles.branchChip, { backgroundColor: chipBg }]}>
              <View style={[pcStyles.branchDot, { backgroundColor: bColor }]} />
              <Text style={pcStyles.branchName} numberOfLines={1}>{b.name}</Text>
              <View style={pcStyles.stockRight}>
                <Text style={[pcStyles.stockNum, { color: numColor }]}>{stock}</Text>
                <Text style={pcStyles.minText}>/ {product.min_stock}</Text>
                {isEmpty && <Ionicons name="close-circle" size={11} color="#DC2626" />}
                {isLow && !isEmpty && <Ionicons name="warning" size={11} color="#D97706" />}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const pcStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  productName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  categoryName: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  branchList: { gap: 6 },
  branchChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  branchDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  branchName: { flex: 1, fontSize: 11, fontWeight: '600', color: '#6B7280' },
  stockRight: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  stockNum: { fontSize: 15, fontWeight: '800', lineHeight: 18 },
  minText: { fontSize: 10, color: '#9CA3AF' },
});

// ─── Alert banner ─────────────────────────────────────────────────────────────

function AlertBanner({ totalEmpty, totalLow }: { totalEmpty: number; totalLow: number }) {
  if (totalEmpty === 0 && totalLow === 0) return null;
  return (
    <View style={alStyles.bar}>
      {totalEmpty > 0 && (
        <View style={alStyles.item}>
          <View style={[alStyles.iconBox, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="close-circle" size={15} color="#DC2626" />
          </View>
          <View>
            <Text style={alStyles.num}>{totalEmpty}</Text>
            <Text style={alStyles.label}>Item Habis</Text>
          </View>
        </View>
      )}
      {totalEmpty > 0 && totalLow > 0 && <View style={alStyles.sep} />}
      {totalLow > 0 && (
        <View style={alStyles.item}>
          <View style={[alStyles.iconBox, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="warning" size={15} color="#D97706" />
          </View>
          <View>
            <Text style={[alStyles.num, { color: '#D97706' }]}>{totalLow}</Text>
            <Text style={alStyles.label}>Stok Rendah</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const alStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#FED7AA',
    paddingHorizontal: 16, paddingVertical: 12, gap: 16,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  num: { fontSize: 16, fontWeight: '800', color: '#DC2626', lineHeight: 19 },
  label: { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },
  sep: { width: 1, height: 28, backgroundColor: '#E5E7EB' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function StaffPusatStockReport() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 768;

  const PAGE_SIZE = 20;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [crossStock, setCrossStock] = useState<ProductCrossStock[]>([]);
  const [stockSummaries, setStockSummaries] = useState<BranchStockSummary[]>([]);
  const [loadingPhase, setLoadingPhase] = useState<'all' | 'products' | 'done'>('all');
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const flatListRef = useRef<FlatList>(null);

  const branchColors = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach((b, i) => { map[b.id] = BRANCH_COLORS[i % BRANCH_COLORS.length]; });
    return map;
  }, [branches]);

  const load = useCallback(async () => {
    setLoadingPhase('all');
    setCrossStock([]);
    try {
      const allBranches = await fetchAllBranches() as Branch[];
      const activeBranches = allBranches.filter((b) => b.is_active);
      setBranches(activeBranches);
      const branchIds = activeBranches.map((b) => b.id);
      const summaries = await getBranchStockSummaries(branchIds);
      setStockSummaries(summaries);
      setLoadingPhase('products');
      const cross = await getCrossStockTable(branchIds);
      setCrossStock(cross);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPhase('done');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleBranch = useCallback((id: string) => {
    setActiveBranchId((prev) => (prev === id ? null : id));
    setVisibleCount(PAGE_SIZE);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const filtered = useMemo(() => {
    return crossStock.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.product_name.toLowerCase().includes(q) && !p.category_name.toLowerCase().includes(q)) return false;
      }
      const checkBranches = activeBranchId
        ? branches.filter((b) => b.id === activeBranchId)
        : branches;
      if (stockFilter === 'empty') return checkBranches.some((b) => (p.stocks[b.id] ?? 0) === 0);
      if (stockFilter === 'low') return checkBranches.some((b) => {
        const s = p.stocks[b.id] ?? 0;
        return s > 0 && s <= p.min_stock;
      });
      return true;
    });
  }, [crossStock, search, activeBranchId, branches, stockFilter]);

  const { totalLow, totalEmpty } = useMemo(() => ({
    totalLow: crossStock.reduce((acc, p) =>
      acc + branches.filter((b) => { const s = p.stocks[b.id] ?? 0; return s > 0 && s <= p.min_stock; }).length, 0),
    totalEmpty: crossStock.reduce((acc, p) =>
      acc + branches.filter((b) => (p.stocks[b.id] ?? 0) === 0).length, 0),
  }), [crossStock, branches]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filtered]);

  const visibleData = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const productRows = useMemo(() => {
    if (!isTablet) return visibleData.map((p) => [p]);
    const rows: ProductCrossStock[][] = [];
    for (let i = 0; i < visibleData.length; i += 2) {
      rows.push(visibleData.slice(i, i + 2));
    }
    return rows;
  }, [visibleData, isTablet]);

  const loadMore = useCallback(() => {
    if (visibleCount < filtered.length) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length));
    }
  }, [visibleCount, filtered.length]);

  const listHeader = useMemo(() => (
    <View style={styles.header}>
      {/* Branch filter cards */}
      {stockSummaries.length > 0 && (
        <View style={styles.branchSection}>
          <View style={styles.branchSectionHeader}>
            <Text style={styles.sectionLabel}>Filter Cabang</Text>
            {activeBranchId && (
              <TouchableOpacity style={styles.clearBtn} onPress={() => setActiveBranchId(null)}>
                <Ionicons name="close-circle" size={13} color="#347385" />
                <Text style={styles.clearBtnText}>Semua cabang</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.branchScrollWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.branchScrollContent}
            >
              {stockSummaries.map((s, i) => (
                <BranchCard
                  key={s.branch_id}
                  summary={s}
                  color={BRANCH_COLORS[i % BRANCH_COLORS.length]}
                  isSelected={activeBranchId === s.branch_id}
                  onPress={() => toggleBranch(s.branch_id)}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Alert banner */}
      {loadingPhase === 'done' && (totalEmpty > 0 || totalLow > 0) && (
        <AlertBanner totalEmpty={totalEmpty} totalLow={totalLow} />
      )}

      {/* Filter chips */}
      <View style={styles.chipWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContent}
        >
          {STOCK_FILTERS.map((item) => {
            const active = stockFilter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.chip, active && { backgroundColor: item.color, borderColor: item.color }]}
                onPress={() => setStockFilter(item.key)}
              >
                <Ionicons name={item.icon} size={13} color={active ? '#fff' : '#6B7280'} />
                <Text style={[styles.chipText, active && { color: '#fff' }]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color="#9CA3AF" style={{ marginLeft: 12 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari produk atau kategori..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#9CA3AF"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')} style={{ paddingHorizontal: 12 }}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Count */}
      {loadingPhase === 'done' && (
        <Text style={styles.countText}>
          {filtered.length} produk{visibleCount < filtered.length ? ` · tampil ${visibleCount}` : ''}
          {activeBranchId
            ? ` · ${branches.find((b) => b.id === activeBranchId)?.name ?? ''}`
            : ' · semua cabang'}
        </Text>
      )}

      {loadingPhase === 'products' && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#347385" />
          <Text style={styles.loadingText}>Memuat produk...</Text>
        </View>
      )}

      {loadingPhase === 'done' && filtered.length === 0 && (
        <View style={styles.centered}>
          <View style={styles.emptyIcon}>
            <Ionicons name="cube-outline" size={38} color="#D1D5DB" />
          </View>
          <Text style={styles.emptyTitle}>Tidak ada produk</Text>
          <Text style={styles.emptySub}>
            {search ? 'Coba kata kunci lain' : 'Tidak ada produk yang cocok'}
          </Text>
          {(search || stockFilter !== 'all' || activeBranchId) && (
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() => { setSearch(''); setStockFilter('all'); setActiveBranchId(null); }}
            >
              <Text style={styles.resetBtnText}>Reset Filter</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  ), [
    stockSummaries, activeBranchId, loadingPhase, totalEmpty, totalLow,
    stockFilter, search, filtered.length, visibleCount, branches,
    toggleBranch,
  ]);

  const renderRow = useCallback(({ item: row }: ListRenderItemInfo<ProductCrossStock[]>) => (
    <View style={styles.gridRow}>
      {row.map((p) => (
        <ProductCard
          key={p.product_id}
          product={p}
          branches={branches}
          activeBranchId={activeBranchId}
          branchColors={branchColors}
        />
      ))}
      {isTablet && row.length === 1 && <View style={{ flex: 1 }} />}
    </View>
  ), [branches, activeBranchId, branchColors, isTablet]);

  const listFooter = useMemo(() => {
    if (visibleCount >= filtered.length || filtered.length === 0) return null;
    return (
      <View style={styles.footerLoad}>
        <ActivityIndicator size="small" color="#347385" />
        <Text style={styles.footerLoadText}>Memuat lebih banyak...</Text>
      </View>
    );
  }, [visibleCount, filtered.length]);

  return (
    <View style={styles.root}>
      <OwnerPageHeader
        title="Laporan Stok"
        subtitle={loadingPhase === 'done' ? `${crossStock.length} produk` : 'Memuat...'}
        onBack={() => router.back()}
      />

      {loadingPhase === 'all' ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#347385" />
          <Text style={styles.loadingText}>Memuat data cabang...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={productRows}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderRow}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          removeClippedSubviews
          maxToRenderPerBatch={6}
          windowSize={8}
          initialNumToRender={8}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },

  listContent: { paddingBottom: 0 },

  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 10,
  },

  centered: { paddingTop: 56, alignItems: 'center', gap: 12 },
  loadingText: { color: '#9CA3AF', fontSize: 14 },

  branchSection: { gap: 8 },
  branchSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  branchScrollWrap: { height: 118, justifyContent: 'center' },
  branchScrollContent: { gap: 10, alignItems: 'center' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  clearBtnText: { fontSize: 12, fontWeight: '600', color: '#347385' },

  chipWrap: { height: 44, justifyContent: 'center' },
  chipContent: { paddingHorizontal: 0, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  chipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  searchInput: { flex: 1, paddingVertical: 12, paddingRight: 4, fontSize: 14, color: '#111827' },
  countText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },

  gridRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, width: '100%' },

  footerLoad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16,
  },
  footerLoadText: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },

  emptyIcon: {
    width: 76, height: 76, borderRadius: 22,
    backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 32 },
  resetBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#EEF8FA', borderRadius: 10 },
  resetBtnText: { fontSize: 13, fontWeight: '700', color: '#347385' },
});
