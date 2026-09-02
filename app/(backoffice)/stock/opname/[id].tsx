import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  TextInput,
  Alert,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useStockStore,
  type StockOpname,
  type StockOpnameItem,
} from "@/store/stockStore";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";

type StatusKey = "ok" | "kurang" | "lebih" | "belum";

const STATUS_CFG: Record<
  StatusKey,
  {
    label: string;
    color: string;
    bg: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  ok: { label: "OK", color: "#145a6c", bg: "#d0f3ff", icon: "checkmark" },
  kurang: {
    label: "-Kurang",
    color: "#ba1a1a",
    bg: "#ffdad6",
    icon: "arrow-down",
  },
  lebih: { label: "+Lebih", color: "#764900", bg: "#ffddb8", icon: "arrow-up" },
  belum: {
    label: "Belum",
    color: "#70787c",
    bg: "#eceeef",
    icon: "ellipsis-horizontal",
  },
};

const OPNAME_STATUS_CFG: Record<string, { bg: string; color: string }> = {
  draft:     { bg: '#ffddb8', color: '#764900' },
  submitted: { bg: '#c7e8f5', color: '#44636e' },
  approved:  { bg: '#d0f3ff', color: '#145a6c' },
  rejected:  { bg: '#ffdad6', color: '#ba1a1a' },
};

const ITEMS_PAGE = 20;

