/**
 * Stock Main Screen
 * Overview of all products with stock info, summary cards, and action buttons
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { StockHistorySheet } from "@/components/StockHistorySheet";
import { TabletCenteredView } from "@/components/TabletCenteredView";
import { BackofficeHeader } from "@/components/BackofficeHeader";

type StockFilter = "all" | "low" | "empty";
type StockSortBy = "name_asc" | "name_desc" | "stock_asc" | "stock_desc";

const SORT_OPTIONS: { value: StockSortBy; label: string }[] = [
  { value: "name_asc", label: "Nama A-Z" },
  { value: "name_desc", label: "Nama Z-A" },
  { value: "stock_asc", label: "Stok Terendah" },
  { value: "stock_desc", label: "Stok Tertinggi" },
];

const PAGE_SIZE = 30;

interface StockItem {
  id: string;
  name: string;
  unit: string | null;
  category_id: string | null;
  category_name: string | null;
  barcode: string | null;
  cost_price: number | null;
  min_stock: number;
  stock: number;
}

export default function StockScreen() {
  const insets = useSafeAreaInsets();
  const { currentBranch } = useAuthStore();

  // All items fetched from Supabase (full list for this branch)
  const [allItems, setAllItems] = useState<StockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<StockSortBy>("name_asc");
  const [showSort, setShowSort] = useState(false);
  const [page, setPage] = useState(1);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async () => {
    const branchId = currentBranch?.id;
    if (!branchId) return;

    const { data, error } = await supabase
      .from("branch_products")
      .select(`
        stock,
        min_stock,
        products!inner(
          id, name, unit, barcode, cost_price, category_id,
          categories(name)
        )
      `)
      .eq("branch_id", branchId)
      .eq("products.is_active", true);

    if (error) { console.error("[StockScreen]", error); return; }

    const rows: StockItem[] = (data ?? []).map((row: any) => ({
      id: row.products.id,
      name: row.products.name,
      unit: row.products.unit,
      category_id: row.products.category_id ?? null,
      category_name: row.products.categories?.name ?? null,
      barcode: row.products.barcode,
      cost_price: row.products.cost_price,
      min_stock: row.min_stock ?? 5,
      stock: row.stock ?? 0,
    }));

    setAllItems(rows);
  }, [currentBranch?.id]);

  const load = useCallback(async () => {
    setIsLoading(true);
    await fetchAll();
    setIsLoading(false);
  }, [fetchAll]);

  useEffect(() => { load(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  // Debounce search input
  const handleSearchChange = (text: string) => {
    setSearchInput(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(text);
      setPage(1);
    }, 300);
  };

  const handleFilterChange = (f: StockFilter) => {
    setFilter(f);
    setPage(1);
  };

  const handleCategoryChange = (catId: string | null) => {
    setSelectedCategoryId(catId);
    setPage(1);
  };

  const handleSortChange = (s: StockSortBy) => {
    setSortBy(s);
    setPage(1);
    setShowSort(false);
  };

  // Unique categories derived from full list
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of allItems) {
      if (item.category_id && item.category_name && !seen.has(item.category_id)) {
        seen.set(item.category_id, item.category_name);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  // Derived: filter + sort on full list
  const processedItems = useMemo(() => {
    let rows = allItems.filter((p) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode?.toLowerCase().includes(search.toLowerCase()) ?? false);

      const matchesFilter =
        filter === "all" ||
        (filter === "low" && p.stock > 0 && p.stock <= p.min_stock) ||
        (filter === "empty" && p.stock === 0);

      const matchesCategory =
        !selectedCategoryId || p.category_id === selectedCategoryId;

      return matchesSearch && matchesFilter && matchesCategory;
    });

    rows = [...rows].sort((a, b) => {
      switch (sortBy) {
        case "name_asc": return a.name.localeCompare(b.name);
        case "name_desc": return b.name.localeCompare(a.name);
        case "stock_asc": return a.stock - b.stock;
        case "stock_desc": return b.stock - a.stock;
        default: return 0;
      }
    });

    return rows;
  }, [allItems, search, filter, selectedCategoryId, sortBy]);

  // Paginated slice
  const pagedItems = useMemo(() => processedItems.slice(0, page * PAGE_SIZE), [processedItems, page]);
  const hasMore = pagedItems.length < processedItems.length;

  const handleLoadMore = () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    setPage((p) => p + 1);
    setIsLoadingMore(false);
  };

  // Summary computed from full allItems (not filtered)
  const activeItems = allItems;
  const totalStockValue = activeItems.reduce((sum, p) => sum + p.stock * (p.cost_price || 0), 0);
  const lowStockCount = activeItems.filter((p) => p.stock > 0 && p.stock <= p.min_stock).length;
  const emptyStockCount = activeItems.filter((p) => p.stock === 0).length;

  const getStockStatus = (item: StockItem) => {
    if (item.stock === 0) return "empty";
    if (item.stock <= item.min_stock) return "low";
    return "ok";
  };

  const openHistory = useCallback((productId: string) => {
    setSelectedProductId(productId);
    setHistoryVisible(true);
  }, []);

  const renderProduct = ({ item }: { item: StockItem }) => {
    const status = getStockStatus(item);
    return (
      <TouchableOpacity
        style={styles.productRow}
        onPress={() => openHistory(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.productAvatar}>
          <Text style={styles.productAvatarText}>
            {item.name.substring(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.productCategory} numberOfLines={1}>
            {item.category_name || "Tanpa Kategori"}
          </Text>
        </View>
        <View style={styles.stockInfo}>
          <Text style={[
            styles.stockQty,
            status === "empty" && styles.stockEmpty,
            status === "low" && styles.stockLow,
            status === "ok" && styles.stockOk,
          ]}>
            {item.stock}
          </Text>
          <Text style={styles.stockUnit}>{item.unit || "pcs"}</Text>
        </View>
        <View style={[styles.statusDot, styles[`dot_${status}`]]} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <BackofficeHeader
        title="Manajemen Stok"
        subtitle={`${activeItems.length} produk aktif`}
      />

      <TabletCenteredView maxWidth={900} style={{ paddingHorizontal: 16 }}>
        {/* Summary Cards */}
        <View style={styles.summaryContainer}>
          <View style={[styles.summaryCard, { backgroundColor: "#EEF8FA" }]}>
            <Ionicons name="cube" size={22} color="#347385" />
            <Text style={[styles.summaryValue, { color: "#347385" }]}>{activeItems.length}</Text>
            <Text style={styles.summaryLabel}>Total SKU</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: "#F0FDF4" }]}>
            <Ionicons name="cash" size={22} color="#22C55E" />
            <Text style={[styles.summaryValue, { color: "#22C55E" }]} numberOfLines={1}>
              {totalStockValue >= 1_000_000
                ? `${(totalStockValue / 1_000_000).toFixed(1)}jt`
                : `${(totalStockValue / 1_000).toFixed(0)}rb`}
            </Text>
            <Text style={styles.summaryLabel}>Nilai Stok</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: "#FFFBEB" }]}>
            <Ionicons name="warning" size={22} color="#F59E0B" />
            <Text style={[styles.summaryValue, { color: "#F59E0B" }]}>{lowStockCount}</Text>
            <Text style={styles.summaryLabel}>Stok Rendah</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: "#FEF2F2" }]}>
            <Ionicons name="close-circle" size={22} color="#EF4444" />
            <Text style={[styles.summaryValue, { color: "#EF4444" }]}>{emptyStockCount}</Text>
            <Text style={styles.summaryLabel}>Habis</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#347385" }]}
            onPress={() => router.push("/(backoffice)/stock/adjustment" as any)}
          >
            <Ionicons name="swap-vertical" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Penyesuaian</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#F59E0B" }]}
            onPress={() => router.push("/(backoffice)/stock/opname" as any)}
          >
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Stok Opname</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#7B61FF" }]}
            onPress={() => router.push("/(backoffice)/stock/incoming-transfers" as any)}
          >
            <Ionicons name="arrow-down-circle" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Transfer Masuk</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#22C55E" }]}
            onPress={() => router.push("/(backoffice)/stock/stock-request" as any)}
          >
            <Ionicons name="layers-outline" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Minta Stok</Text>
          </TouchableOpacity>
        </View>

        {/* Search + Sort */}
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#A0AEC0" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari produk..."
              value={searchInput}
              onChangeText={handleSearchChange}
              placeholderTextColor="#A0AEC0"
            />
            {searchInput.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchInput(""); setSearch(""); setPage(1); }}>
                <Ionicons name="close-circle" size={18} color="#A0AEC0" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.sortBtn, sortBy !== "name_asc" && styles.sortBtnActive]}
            onPress={() => setShowSort(true)}
          >
            <Ionicons
              name="swap-vertical-outline"
              size={20}
              color={sortBy !== "name_asc" ? "#347385" : "#6B7280"}
            />
          </TouchableOpacity>
        </View>

        {/* Filter + Category — satu baris horizontal scroll */}
        <View style={styles.chipsWrap}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
            keyExtractor={(item) => item.key}
            data={[
              { key: "f_all", label: "Semua", type: "filter" as const, value: "all" },
              { key: "f_low", label: "Rendah", type: "filter" as const, value: "low" },
              { key: "f_empty", label: "Habis", type: "filter" as const, value: "empty" },
              ...(categories.length > 0
                ? [
                    { key: "sep", label: "|", type: "sep" as const, value: "" },
                    ...categories.map((c) => ({ key: `c_${c.id}`, label: c.name, type: "cat" as const, value: c.id })),
                  ]
                : []),
            ]}
            renderItem={({ item }) => {
              if (item.type === "sep") {
                return <View style={styles.chipSep} />;
              }
              const isActive =
                item.type === "filter"
                  ? filter === item.value
                  : selectedCategoryId === item.value;
              const onPress = () => {
                if (item.type === "filter") handleFilterChange(item.value as StockFilter);
                else handleCategoryChange(item.value);
              };
              return (
                <TouchableOpacity
                  style={[styles.chip, isActive && styles.chipActive]}
                  onPress={onPress}
                >
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Product List */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#347385" />
          </View>
        ) : pagedItems.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="cube-outline" size={56} color="#CBD5E0" />
            <Text style={styles.emptyText}>Tidak ada produk</Text>
          </View>
        ) : (
          <FlatList
            data={pagedItems}
            renderItem={renderProduct}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              hasMore ? (
                <ActivityIndicator size="small" color="#347385" style={{ marginVertical: 16 }} />
              ) : null
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={["#347385"]}
              />
            }
          />
        )}

        {/* Stock History Bottom Sheet */}
        <StockHistorySheet
          productId={selectedProductId}
          visible={historyVisible}
          onClose={() => {
            setHistoryVisible(false);
            setSelectedProductId(null);
          }}
        />
      </TabletCenteredView>

      {/* Sort Modal */}
      <Modal
        visible={showSort}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSort(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSort(false)}
        >
          <View style={styles.sortModal}>
            <Text style={styles.sortModalTitle}>Urutkan</Text>
            {SORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.sortOption}
                onPress={() => handleSortChange(opt.value)}
              >
                <Ionicons
                  name={sortBy === opt.value ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={sortBy === opt.value ? "#347385" : "#9CA3AF"}
                />
                <Text style={[styles.sortOptionText, sortBy === opt.value && styles.sortOptionTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.sortCancelBtn} onPress={() => setShowSort(false)}>
              <Text style={styles.sortCancelText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7FAFC" },
  summaryContainer: {
    flexDirection: "row",
    paddingVertical: 12,
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  summaryValue: { fontSize: 16, fontWeight: "bold" },
  summaryLabel: { fontSize: 10, color: "#718096", textAlign: "center" },

  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingBottom: 12,
    gap: 8,
  },
  actionBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 40, fontSize: 14, color: "#1A202C" },
  sortBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sortBtnActive: { borderColor: "#347385", backgroundColor: "#EEF8FA" },

  chipsWrap: { height: 44, justifyContent: "center", marginBottom: 10 },
  chipsRow: { gap: 8, alignItems: "center" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipActive: { backgroundColor: "#347385", borderColor: "#347385" },
  chipText: { fontSize: 13, color: "#4A5568" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  chipSep: { width: 1, height: 20, backgroundColor: "#D1D5DB", marginHorizontal: 4, alignSelf: "center" },

  listContent: { paddingBottom: 20 },

  productRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  productAvatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#EEF8FA",
    justifyContent: "center",
    alignItems: "center",
  },
  productAvatarText: { fontSize: 15, fontWeight: "bold", color: "#347385" },
  productInfo: { flex: 1 },
  productName: { fontSize: 14, fontWeight: "600", color: "#1A202C" },
  productCategory: { fontSize: 12, color: "#718096", marginTop: 2 },
  stockInfo: { alignItems: "flex-end" },
  stockQty: { fontSize: 20, fontWeight: "bold" },
  stockUnit: { fontSize: 11, color: "#718096" },
  stockOk: { color: "#22C55E" },
  stockLow: { color: "#F59E0B" },
  stockEmpty: { color: "#EF4444" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dot_ok: { backgroundColor: "#22C55E" },
  dot_low: { backgroundColor: "#F59E0B" },
  dot_empty: { backgroundColor: "#EF4444" },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: { fontSize: 16, color: "#A0AEC0", marginTop: 12 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sortModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  sortModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A202C",
    marginBottom: 12,
    textAlign: "center",
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  sortOptionText: { fontSize: 15, color: "#374151" },
  sortOptionTextActive: { color: "#347385", fontWeight: "700" },
  sortCancelBtn: {
    paddingVertical: 14,
    alignItems: "center",
  },
  sortCancelText: { fontSize: 15, fontWeight: "600", color: "#9CA3AF" },
});
