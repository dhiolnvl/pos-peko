import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBackFromDashboard } from "@/hooks/useBackFromDashboard";
import { useProductStore, type Product, type ProductSortBy } from "@/store/productStore";
import { supabase } from "@/lib/supabase";
import { OwnerPageHeader } from "@/components/OwnerHeader";
import { TabletCenteredView } from "@/components/TabletCenteredView";

interface BranchTab {
  id: string;
  name: string;
}

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nama A-Z' },
  { value: 'name_desc', label: 'Nama Z-A' },
  { value: 'price_asc', label: 'Harga Terendah' },
  { value: 'price_desc', label: 'Harga Tertinggi' },
  { value: 'stock_asc', label: 'Stok Terendah' },
  { value: 'stock_desc', label: 'Stok Tertinggi' },
  { value: 'updated_desc', label: 'Terbaru Diupdate' },
];

export default function OwnerProductsScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const goBack = useBackFromDashboard();
  const numColumns =
    width >= 1024 ? 5 : width >= 768 ? 4 : width >= 600 ? 3 : 2;
  const isTablet = width >= 768;
  // TabletCenteredView di tablet tambah paddingHorizontal 16 kiri+kanan (32), di HP tidak
  // gridContent padding 12 kiri+kanan (24), gap 10 antar kolom
  const tabletPadding = isTablet ? 32 : 0;
  const contentWidth = Math.min(width, 960) - tabletPadding - 24;
  const cardWidth = (contentWidth - (numColumns - 1) * 10) / numColumns;

  const {
    products,
    categories,
    isLoading,
    isLoadingMore,
    searchQuery,
    selectedCategoryId,
    sortBy,
    setSearchQuery,
    setSelectedCategory,
    setFilterBranch,
    setSortBy,
    syncFromSupabase,
    loadCategories,
    loadMore,
    deactivateProduct,
    getFilteredProducts,
  } = useProductStore();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [branches, setBranches] = useState<BranchTab[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  const handleSelectBranch = (branchId: string | null) => {
    setSelectedBranchId(branchId);
    setFilterBranch(branchId);
  };

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    await syncFromSupabase();
    loadBranches();
  };

  const loadBranches = async () => {
    try {
      const { data } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      setBranches(data ?? []);
    } catch (e) {
      console.error("[OwnerProducts] loadBranches error:", e);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncFromSupabase();
    setRefreshing(false);
  };

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
  }, []);

  const filteredProducts = getFilteredProducts();

  const getProductInitials = (name: string): string => {
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return words
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  };

  const renderCategoryChip = ({ item }: { item: (typeof categories)[0] }) => {
    const isSelected = selectedCategoryId === item.id;
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.chip, isSelected && styles.chipSelected]}
        onPress={() => setSelectedCategory(isSelected ? null : item.id)}
      >
        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderProductCard = ({ item }: { item: Product }) => {
    const isLowStock = item.stock <= item.min_stock;
    return (
      <TouchableOpacity
        style={[styles.productCard, { width: cardWidth }]}
        onPress={() => router.push(`/(staff-pusat)/products/${item.id}` as any)}
        onLongPress={() => {
          setSelectedProduct(item);
          setShowMenu(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.imageContainer}>
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={styles.productImage}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.initialsText}>
                {getProductInitials(item.name)}
              </Text>
            </View>
          )}
          {!item.is_active && (
            <View style={[styles.badge, styles.badgeInactive]}>
              <Text style={styles.badgeText}>Non-aktif</Text>
            </View>
          )}
          {item.is_active && isLowStock && (
            <View style={[styles.badge, styles.badgeLowStock]}>
              <Text style={styles.badgeText}>Stok Rendah</Text>
            </View>
          )}
        </View>

        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.productCategory} numberOfLines={1}>
            {item.category_name || "Tanpa Kategori"}
          </Text>
          <Text style={styles.productPrice}>
            Rp {item.price.toLocaleString("id-ID")}
          </Text>
          <View style={styles.stockRow}>
            <Ionicons name="cube-outline" size={14} color="#718096" />
            <Text style={styles.stockText}>
              {item.stock} {item.unit || "pcs"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const branchLabel = selectedBranchId
    ? (branches.find((b) => b.id === selectedBranchId)?.name ?? "")
    : "Semua Cabang";

  return (
    <View style={styles.container}>
      <OwnerPageHeader
        title="Produk"
        subtitle={branchLabel}
        onBack={goBack}
        rightElement={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={styles.catBtn}
              onPress={() => router.push("/(staff-pusat)/products/print-labels" as any)}
            >
              <Ionicons name="print-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.catBtn}
              onPress={() => router.push("/(staff-pusat)/products/categories")}
            >
              <Ionicons name="grid-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Branch filter tabs */}
      <View style={styles.branchTabs}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.branchTabsContent}
        >
          <TouchableOpacity
            style={[
              styles.branchTab,
              selectedBranchId === null && styles.branchTabActive,
            ]}
            onPress={() => handleSelectBranch(null)}
          >
            <Text
              style={[
                styles.branchTabText,
                selectedBranchId === null && styles.branchTabTextActive,
              ]}
            >
              Semua Cabang
            </Text>
          </TouchableOpacity>
          {branches.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[
                styles.branchTab,
                selectedBranchId === b.id && styles.branchTabActive,
              ]}
              onPress={() => handleSelectBranch(b.id)}
            >
              <Text
                style={[
                  styles.branchTabText,
                  selectedBranchId === b.id && styles.branchTabTextActive,
                ]}
              >
                {b.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <TabletCenteredView maxWidth={960}>
        {/* Search + Sort */}
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Ionicons
              name="search"
              size={20}
              color="#A0AEC0"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari produk atau barcode..."
              value={searchQuery}
              onChangeText={handleSearch}
              placeholderTextColor="#A0AEC0"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={20} color="#A0AEC0" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.sortBtn, sortBy !== 'name_asc' && styles.sortBtnActive]}
            onPress={() => setShowSort(true)}
          >
            <Ionicons
              name="swap-vertical-outline"
              size={20}
              color={sortBy !== 'name_asc' ? '#347385' : '#6B7280'}
            />
          </TouchableOpacity>
        </View>

        {/* Category Filter */}
        {categories.length > 0 && (
          <View style={styles.categoryScrollWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryContent}
            >
              <TouchableOpacity
                style={[
                  styles.chip,
                  !selectedCategoryId && styles.chipSelected,
                ]}
                onPress={() => setSelectedCategory(null)}
              >
                <Text
                  style={[
                    styles.chipText,
                    !selectedCategoryId && styles.chipTextSelected,
                  ]}
                >
                  Semua
                </Text>
              </TouchableOpacity>
              {categories.map((cat) => renderCategoryChip({ item: cat }))}
            </ScrollView>
          </View>
        )}

        {/* Products Grid */}
        {isLoading && products.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#56B2C1" />
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="cube-outline" size={64} color="#CBD5E0" />
            <Text style={styles.emptyText}>
              {searchQuery || selectedCategoryId
                ? "Tidak ada produk ditemukan"
                : "Belum ada produk"}
            </Text>
            <Text style={styles.emptySubtext}>
              {!searchQuery &&
                !selectedCategoryId &&
                "Tap tombol + untuk menambah produk"}
            </Text>
          </View>
        ) : (
          <FlatList
            key={numColumns}
            data={filteredProducts}
            renderItem={renderProductCard}
            keyExtractor={(item) => item.id}
            numColumns={numColumns}
            columnWrapperStyle={[styles.row, { justifyContent: 'flex-start' }]}
            contentContainerStyle={[
              styles.gridContent,
              { paddingBottom: insets.bottom + 80 },
            ]}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isLoadingMore ? (
                <ActivityIndicator
                  size="small"
                  color="#56B2C1"
                  style={{ marginVertical: 16 }}
                />
              ) : null
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={["#56B2C1"]}
              />
            }
          />
        )}
      </TabletCenteredView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom }]}
        onPress={() => router.push("/(staff-pusat)/products/form")}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

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
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Urutkan</Text>
            {SORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.menuItem}
                onPress={() => { setSortBy(opt.value as ProductSortBy); setShowSort(false); }}
              >
                <Ionicons
                  name={sortBy === opt.value ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={sortBy === opt.value ? '#347385' : '#9CA3AF'}
                />
                <Text style={[styles.menuItemText, sortBy === opt.value && { color: '#347385', fontWeight: '700' }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemCancel]}
              onPress={() => setShowSort(false)}
            >
              <Text style={styles.menuItemCancelText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Action Menu Modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>{selectedProduct?.name}</Text>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                router.push(`/(staff-pusat)/products/form?id=${selectedProduct?.id}`);
              }}
            >
              <Ionicons name="create-outline" size={20} color="#1A202C" />
              <Text style={styles.menuItemText}>Edit Produk</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={async () => {
                if (selectedProduct) {
                  setShowMenu(false);
                  try {
                    await deactivateProduct(selectedProduct.id);
                  } catch {}
                }
              }}
            >
              <Ionicons name="eye-off-outline" size={20} color="#E53E3E" />
              <Text style={[styles.menuItemText, { color: "#E53E3E" }]}>
                Non-aktifkan
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemCancel]}
              onPress={() => setShowMenu(false)}
            >
              <Text style={styles.menuItemCancelText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7FAFC" },

  catBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },

  branchTabs: {
    height: 40,
    justifyContent: "center",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  branchTabsContent: { paddingHorizontal: 12, gap: 6, alignItems: "center" },
  branchTab: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  branchTabActive: { backgroundColor: "#347385", borderColor: "#347385" },
  branchTabText: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  branchTabTextActive: { color: "#fff" },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 40, fontSize: 14, color: "#1A202C" },
  sortBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sortBtnActive: { borderColor: '#347385', backgroundColor: '#EEF8FA' },

  categoryScrollWrap: {
    height: 52,
    justifyContent: "center",
    marginBottom: 8,
  },
  categoryContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 4,
    minHeight: 40,
  },
  chipSelected: { backgroundColor: "#56B2C1", borderColor: "#56B2C1" },
  chipText: { fontSize: 14, color: "#4A5568" },
  chipTextSelected: { color: "#fff", fontWeight: "600" },

  gridContent: { padding: 12, gap: 10 },
  row: { gap: 10, marginBottom: 0 },

  productCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  imageContainer: { position: "relative", width: "100%", aspectRatio: 1 },
  productImage: { width: "100%", height: "100%", resizeMode: "cover" },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
  },
  initialsText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#56B2C1",
    letterSpacing: 1,
  },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeInactive: { backgroundColor: "#A0AEC0" },
  badgeLowStock: { backgroundColor: "#E53E3E" },
  badgeText: { fontSize: 10, fontWeight: "600", color: "#fff" },

  productInfo: { padding: 12 },
  productName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A202C",
    marginBottom: 4,
  },
  productCategory: { fontSize: 12, color: "#718096", marginBottom: 8 },
  productPrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#56B2C1",
    marginBottom: 8,
  },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  stockText: { fontSize: 12, color: "#718096" },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4A5568",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#A0AEC0",
    marginTop: 8,
    textAlign: "center",
  },

  fab: {
    position: "absolute",
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#56B2C1",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  menuContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A202C",
    marginBottom: 16,
    textAlign: "center",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  menuItemText: { fontSize: 16, color: "#1A202C" },
  menuItemCancel: {
    borderBottomWidth: 0,
    justifyContent: "center",
    paddingTop: 8,
  },
  menuItemCancelText: { fontSize: 16, fontWeight: "600", color: "#718096" },
});
