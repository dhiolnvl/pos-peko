/**
 * Staff Pusat Dashboard
 */

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/hooks/useAuth";
import { BackofficeHeader } from "@/components/BackofficeHeader";
import {
  getWarehouses,
  getWarehouseStock,
  getPendingOpnamesForReview,
  type WarehouseStockRow,
  type PendingOpname,
} from "@/lib/warehouseQueries";
import { supabase } from "@/lib/supabase";
import type { Warehouse } from "@/types";

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon, iconBg, iconColor, value, label, onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string; iconColor: string;
  value: string | number; label: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={st.statCard}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
    >
      <View style={[st.statIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <Text style={[st.statValue, { color: iconColor }]}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Menu Item ───────────────────────────────────────────────────────────────

const MENUS = [
  { icon: 'cart-outline' as const, label: 'Purchase\nOrder', route: '/(staff-pusat)/purchase' },
  { icon: 'swap-horizontal-outline' as const, label: 'Distribusi\nStok', route: '/(staff-pusat)/transfers' },
  { icon: 'storefront-outline' as const, label: 'Stok\nCabang', route: '/(staff-pusat)/branch-stock' },
  { icon: 'layers-outline' as const, label: 'Permintaan\nStok', route: '/(staff-pusat)/stock-requests' },
  { icon: 'pricetags-outline' as const, label: 'Produk', route: '/(staff-pusat)/products' },
  { icon: 'receipt-outline' as const, label: 'Transaksi', route: '/(staff-pusat)/transactions' },
  { icon: 'people-outline' as const, label: 'Member', route: '/(staff-pusat)/members' },
  { icon: 'gift-outline' as const, label: 'Reward\nPoin', route: '/(staff-pusat)/rewards' },
  { icon: 'wallet-outline' as const, label: 'Pengeluaran', route: '/(staff-pusat)/expenses' },
  { icon: 'checkmark-done-outline' as const, label: 'Approval', route: '/(staff-pusat)/approvals' },
];

// ─── Opname Card ─────────────────────────────────────────────────────────────

function OpnameCard({ item, onPress }: { item: PendingOpname; onPress: () => void }) {
  const selisihSign = item.total_difference >= 0 ? "+" : "";
  const selisihColor = item.total_difference < 0 ? "#EF4444" : "#22C55E";
  return (
    <TouchableOpacity style={st.opnameCard} onPress={onPress} activeOpacity={0.75}>
      <View style={st.opnameTop}>
        <View style={st.opnameIcon}>
          <Ionicons name="clipboard-outline" size={18} color="#347385" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.opnameBranch} numberOfLines={1}>{item.branch_name}</Text>
          <Text style={st.opnameBy} numberOfLines={1}>Oleh: {item.created_by_name}</Text>
        </View>
        <View style={st.reviewBadge}>
          <Text style={st.reviewBadgeText}>Review</Text>
          <Ionicons name="chevron-forward" size={12} color="#347385" />
        </View>
      </View>
      <View style={st.opnameBottom}>
        <View style={st.opnameStat}>
          <Ionicons name="list-outline" size={13} color="#6B7280" />
          <Text style={st.opnameStatText}>{item.item_count} item</Text>
        </View>
        <View style={st.opnameStat}>
          <Ionicons name="swap-vertical-outline" size={13} color={selisihColor} />
          <Text style={[st.opnameStatText, { color: selisihColor, fontWeight: "700" }]}>
            {selisihSign}{item.total_difference} selisih
          </Text>
        </View>
        <Text style={st.opnameDate}>
          {new Date(item.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Critical Stock Card ──────────────────────────────────────────────────────

function CriticalStockCard({ item }: { item: WarehouseStockRow }) {
  return (
    <View style={st.critCard}>
      <View style={st.critAvatar}>
        <Text style={st.critAvatarText}>{item.product_name.substring(0, 2).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.critName} numberOfLines={1}>{item.product_name}</Text>
        <Text style={st.critCategory}>{item.category_name ?? "Tanpa Kategori"}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={st.critStock}>{item.stock}</Text>
        <Text style={st.critUnit}>{item.unit ?? "pcs"}</Text>
      </View>
    </View>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function StaffPusatDashboard() {
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [loading, setLoading] = useState(true);
  const [pendingOpnames, setPendingOpnames] = useState<PendingOpname[]>([]);
  const [criticalStock, setCriticalStock] = useState<WarehouseStockRow[]>([]);
  const [totalStock, setTotalStock] = useState(0);
  const [distributionCount, setDistributionCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [warehouses, opnames, distResult, reqResult] = await Promise.all([
        getWarehouses(),
        getPendingOpnamesForReview(),
        supabase
          .from('stock_transfers')
          .select('id', { count: 'exact', head: true })
          .gte('sent_at', firstOfMonth)
          .in('status', ['sent', 'received']),
        supabase
          .from('stock_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ]);

      const activeWarehouse =
        (warehouses as Warehouse[]).find((w) => w.is_active) ??
        (warehouses as Warehouse[])[0] ?? null;

      let stockItems: WarehouseStockRow[] = [];
      if (activeWarehouse) {
        stockItems = await getWarehouseStock(activeWarehouse.id);
      }

      setTotalStock(stockItems.reduce((s, i) => s + i.stock, 0));
      setCriticalStock(stockItems.filter((s) => s.stock <= s.min_stock));
      setPendingOpnames(opnames);
      setDistributionCount(distResult.count ?? 0);
      setPendingRequestCount(reqResult.count ?? 0);
    } catch (e) {
      console.error("[StaffPusatDashboard] load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleLogout = () => logout().then(() => router.replace("/(auth)/login" as any));

  const numCols = isTablet ? 5 : 4;
  const menuItemWidth = (width - 32 - (numCols - 1) * 8) / numCols;

  return (
    <View style={st.container}>
      <BackofficeHeader
        title="Staff Pusat"
        subtitle={user?.name ?? 'Staff Pusat'}
        onLogout={() =>
          Alert.alert("Keluar", "Anda yakin ingin keluar?", [
            { text: "Batal", style: "cancel" },
            { text: "Keluar", style: "destructive", onPress: handleLogout },
          ])
        }
      />

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color="#347385" />
          <Text style={st.loadingText}>Memuat data...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Stats ── */}
          <Text style={st.sectionTitle}>Ringkasan</Text>
          <View style={st.statsGrid}>
            <StatCard
              icon="cube-outline" iconBg="#EEF8FA" iconColor="#347385"
              value={totalStock} label="Stok Gudang"
              onPress={() => router.push("/(staff-pusat)/warehouse" as any)}
            />
            <StatCard
              icon="swap-horizontal-outline" iconBg="#F0FDF4" iconColor="#22C55E"
              value={distributionCount} label="Distribusi Bulan Ini"
              onPress={() => router.push("/(staff-pusat)/transfers" as any)}
            />
            <StatCard
              icon="layers-outline" iconBg="#FFF7ED" iconColor="#F59E0B"
              value={pendingRequestCount} label="Permintaan Stok"
              onPress={() => router.push("/(staff-pusat)/stock-requests" as any)}
            />
            <StatCard
              icon="warning-outline" iconBg="#FEF2F2" iconColor="#EF4444"
              value={criticalStock.length} label="Stok Kritis"
              onPress={() => router.push("/(staff-pusat)/warehouse" as any)}
            />
          </View>

          {/* ── Menu ── */}
          <Text style={st.sectionTitle}>Menu</Text>
          <View style={[st.menuGrid, { paddingHorizontal: 16 }]}>
            {MENUS.map((item) => (
              <TouchableOpacity
                key={item.route}
                style={[st.menuItem, { width: menuItemWidth }]}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.75}
              >
                <View style={st.menuIcon}>
                  <Ionicons name={item.icon} size={20} color="#347385" />
                </View>
                <Text style={st.menuLabel} numberOfLines={2}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Two-col on tablet, single on phone ── */}
          <View style={isTablet ? st.twoCol : undefined}>

            {/* Opname Review */}
            <View style={isTablet ? st.col : undefined}>
              <View style={st.sectionHeader}>
                <Text style={st.sectionTitle2}>Opname Menunggu Review</Text>
                {pendingOpnames.length > 0 && (
                  <View style={st.badge}>
                    <Text style={st.badgeText}>{pendingOpnames.length}</Text>
                  </View>
                )}
              </View>
              <View style={{ paddingHorizontal: 16 }}>
                {pendingOpnames.length === 0 ? (
                  <View style={st.emptyCard}>
                    <Ionicons name="checkmark-circle-outline" size={28} color="#A9DFE9" />
                    <Text style={st.emptyText}>Tidak ada opname menunggu review</Text>
                  </View>
                ) : (
                  pendingOpnames.map((item) => (
                    <OpnameCard
                      key={item.id}
                      item={item}
                      onPress={() => router.push("/(staff-pusat)/opname" as any)}
                    />
                  ))
                )}
              </View>
            </View>

            {/* Stok Kritis */}
            <View style={isTablet ? st.col : undefined}>
              <View style={st.sectionHeader}>
                <Text style={st.sectionTitle2}>Stok Kritis Gudang</Text>
                {criticalStock.length > 0 && (
                  <View style={[st.badge, { backgroundColor: "#FEE2E2" }]}>
                    <Text style={[st.badgeText, { color: "#DC2626" }]}>{criticalStock.length}</Text>
                  </View>
                )}
              </View>
              <View style={{ paddingHorizontal: 16 }}>
                {criticalStock.length === 0 ? (
                  <View style={st.emptyCard}>
                    <Ionicons name="shield-checkmark-outline" size={28} color="#A9DFE9" />
                    <Text style={st.emptyText}>Semua stok gudang aman</Text>
                  </View>
                ) : (
                  <>
                    {criticalStock.map((item) => (
                      <CriticalStockCard key={item.product_id} item={item} />
                    ))}
                    <TouchableOpacity
                      style={st.viewAllBtn}
                      onPress={() => router.push("/(staff-pusat)/warehouse" as any)}
                      activeOpacity={0.75}
                    >
                      <Text style={st.viewAllText}>Lihat Semua Stok Gudang</Text>
                      <Ionicons name="chevron-forward" size={14} color="#347385" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>

          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F5" },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 13, color: "#9CA3AF" },

  // Section titles
  sectionTitle: {
    fontSize: 11, fontWeight: "700", color: "#347385",
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10,
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10,
  },
  sectionTitle2: {
    fontSize: 11, fontWeight: "700", color: "#347385",
    textTransform: "uppercase", letterSpacing: 0.6,
  },

  // Stats
  statsGrid: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 10,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#D4EFF4",
    shadowColor: "#347385",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    justifyContent: "center", alignItems: "center",
  },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 10, color: "#6B7280", textAlign: "center" },

  // Menu
  menuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  menuItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#D4EFF4",
    shadowColor: "#347385",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  menuIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: "#EEF8FA", justifyContent: "center", alignItems: "center",
  },
  menuLabel: { fontSize: 11, fontWeight: "600", color: "#374151", textAlign: "center" },

  // Badges
  badge: {
    backgroundColor: "#D4EFF4", borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: "#347385" },

  // Empty
  emptyCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 24,
    alignItems: "center", gap: 8, borderWidth: 1,
    borderColor: "#D4EFF4", marginBottom: 8,
  },
  emptyText: { fontSize: 13, color: "#9CA3AF", textAlign: "center" },

  // Opname card
  opnameCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: "#D4EFF4",
    shadowColor: "#347385", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  opnameTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  opnameIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#EEF8FA", justifyContent: "center", alignItems: "center",
  },
  opnameBranch: { fontSize: 13, fontWeight: "700", color: "#111827" },
  opnameBy: { fontSize: 11, color: "#6B7280", marginTop: 1 },
  reviewBadge: {
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "#EEF8FA", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: "#A9DFE9",
  },
  reviewBadgeText: { fontSize: 11, fontWeight: "700", color: "#347385" },
  opnameBottom: { flexDirection: "row", alignItems: "center", gap: 12 },
  opnameStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  opnameStatText: { fontSize: 12, color: "#6B7280" },
  opnameDate: { fontSize: 11, color: "#9CA3AF", marginLeft: "auto" },

  // Critical stock card
  critCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: "#FECACA",
  },
  critAvatar: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "#FEF2F2", justifyContent: "center", alignItems: "center",
  },
  critAvatarText: { fontSize: 12, fontWeight: "700", color: "#EF4444" },
  critName: { fontSize: 13, fontWeight: "600", color: "#111827" },
  critCategory: { fontSize: 11, color: "#6B7280", marginTop: 1 },
  critStock: { fontSize: 18, fontWeight: "800", color: "#EF4444" },
  critUnit: { fontSize: 10, color: "#9CA3AF" },

  // View all
  viewAllBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    paddingVertical: 10, backgroundColor: "#EEF8FA", borderRadius: 10,
    borderWidth: 1, borderColor: "#A9DFE9", marginTop: 4, marginBottom: 8,
  },
  viewAllText: { fontSize: 13, fontWeight: "600", color: "#347385" },

  // Tablet layout
  twoCol: { flexDirection: "row", alignItems: "flex-start" },
  col: { flex: 1 },
});