export default function OpnameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const {
    loadOpnameDetail,
    updateOpnameItem,
    submitOpname,
    deleteOpname,
    isLoading,
  } = useStockStore();
  const { user } = useAuthStore();

  const [opname, setOpname] = useState<StockOpname | null>(null);
  const [items, setItems] = useState<StockOpnameItem[]>([]);
  const [itemsHasMore, setItemsHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [note, setNote] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [counts, setCounts] = useState({
    total: 0,
    checked: 0,
    discrepancy: 0,
  });
  const [activeTab, setActiveTab] = useState<"belum" | "selisih" | "cocok">(
    "belum",
  );
  const [tabLoading, setTabLoading] = useState(false);
  const [uncheckedItems, setUncheckedItems] = useState<
    { id: string; name: string; unit: string | null; stock: number }[]
  >([]);
  const [discrepancyItems, setDiscrepancyItems] = useState<StockOpnameItem[]>(
    [],
  );
  const [matchedItems, setMatchedItems] = useState<StockOpnameItem[]>([]);
  const branchIdRef = React.useRef<string | null>(null);

  const fetchCounts = useCallback(
    async (branchId?: string) => {
      if (!id) return;
      const bid = branchId ?? opname?.branch_id;
      const [checkedRes, discRes, totalRes] = await Promise.all([
        supabase
          .from("stock_opname_items")
          .select("*", { count: "exact", head: true })
          .eq("opname_id", id),
        supabase
          .from("stock_opname_items")
          .select("*", { count: "exact", head: true })
          .eq("opname_id", id)
          .neq("difference", 0),
        bid
          ? supabase
              .from("branch_products")
              .select("*", { count: "exact", head: true })
              .eq("branch_id", bid)
          : Promise.resolve({ count: 0 }),
      ]);
      setCounts({
        total: totalRes.count ?? 0,
        checked: checkedRes.count ?? 0,
        discrepancy: discRes.count ?? 0,
      });
    },
    [id, opname?.branch_id],
  );

  const fetchTabData = useCallback(
    async (tab: "belum" | "selisih" | "cocok", branchId?: string) => {
      if (!id) return;
      setTabLoading(true);
      try {
        if (tab === "belum") {
          const bid = branchId ?? branchIdRef.current;
          if (!bid) return;
          // Ambil semua product_id yang sudah masuk opname ini
          const { data: checkedIds } = await supabase
            .from("stock_opname_items")
            .select("product_id")
            .eq("opname_id", id);
          const checkedSet = new Set(
            (checkedIds ?? []).map((r: any) => r.product_id),
          );
          // Fetch produk aktif di branch yang belum dicek via branch_products JOIN products
          const { data: bpRows } = await supabase
            .from("branch_products")
            .select("product_id, stock, products!inner(id, name, unit, is_active)")
            .eq("branch_id", bid)
            .eq("products.is_active", true)
            .order("products(name)", { ascending: true })
            .limit(50);
          setUncheckedItems(
            (bpRows ?? [])
              .filter((bp: any) => !checkedSet.has(bp.product_id))
              .map((bp: any) => ({
                id: bp.product_id,
                name: bp.products?.name ?? bp.product_id,
                unit: bp.products?.unit ?? null,
                stock: bp.stock ?? 0,
              })),
          );
        } else if (tab === "selisih") {
          const { data } = await supabase
            .from("stock_opname_items")
            .select("*, products(name, unit)")
            .eq("opname_id", id)
            .neq("difference", 0)
            .order("created_at", { ascending: false })
            .limit(50);
          setDiscrepancyItems(
            (data ?? []).map((i: any) => ({
              ...i,
              product_name: i.products?.name ?? null,
              product_unit: i.products?.unit ?? null,
            })),
          );
        } else {
          const { data } = await supabase
            .from("stock_opname_items")
            .select("*, products(name, unit)")
            .eq("opname_id", id)
            .eq("difference", 0)
            .order("created_at", { ascending: false })
            .limit(50);
          setMatchedItems(
            (data ?? []).map((i: any) => ({
              ...i,
              product_name: i.products?.name ?? null,
              product_unit: i.products?.unit ?? null,
            })),
          );
        }
      } finally {
        setTabLoading(false);
      }
    },
    [id],
  );

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    const data = await loadOpnameDetail(id!);
    if (data) {
      const firstItems = data.items ?? [];
      setOpname({ ...data, items: [] });
      setItems(firstItems);
      setItemsHasMore(firstItems.length === ITEMS_PAGE);
      branchIdRef.current = data.branch_id;
      await Promise.all([
        fetchCounts(data.branch_id),
        fetchTabData("belum", data.branch_id),
      ]);
    } else {
      setOpname(null);
    }
    setLoading(false);
  }, [id, fetchCounts, fetchTabData]);

  useFocusEffect(
    useCallback(() => {
      fetchDetail();
    }, [fetchDetail]),
  );

  const handleLoadMoreItems = async () => {
    if (!itemsHasMore || loadingMore || items.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = items[items.length - 1].created_at;
      const { data, error } = await supabase
        .from("stock_opname_items")
        .select("*, products(name, unit)")
        .eq("opname_id", id!)
        .order("created_at", { ascending: true })
        .gt("created_at", oldest)
        .limit(ITEMS_PAGE);
      if (error) throw error;
      const more: StockOpnameItem[] = (data ?? []).map((i: any) => ({
        ...i,
        product_name: i.products?.name ?? null,
        product_unit: i.products?.unit ?? null,
      }));
      setItems((prev) => [...prev, ...more]);
      setItemsHasMore(more.length === ITEMS_PAGE);
    } catch (err: any) {
      console.error("[OpnameDetail] loadMoreItems failed:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleQtyChange = async (item: StockOpnameItem, val: string) => {
    // Izinkan string kosong agar user bisa hapus semua digit
    if (val !== "" && !/^\d+$/.test(val)) return;

    const n = val === "" ? 0 : parseInt(val, 10);

    const updater = (prev: StockOpnameItem[]) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, physical_stock: val === "" ? ("" as any) : n, difference: n - i.system_stock }
          : i,
      );

    if (activeTab === "selisih") setDiscrepancyItems(updater);
    else if (activeTab === "cocok") setMatchedItems(updater);

    // Jangan simpan ke DB kalau masih kosong, tunggu user selesai ketik
    if (val === "") return;

    try {
      setSavingId(item.id);
      await updateOpnameItem(id!, item.product_id, n);
      fetchCounts();
    } catch (err: any) {
      Alert.alert("Gagal menyimpan", err.message);
      fetchTabData(activeTab);
    } finally {
      setSavingId(null);
    }
  };

  const handleSubmit = async () => {
    try {
      await submitOpname(id!);
      Alert.alert(
        "Berhasil",
        "Sesi opname berhasil dikirim ke Staff Pusat untuk direview.",
      );
      router.back();
    } catch (err: any) {
      Alert.alert("Gagal", err.message);
    }
  };


  const handleDelete = () => {
    Alert.alert(
      "Hapus Sesi Opname",
      "Sesi ini akan dihapus permanen. Lanjutkan?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteOpname(id!);
              router.back();
            } catch (err: any) {
              Alert.alert("Gagal", err.message);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View
        style={[styles.container, styles.centered, { paddingTop: insets.top }]}
      >
        <ActivityIndicator size="large" color="#145a6c" />
      </View>
    );
  }

  if (!opname) {
    return (
      <View
        style={[styles.container, styles.centered, { paddingTop: insets.top }]}
      >
        <Ionicons name="cube-outline" size={48} color="#bfc8cb" />
        <Text style={styles.errorText}>Sesi opname tidak ditemukan</Text>
        <TouchableOpacity
          style={styles.backBtnAction}
          onPress={() => router.back()}
        >
          <Text style={styles.backBtnText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const discrepancies = discrepancyItems;
  const matched = counts.checked - counts.discrepancy;
  const isReadonly = opname.status !== "draft";

  if (showSummary) {
    return (
      <SummaryView
        opname={opname}
        items={items}
        matched={matched}
        discrepancies={discrepancies}
        note={note}
        onNoteChange={setNote}
        onBack={() => setShowSummary(false)}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        insets={insets}
        isTablet={isTablet}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#191c1d" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>STOCK OPNAME</Text>
          <View
            style={[
              styles.statusChip,
              {
                backgroundColor:
                  OPNAME_STATUS_CFG[opname.status]?.bg ?? "#eceeef",
              },
            ]}
          >
            <Text
              style={[
                styles.statusChipText,
                {
                  color:
                    OPNAME_STATUS_CFG[opname.status]?.color ?? "#70787c",
                },
              ]}
            >
              {opname.status === "draft"
                ? "Draft"
                : opname.status === "submitted"
                  ? "Menunggu Review"
                  : opname.status === "rejected"
                    ? "Ditolak"
                    : "Disetujui"}
            </Text>
          </View>
        </View>
        {opname.status === "draft" && (
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() =>
                router.push(
                  `/(backoffice)/stock/opname/scanner?opname_id=${id}` as any,
                )
              }
            >
              <Ionicons name="barcode-outline" size={22} color="#145a6c" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color="#ba1a1a" />
            </TouchableOpacity>
          </View>
        )}
        {opname.status !== "draft" && <View style={{ width: 80 }} />}
      </View>

      <FlatList
        data={
          activeTab === "belum"
            ? uncheckedItems
            : activeTab === "selisih"
              ? discrepancyItems
              : matchedItems
        }
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={[
          styles.content,
          isTablet && styles.contentTablet,
        ]}
        keyboardShouldPersistTaps="handled"
        onEndReached={activeTab === "belum" ? undefined : handleLoadMoreItems}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <>
            {/* Progress bar */}
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressTitle}>Progress Scan</Text>
                <Text style={styles.progressFraction}>
                  {counts.checked}/{counts.total}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width:
                        counts.total > 0
                          ? (`${Math.round((counts.checked / counts.total) * 100)}%` as any)
                          : "0%",
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressPct}>
                {counts.total > 0
                  ? `${Math.round((counts.checked / counts.total) * 100)}%`
                  : "0%"}
              </Text>
            </View>

            {/* Review status info box */}
            {opname.status === "submitted" && (
              <View style={styles.reviewInfoBox}>
                <Ionicons name="time-outline" size={18} color="#44636e" />
                <Text style={styles.reviewInfoText}>Menunggu review dari Staff Pusat</Text>
              </View>
            )}
            {opname.status === "rejected" && (
              <View style={[styles.reviewInfoBox, styles.reviewInfoBoxRejected]}>
                <Ionicons name="close-circle-outline" size={18} color="#ba1a1a" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reviewInfoText, { color: '#ba1a1a', fontWeight: '700' }]}>Ditolak oleh Staff Pusat</Text>
                  {opname.review_notes ? (
                    <Text style={[styles.reviewInfoText, { color: '#ba1a1a', marginTop: 2 }]}>{opname.review_notes}</Text>
                  ) : null}
                </View>
              </View>
            )}
            {opname.status === "approved" && (
              <View style={[styles.reviewInfoBox, styles.reviewInfoBoxApproved]}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#145a6c" />
                <Text style={[styles.reviewInfoText, { color: '#145a6c' }]}>Disetujui oleh Staff Pusat</Text>
              </View>
            )}

            {/* Tab bar */}
            <View style={styles.tabBar}>
              {(
                [
                  {
                    key: "belum",
                    label: "Belum Dicek",
                    count: counts.total - counts.checked,
                    color: "#70787c",
                    activeBg: "#eceeef",
                  },
                  {
                    key: "selisih",
                    label: "Ada Selisih",
                    count: counts.discrepancy,
                    color: "#ba1a1a",
                    activeBg: "#ffdad6",
                  },
                  {
                    key: "cocok",
                    label: "Cocok",
                    count: counts.checked - counts.discrepancy,
                    color: "#145a6c",
                    activeBg: "#d0f3ff",
                  },
                ] as const
              ).map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.tabBtn,
                    activeTab === tab.key && { backgroundColor: tab.activeBg },
                  ]}
                  onPress={() => {
                    setActiveTab(tab.key);
                    fetchTabData(tab.key);
                  }}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      activeTab === tab.key && {
                        color: tab.color,
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {tab.label}
                  </Text>
                  <Text style={[styles.tabCount, { color: tab.color }]}>
                    {tab.count}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search — hanya untuk tab selisih & cocok */}
            {activeTab !== "belum" && (
              <View style={styles.searchWrap}>
                <Ionicons
                  name="filter"
                  size={18}
                  color="#70787c"
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Cari nama produk..."
                  placeholderTextColor="#70787c"
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
            )}
          </>
        }
        renderItem={({ item }: { item: any }) => {
          if (activeTab === "belum") {
            return (
              <View style={[styles.itemCard, styles.itemCardMargin]}>
                <View style={styles.itemTop}>
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.unit ? (
                      <Text style={styles.unitText}>Satuan: {item.unit}</Text>
                    ) : null}
                  </View>
                  <View
                    style={[styles.diffBadge, { backgroundColor: "#eceeef" }]}
                  >
                    <Text style={[styles.diffText, { color: "#70787c" }]}>
                      Belum
                    </Text>
                  </View>
                </View>
                <View style={styles.qtyRow}>
                  <View style={styles.qtyBox}>
                    <Text style={styles.qtyLabel}>SISTEM</Text>
                    <Text style={styles.qtyVal}>{item.stock}</Text>
                  </View>
                  <View style={styles.qtyBox}>
                    <Text style={styles.qtyLabel}>FISIK</Text>
                    <Text style={[styles.qtyVal, { color: "#bfc8cb" }]}>-</Text>
                  </View>
                </View>
              </View>
            );
          }
          const diff = item.difference;
          const cfg =
            diff !== 0
              ? STATUS_CFG[
                  "selisih" === activeTab
                    ? diff > 0
                      ? "lebih"
                      : "kurang"
                    : "ok"
                ]
              : STATUS_CFG["ok"];
          return (
            <View style={[styles.itemCard, styles.itemCardMargin]}>
              <View style={styles.itemTop}>
                <View style={styles.itemMeta}>
                  <Text style={styles.itemName}>
                    {item.product_name ?? item.product_id}
                  </Text>
                  {item.product_unit ? (
                    <Text style={styles.unitText}>
                      Satuan: {item.product_unit}
                    </Text>
                  ) : null}
                  <Text style={styles.itemDate}>
                    {new Date(item.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <View style={[styles.diffBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.diffText, { color: cfg.color }]}>
                    {diff > 0 ? `+${diff}` : diff === 0 ? "OK" : `${diff}`}
                  </Text>
                  <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                </View>
              </View>
              <View style={styles.qtyRow}>
                <View style={styles.qtyBox}>
                  <Text style={styles.qtyLabel}>SISTEM</Text>
                  <Text style={styles.qtyVal}>{item.system_stock}</Text>
                </View>
                <View style={styles.qtyBox}>
                  <Text style={styles.qtyLabel}>FISIK</Text>
                  {isReadonly ? (
                    <Text style={styles.qtyVal}>{item.physical_stock}</Text>
                  ) : (
                    <View style={styles.qtyInputWrap}>
                      <TextInput
                        style={[
                          styles.qtyInput,
                          diff !== 0 && styles.qtyInputError,
                        ]}
                        keyboardType="number-pad"
                        value={item.physical_stock === ("" as any) ? "" : String(item.physical_stock)}
                        onChangeText={(v) => handleQtyChange(item, v)}
                        editable={!isReadonly}
                      />
                      {savingId === item.id && (
                        <ActivityIndicator
                          size="small"
                          color="#145a6c"
                          style={styles.savingIndicator}
                        />
                      )}
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          tabLoading || loadingMore ? (
            <View style={styles.loadMoreWrap}>
              <ActivityIndicator size="small" color="#145a6c" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !tabLoading ? (
            <View style={styles.emptyItems}>
              <Ionicons name="cube-outline" size={36} color="#bfc8cb" />
              <Text style={styles.emptyItemsText}>
                {activeTab === "belum"
                  ? "Semua produk sudah dicek."
                  : activeTab === "selisih"
                    ? "Tidak ada selisih ditemukan."
                    : "Belum ada produk yang cocok."}
              </Text>
            </View>
          ) : null
        }
      />

      {/* Footer */}
      {!isReadonly && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.draftBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.draftBtnText}>Simpan Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={() => setShowSummary(true)}
          >
            <Ionicons name="send" size={16} color="#fff" />
            <Text style={styles.submitBtnText}>Kirim ke Staff Pusat</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

interface SummaryViewProps {
  opname: StockOpname;
  items: StockOpnameItem[];
  matched: number;
  discrepancies: StockOpnameItem[];
  note: string;
  onNoteChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  isLoading: boolean;
  insets: { top: number; bottom: number };
  isTablet: boolean;
}

function SummaryView({
  opname,
  items,
  matched,
  discrepancies,
  note,
  onNoteChange,
  onBack,
  onSubmit,
  isLoading,
  insets,
  isTablet,
}: SummaryViewProps) {

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#191c1d" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>KONFIRMASI SUBMIT</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isTablet && styles.contentTablet,
        ]}
      >
        {/* Visual indicator */}
        <View style={styles.summaryHero}>
          <View style={styles.summaryIconWrap}>
            <Ionicons name="checkmark-done-circle" size={48} color="#145a6c" />
          </View>
          <Text style={styles.summaryTitle}>Review Sesi</Text>
          <Text style={styles.summaryDesc}>
            Verifikasi data sebelum mengirim ke sistem manajemen.
          </Text>
        </View>

        {/* Stats bento */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryStatWide}>
            <Text style={styles.summaryStatLabel}>Total Produk</Text>
            <Text style={[styles.summaryStatNum, { color: "#145a6c" }]}>
              {items.length}
            </Text>
          </View>
          <View style={styles.summaryStatHalf}>
            <View style={styles.summaryStatRow}>
              <Ionicons name="checkmark-circle" size={18} color="#145a6c" />
              <Text style={[styles.summaryStatLabel, { color: "#145a6c" }]}>
                Sesuai
              </Text>
            </View>
            <Text style={[styles.summaryStatNum, { color: "#145a6c" }]}>
              {matched}
            </Text>
          </View>
          <View
            style={[
              styles.summaryStatHalf,
              { borderColor: "#ffdad6", backgroundColor: "#fff5f5" },
            ]}
          >
            <View style={styles.summaryStatRow}>
              <Ionicons name="warning" size={18} color="#ba1a1a" />
              <Text style={[styles.summaryStatLabel, { color: "#ba1a1a" }]}>
                Selisih
              </Text>
            </View>
            <Text style={[styles.summaryStatNum, { color: "#ba1a1a" }]}>
              {discrepancies.length}
            </Text>
          </View>
        </View>

        {/* Discrepancy list */}
        {discrepancies.length > 0 && (
          <View style={styles.discSection}>
            <View style={styles.discHeader}>
              <Text style={styles.discTitle}>Pemeriksaan Selisih</Text>
              <View style={styles.discCount}>
                <Text style={styles.discCountText}>
                  {discrepancies.length} ITEM
                </Text>
              </View>
            </View>
            {discrepancies.map((item) => (
              <View key={item.id} style={styles.discCard}>
                <View>
                  <Text style={styles.discName}>
                    {item.product_name ?? item.product_id}
                  </Text>
                </View>
                <View style={styles.discDiff}>
                  <Text style={styles.discDiffLabel}>Sistem vs Fisik</Text>
                  <Text style={styles.discDiffVal}>
                    {item.system_stock}{" "}
                    <Text style={{ color: "#70787c" }}>{"→"}</Text>{" "}
                    {item.physical_stock}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Note */}
        <View style={styles.noteSection}>
          <Text style={styles.noteLabel}>Tambahkan Catatan</Text>
          <TextInput
            style={styles.noteInput}
            multiline
            numberOfLines={3}
            placeholder="Masukkan observasi atau alasan selisih..."
            placeholderTextColor="#70787c"
            value={note}
            onChangeText={onNoteChange}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.submitBtnFull}
          onPress={onSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.submitBtnText}>Kirim ke Staff Pusat</Text>
              <Ionicons name="send" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fb" },
  centered: { justifyContent: "center", alignItems: "center", gap: 12 },
  errorText: { fontSize: 15, color: "#40484b" },
  backBtnAction: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#eceeef",
    borderRadius: 8,
  },
  backBtnText: { fontSize: 14, fontWeight: "600", color: "#191c1d" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#f8f9fb",
    borderBottomWidth: 1,
    borderBottomColor: "#e1e3e4",
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerActions: { flexDirection: "row", alignItems: "center" },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#191c1d",
    letterSpacing: 1,
  },
  statusChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  statusChipText: { fontSize: 10, fontWeight: "700" },

  content: { padding: 16, paddingBottom: 120 },
  contentTablet: { paddingHorizontal: 80 },

  progressCard: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bfc8cb",
    marginBottom: 10,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#40484b",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  progressFraction: { fontSize: 13, fontWeight: "700", color: "#145a6c" },
  progressTrack: {
    height: 8,
    backgroundColor: "#eceeef",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressFill: { height: 8, backgroundColor: "#145a6c", borderRadius: 4 },

  tabBar: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfc8cb",
    marginBottom: 10,
    overflow: "hidden",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#70787c",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  tabCount: { fontSize: 16, fontWeight: "700" },
  progressPct: {
    fontSize: 11,
    fontWeight: "700",
    color: "#145a6c",
    textAlign: "right",
  },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#bfc8cb",
    alignItems: "center",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#40484b",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  statNum: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eceeef",
    borderRadius: 4,
    paddingHorizontal: 12,
    marginBottom: 14,
    height: 48,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: "#191c1d" },

  itemCard: {
    backgroundColor: "#ffffff",
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bfc8cb",
  },
  itemCardMargin: { marginBottom: 8 },
  loadMoreWrap: { alignItems: "center", paddingVertical: 16 },
  emptyItems: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyItemsText: { fontSize: 13, color: "#70787c", textAlign: "center" },
  itemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  itemMeta: { flex: 1, gap: 2 },
  itemName: { fontSize: 15, fontWeight: "600", color: "#191c1d" },
  unitText: { fontSize: 11, color: "#70787c" },
  itemDate: { fontSize: 10, color: "#aab3b6", marginTop: 2 },
  diffBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
  },
  diffText: { fontSize: 11, fontWeight: "700" },

  qtyRow: { flexDirection: "row", gap: 12 },
  qtyBox: { flex: 1, alignItems: "center" },
  qtyLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#70787c",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  qtyVal: { fontSize: 16, fontWeight: "500", color: "#191c1d" },
  qtyInputWrap: { width: "100%", position: "relative" },
  qtyInput: {
    width: "100%",
    height: 44,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: "#bfc8cb",
    borderRadius: 4,
    backgroundColor: "#f8f9fb",
    color: "#191c1d",
  },
  qtyInputError: { borderWidth: 2, borderColor: "#145a6c" },
  savingIndicator: { position: "absolute", right: 8, top: 12 },

  reviewInfoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#c7e8f5", borderRadius: 8, padding: 12, marginBottom: 10,
  },
  reviewInfoBoxRejected: { backgroundColor: "#ffdad6" },
  reviewInfoBoxApproved: { backgroundColor: "#d0f3ff" },
  reviewInfoText: { fontSize: 13, color: "#44636e", flex: 1 },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e1e3e4",
    flexDirection: "row",
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  draftBtn: {
    flex: 1,
    height: 48,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#145a6c",
    justifyContent: "center",
    alignItems: "center",
  },
  draftBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#145a6c",
    letterSpacing: 0.5,
  },
  submitBtn: {
    flex: 2,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#145a6c",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  submitBtnFull: {
    flex: 1,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#145a6c",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.5,
  },

  summaryHero: {
    alignItems: "center",
    padding: 24,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfc8cb",
    marginBottom: 14,
  },
  summaryIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#d0f3ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#191c1d",
    marginBottom: 4,
  },
  summaryDesc: { fontSize: 13, color: "#40484b", textAlign: "center" },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  summaryStatWide: {
    width: "100%",
    backgroundColor: "#f2f4f5",
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bfc8cb",
  },
  summaryStatHalf: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bfc8cb",
  },
  summaryStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  summaryStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#40484b",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  summaryStatNum: { fontSize: 26, fontWeight: "700" },

  discSection: { marginBottom: 14 },
  discHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  discTitle: { fontSize: 17, fontWeight: "600", color: "#191c1d" },
  discCount: {
    backgroundColor: "#ba1a1a",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  discCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  discCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bfc8cb",
    marginBottom: 6,
  },
  discName: { fontSize: 14, fontWeight: "600", color: "#191c1d" },
  discDiff: { alignItems: "flex-end" },
  discDiffLabel: {
    fontSize: 9,
    color: "#70787c",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  discDiffVal: { fontSize: 15, fontWeight: "700", color: "#ba1a1a" },

  noteSection: { gap: 6 },
  noteLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#40484b",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  noteInput: {
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#bfc8cb",
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    color: "#191c1d",
    minHeight: 90,
    textAlignVertical: "top",
  },
});
