/**
 * Stok Gudang Pusat
 * Daftar produk di gudang dengan search, stats, badge kritis
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabletCenteredView } from "@/components/TabletCenteredView";
import {
  getWarehouses,
  getWarehouseStock,
  type WarehouseStockRow,
} from "@/lib/warehouseQueries";
import type { Warehouse } from "@/types";

// ─── Header ──────────────────────────────────────────────────────────────────

interface WarehouseHeaderProps {
  warehouseName: string | undefined;
}

function WarehouseHeader({ warehouseName }: WarehouseHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={headerSt.container}>
      <View style={[headerSt.inner, { paddingTop: insets.top + 12 }]}>
        <View style={headerSt.iconWrap}>
          <Ionicons name="cube" size={20} color="#347385" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={headerSt.title}>Stok Gudang Pusat</Text>
          {warehouseName ? <Text style={headerSt.sub}>{warehouseName}</Text> : null}
        </View>
        <TouchableOpacity
          style={headerSt.poBtn}
          onPress={() => router.push('/(staff-pusat)/purchase' as any)}
          activeOpacity={0.75}
        >
          <Ionicons name="cart-outline" size={16} color="#fff" />
          <Text style={headerSt.poBtnText}>Purchase Order</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const headerSt = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5F4F7",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EEF8FA",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#A9DFE9",
  },
  title: { fontSize: 16, fontWeight: "700", color: "#111827" },
  sub: { fontSize: 12, color: "#6B7280", marginTop: 1 },
  poBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#347385",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  poBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },
});

// ─── Stats Row ───────────────────────────────────────────────────────────────

interface StatsRowProps {
  totalProducts: number;
  totalStock: number;
  criticalCount: number;
}

function StatsRow({ totalProducts, totalStock, criticalCount }: StatsRowProps) {
  return (
    <View style={statSt.row}>
      <View style={[statSt.card, { backgroundColor: "#EEF8FA" }]}>
        <Ionicons name="cube-outline" size={18} color="#347385" />
        <Text style={[statSt.value, { color: "#347385" }]}>{totalProducts}</Text>
        <Text style={statSt.label}>Total Produk</Text>
      </View>
      <View style={[statSt.card, { backgroundColor: "#F0FDF4" }]}>
        <Ionicons name="layers-outline" size={18} color="#22C55E" />
        <Text style={[statSt.value, { color: "#22C55E" }]}>{totalStock}</Text>
        <Text style={statSt.label}>Total Stok</Text>
      </View>
      <View style={[statSt.card, { backgroundColor: "#FEF2F2" }]}>
        <Ionicons name="warning-outline" size={18} color="#EF4444" />
        <Text style={[statSt.value, { color: "#EF4444" }]}>{criticalCount}</Text>
        <Text style={statSt.label}>Stok Kritis</Text>
      </View>
    </View>
  );
}

const statSt = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingVertical: 12 },
  card: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  value: { fontSize: 18, fontWeight: "800" },
  label: { fontSize: 10, color: "#718096", textAlign: "center" },
});

// ─── Product Card ─────────────────────────────────────────────────────────────

interface ProductCardProps {
  item: WarehouseStockRow;
}

function ProductCard({ item }: ProductCardProps) {
  const isCritical = item.stock <= item.min_stock;
  const stockColor = isCritical ? "#EF4444" : "#22C55E";

  return (
    <View style={[cardSt.card, isCritical && cardSt.cardCritical]}>
      <View style={[cardSt.avatar, { backgroundColor: isCritical ? "#FEF2F2" : "#EEF8FA" }]}>
        <Text style={[cardSt.avatarText, { color: isCritical ? "#EF4444" : "#347385" }]}>
          {item.product_name.substring(0, 2).toUpperCase()}
        </Text>
      </View>

      <View style={cardSt.info}>
        <Text style={cardSt.name} numberOfLines={1}>{item.product_name}</Text>
        <View style={cardSt.metaRow}>
          {item.category_name ? (
            <Text style={cardSt.category}>{item.category_name}</Text>
          ) : null}
          {item.barcode ? (
            <Text style={cardSt.barcode}>{item.barcode}</Text>
          ) : null}
        </View>
        <Text style={cardSt.unit}>{item.unit ?? "pcs"} · min {item.min_stock}</Text>
      </View>

      <View style={cardSt.right}>
        <Text style={[cardSt.stock, { color: stockColor }]}>{item.stock}</Text>
        <Text style={cardSt.stockUnit}>{item.unit ?? "pcs"}</Text>
        {isCritical && (
          <View style={cardSt.critBadge}>
            <Text style={cardSt.critBadgeText}>Kritis</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const cardSt = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardCritical: { borderColor: "#FECACA", backgroundColor: "#FFFAFA" },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "800" },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: "600", color: "#111827" },
  metaRow: { flexDirection: "row", gap: 8, marginTop: 2, flexWrap: "wrap" },
  category: { fontSize: 11, color: "#6B7280" },
  barcode: { fontSize: 11, color: "#A0AEC0" },
  unit: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  right: { alignItems: "flex-end", gap: 2 },
  stock: { fontSize: 22, fontWeight: "800" },
  stockUnit: { fontSize: 10, color: "#9CA3AF" },
  critBadge: {
    backgroundColor: "#FEF2F2",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#FECACA",
    marginTop: 2,
  },
  critBadgeText: { fontSize: 10, fontWeight: "700", color: "#EF4444" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WarehouseStockScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [allItems, setAllItems] = useState<WarehouseStockRow[]>([]);
  const [activeWarehouse, setActiveWarehouse] = useState<Warehouse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'all' | 'low' | 'empty'>('all');

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const warehouses = await getWarehouses();
      const wList = warehouses as Warehouse[];
      const warehouse = wList.find((w) => w.is_active) ?? wList[0] ?? null;
      setActiveWarehouse(warehouse);

      if (warehouse) {
        const items = await getWarehouseStock(warehouse.id);
        setAllItems(items);
      }
    } catch (e) {
      console.error("[WarehouseStockScreen] fetchData error:", e);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleSearchChange = (text: string) => {
    setSearchInput(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(text), 300);
  };

  // Stats from full list
  const totalProducts = allItems.length;
  const totalStock = allItems.reduce((s, p) => s + p.stock, 0);
  const lowCount = allItems.filter((p) => p.stock > 0 && p.stock <= p.min_stock).length;
  const emptyCount = allItems.filter((p) => p.stock === 0).length;
  const criticalCount = lowCount + emptyCount;

  // Tab + search filter
  const filtered = useMemo(() => {
    let list = allItems;
    if (activeTab === 'low') list = allItems.filter((p) => p.stock > 0 && p.stock <= p.min_stock).sort((a, b) => a.stock - b.stock);
    else if (activeTab === 'empty') list = allItems.filter((p) => p.stock === 0);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (p) =>
        p.product_name.toLowerCase().includes(q) ||
        (p.barcode?.toLowerCase().includes(q) ?? false)
    );
  }, [allItems, search, activeTab]);

  const numColumns = isTablet ? 2 : 1;

  const renderItem = ({ item, index }: { item: WarehouseStockRow; index: number }) => {
    if (isTablet) {
      const isRight = index % 2 === 1;
      return (
        <View style={{ flex: 1, paddingLeft: isRight ? 4 : 0, paddingRight: isRight ? 0 : 4 }}>
          <ProductCard item={item} />
        </View>
      );
    }
    return <ProductCard item={item} />;
  };

  return (
    <View style={styles.container}>
      <WarehouseHeader warehouseName={activeWarehouse?.name} />

      <TabletCenteredView maxWidth={960} style={{ paddingHorizontal: 16 }}>
        {/* Stats */}
        <StatsRow
          totalProducts={totalProducts}
          totalStock={totalStock}
          criticalCount={criticalCount}
        />

        {/* Tab filter */}
        <View style={styles.tabRow}>
          {([
            { key: 'all', label: 'Semua', count: totalProducts },
            { key: 'low', label: 'Hampir Habis', count: lowCount, color: '#F59E0B' },
            { key: 'empty', label: 'Habis', count: emptyCount, color: '#EF4444' },
          ] as const).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
              <View style={[styles.tabBadge, activeTab === tab.key && { backgroundColor: ('color' in tab ? tab.color : '#347385') }]}>
                <Text style={styles.tabBadgeText}>{tab.count}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color="#A0AEC0" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama produk atau barcode..."
            value={searchInput}
            onChangeText={handleSearchChange}
            placeholderTextColor="#A0AEC0"
          />
          {searchInput.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchInput("");
                setSearch("");
              }}
            >
              <Ionicons name="close-circle" size={18} color="#A0AEC0" />
            </TouchableOpacity>
          )}
        </View>

        {/* Count label */}
        {!loading && (
          <Text style={styles.resultLabel}>
            {filtered.length} produk{search ? ` untuk "${search}"` : ""}
          </Text>
        )}

        {/* List */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#347385" />
            <Text style={styles.loadingText}>Memuat stok gudang...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="cube-outline" size={56} color="#CBD5E0" />
            <Text style={styles.emptyTitle}>Tidak ada produk ditemukan</Text>
            {search ? (
              <Text style={styles.emptyText}>Coba ubah kata kunci pencarian</Text>
            ) : null}
          </View>
        ) : (
          <FlatList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={(item) => item.product_id}
            key={isTablet ? "two-col" : "one-col"}
            numColumns={numColumns}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 24 },
            ]}
            columnWrapperStyle={isTablet ? { gap: 0 } : undefined}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={["#347385"]}
                tintColor="#347385"
              />
            }
          />
        )}
      </TabletCenteredView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7FAFC" },

  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  tabActive: { borderColor: '#347385', backgroundColor: '#EEF8FA' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#347385' },
  tabBadge: {
    backgroundColor: '#9CA3AF', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center',
  },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    height: 44,
    marginBottom: 8,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: "#1A202C" },

  resultLabel: { fontSize: 12, color: "#9CA3AF", marginBottom: 8 },

  listContent: { paddingTop: 4 },

  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingTop: 60,
  },
  loadingText: { fontSize: 13, color: "#9CA3AF" },

  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
    gap: 10,
  },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#6B7280" },
  emptyText: { fontSize: 13, color: "#9CA3AF" },
});
