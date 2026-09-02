/**
 * Stok Cabang — Staff Pusat
 * Pantau stok semua produk di setiap cabang
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { TabletCenteredView } from '@/components/TabletCenteredView';

interface Branch {
  id: string;
  name: string;
}

interface BranchProduct {
  id: string;
  product_id: string;
  product_name: string;
  product_unit: string | null;
  category_name: string | null;
  stock: number;
  min_stock: number;
  price_override: number | null;
}

function formatCurrency(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

function StockBadge({ stock, minStock }: { stock: number; minStock: number }) {
  if (stock <= 0) {
    return (
      <View style={[styles.stockBadge, { backgroundColor: '#FEE2E2' }]}>
        <Text style={[styles.stockBadgeText, { color: '#DC2626' }]}>Habis</Text>
      </View>
    );
  }
  if (stock <= minStock) {
    return (
      <View style={[styles.stockBadge, { backgroundColor: '#FFFBEB' }]}>
        <Text style={[styles.stockBadgeText, { color: '#D97706' }]}>Menipis</Text>
      </View>
    );
  }
  return (
    <View style={[styles.stockBadge, { backgroundColor: '#F0FDF4' }]}>
      <Text style={[styles.stockBadgeText, { color: '#16A34A' }]}>Aman</Text>
    </View>
  );
}

export default function BranchStockScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [products, setProducts] = useState<BranchProduct[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'empty'>('all');
  const [sort, setSort] = useState<'stock_desc' | 'stock_asc' | 'name_asc'>('stock_desc');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadBranches = useCallback(async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (!error && data && data.length > 0) {
      setBranches(data);
      setSelectedBranch((prev) => prev ?? data[0]);
    }
  }, []);

  const loadProducts = useCallback(async (branchId: string) => {
    try {
      const { data, error } = await supabase
        .from('branch_products')
        .select(`
          id, product_id, stock, min_stock, price_override,
          products ( name, unit, price, categories ( name ) )
        `)
        .eq('branch_id', branchId)
        .order('stock', { ascending: true });

      if (error) throw error;

      setProducts(
        (data ?? []).map((bp: any) => ({
          id: bp.id,
          product_id: bp.product_id,
          product_name: bp.products?.name ?? '-',
          product_unit: bp.products?.unit ?? null,
          category_name: bp.products?.categories?.name ?? null,
          stock: bp.stock ?? 0,
          min_stock: bp.min_stock ?? 0,
          price_override: bp.price_override ?? bp.products?.price ?? null,
        }))
      );
    } catch (e: any) {
      console.error('[BranchStock] load error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBranches();
    }, [loadBranches])
  );

  useFocusEffect(
    useCallback(() => {
      if (!selectedBranch) return;
      setLoading(true);
      loadProducts(selectedBranch.id);
    }, [selectedBranch, loadProducts])
  );

  const filtered = products
    .filter((p) => {
      const matchSearch =
        !search || p.product_name.toLowerCase().includes(search.toLowerCase());
      const matchFilter =
        filter === 'all' ||
        (filter === 'empty' && p.stock <= 0) ||
        (filter === 'low' && p.stock > 0 && p.stock <= p.min_stock);
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (sort === 'stock_desc') return b.stock - a.stock;
      if (sort === 'stock_asc') return a.stock - b.stock;
      return a.product_name.localeCompare(b.product_name);
    });

  const emptyCount = products.filter((p) => p.stock <= 0).length;
  const lowCount = products.filter((p) => p.stock > 0 && p.stock <= p.min_stock).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#347385" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Stok Cabang</Text>
          <Text style={styles.headerSub}>Pantau stok semua cabang</Text>
        </View>
      </View>

      {/* Pilih Cabang */}
      <View style={{ height: 52, justifyContent: 'center' }}>
        <FlatList
          horizontal
          data={branches}
          keyExtractor={(b) => b.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
          renderItem={({ item }) => {
            const active = selectedBranch?.id === item.id;
            return (
              <TouchableOpacity
                style={[styles.branchChip, active && styles.branchChipActive]}
                onPress={() => {
                  setSelectedBranch(item);
                  setSearch('');
                  setFilter('all');
                }}
              >
                <Text style={[styles.branchChipText, active && styles.branchChipTextActive]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <TabletCenteredView maxWidth={860} style={{ flex: 1 }}>
        {/* Summary + Search */}
        <View style={styles.toolRow}>
          <View style={[styles.searchBox, isTablet && { flex: 1 }]}>
            <Ionicons name="search-outline" size={16} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari produk..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter Status */}
        <View style={{ height: 44, justifyContent: 'center' }}>
          <FlatList
            horizontal
            data={[
              { key: 'all', label: `Semua (${products.length})` },
              { key: 'empty', label: `Habis (${emptyCount})` },
              { key: 'low', label: `Menipis (${lowCount})` },
            ]}
            keyExtractor={(i) => i.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
            renderItem={({ item }) => {
              const active = filter === item.key;
              return (
                <TouchableOpacity
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(item.key as any)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Sort */}
        <View style={{ height: 44, justifyContent: 'center' }}>
          <FlatList
            horizontal
            data={[
              { key: 'stock_desc', label: 'Stok Terbanyak', icon: 'arrow-down' as const },
              { key: 'stock_asc', label: 'Stok Tersedikit', icon: 'arrow-up' as const },
              { key: 'name_asc', label: 'Nama A-Z', icon: 'text' as const },
            ]}
            keyExtractor={(i) => i.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
            renderItem={({ item }) => {
              const active = sort === item.key;
              return (
                <TouchableOpacity
                  style={[styles.sortChip, active && styles.sortChipActive]}
                  onPress={() => setSort(item.key as any)}
                >
                  <Ionicons name={item.icon} size={12} color={active ? '#fff' : '#6B7280'} />
                  <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#347385" />
            <Text style={styles.loadingText}>Memuat stok...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="cube-outline" size={52} color="#CBD5E0" />
            <Text style={styles.emptyTitle}>
              {products.length === 0 ? 'Belum ada produk di cabang ini' : 'Tidak ada produk yang cocok'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            numColumns={isTablet ? 2 : 1}
            key={isTablet ? 'tablet' : 'phone'}
            contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 24 }}
            columnWrapperStyle={isTablet ? { gap: 8 } : undefined}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  if (!selectedBranch) return;
                  setRefreshing(true);
                  loadProducts(selectedBranch.id);
                }}
                colors={['#347385']}
                tintColor="#347385"
              />
            }
            renderItem={({ item }) => (
              <View style={[styles.productCard, isTablet && { flex: 1 }]}>
                <View style={styles.productTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName} numberOfLines={2}>{item.product_name}</Text>
                    {item.category_name ? (
                      <Text style={styles.productCategory}>{item.category_name}</Text>
                    ) : null}
                  </View>
                  <StockBadge stock={item.stock} minStock={item.min_stock} />
                </View>
                <View style={styles.productBottom}>
                  <View style={styles.stockInfo}>
                    <Text style={styles.stockLabel}>Stok</Text>
                    <Text style={[
                      styles.stockValue,
                      item.stock <= 0 ? { color: '#DC2626' } : item.stock <= item.min_stock ? { color: '#D97706' } : { color: '#16A34A' }
                    ]}>
                      {item.stock} <Text style={styles.stockUnit}>{item.product_unit ?? 'pcs'}</Text>
                    </Text>
                  </View>
                  <View style={styles.stockInfo}>
                    <Text style={styles.stockLabel}>Min. Stok</Text>
                    <Text style={styles.stockValueMuted}>{item.min_stock} {item.product_unit ?? 'pcs'}</Text>
                  </View>
                  <View style={styles.stockInfo}>
                    <Text style={styles.stockLabel}>Harga</Text>
                    <Text style={styles.stockValueMuted}>{item.price_override != null ? formatCurrency(item.price_override) : '-'}</Text>
                  </View>
                </View>
              </View>
            )}
          />
        )}
      </TabletCenteredView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5F4F7',
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },

  branchChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  branchChipActive: { backgroundColor: '#347385', borderColor: '#347385' },
  branchChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  branchChipTextActive: { color: '#fff' },

  toolRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5F4F7',
    paddingHorizontal: 10,
    gap: 6,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#111827' },

  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: { backgroundColor: '#EEF8FA', borderColor: '#347385' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  filterChipTextActive: { color: '#347385' },

  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sortChipActive: { backgroundColor: '#347385', borderColor: '#347385' },
  sortChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  sortChipTextActive: { color: '#fff' },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: '#9CA3AF' },

  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 14, color: '#6B7280', fontWeight: '600' },

  productCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5F4F7',
    gap: 10,
  },
  productTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  productName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  productCategory: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  stockBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  stockBadgeText: { fontSize: 11, fontWeight: '700' },

  productBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  stockInfo: { alignItems: 'center', gap: 2 },
  stockLabel: { fontSize: 11, color: '#9CA3AF' },
  stockValue: { fontSize: 16, fontWeight: '700' },
  stockUnit: { fontSize: 11, fontWeight: '400' },
  stockValueMuted: { fontSize: 13, fontWeight: '600', color: '#374151' },
});
