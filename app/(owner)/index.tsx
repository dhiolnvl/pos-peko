import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Modal,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/hooks/useAuth";
import { OwnerDashboardHeader } from "@/components/OwnerHeader";
import {
  getBranchSummaries,
  getMultiBranchDailySales,
  getMultiBranchWeeklySales,
  getMultiBranchMonthlySales,
  getMultiBranchTopProducts,
  getPendingOpnames,
  getCriticalStockBranches,
  fetchAllBranches,
  fmtCurrency,
  startOfDay,
  endOfDay,
  type BranchSummary,
  type DailySales,
  type PendingOpname,
  type CriticalStockBranch,
  type TopProductMulti,
} from "@/lib/ownerQueries";

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANCH_COLORS = ["#347385", "#56B2C1", "#E69738", "#38A169", "#7ECFDE", "#C67E20"];

function fmtDisplay(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Custom range modal ───────────────────────────────────────────────────────

function CustomRangeModal({ visible, from, to, onConfirm, onClose }: {
  visible: boolean; from: string; to: string;
  onConfirm: (from: string, to: string) => void; onClose: () => void;
}) {
  const [fromDate, setFromDate] = useState(new Date(from));
  const [toDate, setToDate] = useState(new Date(to));
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const handleConfirm = () => {
    if (fromDate > toDate) {
      Alert.alert('Tanggal salah', 'Tanggal awal tidak boleh lebih dari tanggal akhir');
      return;
    }
    onConfirm(startOfDay(fromDate), endOfDay(toDate));
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={modalSt.overlay}>
        <View style={modalSt.card}>
          <Text style={modalSt.title}>Pilih Rentang Tanggal</Text>

          <Text style={modalSt.label}>Dari</Text>
          <TouchableOpacity style={modalSt.datePicker} onPress={() => setPicking('from')}>
            <Ionicons name="calendar-outline" size={18} color="#347385" />
            <Text style={modalSt.datePickerText}>{fmtDisplay(fromDate.toISOString())}</Text>
          </TouchableOpacity>

          <Text style={modalSt.label}>Sampai</Text>
          <TouchableOpacity style={modalSt.datePicker} onPress={() => setPicking('to')}>
            <Ionicons name="calendar-outline" size={18} color="#347385" />
            <Text style={modalSt.datePickerText}>{fmtDisplay(toDate.toISOString())}</Text>
          </TouchableOpacity>

          {picking !== null && (
            <DateTimePicker
              value={picking === 'from' ? fromDate : toDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              onChange={(_: unknown, selected?: Date) => {
                setPicking(null);
                if (!selected) return;
                if (picking === 'from') setFromDate(selected);
                else setToDate(selected);
              }}
            />
          )}

          <View style={modalSt.actions}>
            <TouchableOpacity style={modalSt.cancelBtn} onPress={onClose}>
              <Text style={modalSt.cancelText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalSt.confirmBtn} onPress={handleConfirm}>
              <Text style={modalSt.confirmText}>Terapkan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Multi-branch bar chart ───────────────────────────────────────────────────

type ChartMode = 'daily' | 'weekly' | 'monthly';

interface BarChartProps {
  data: DailySales[];
  branchIds: string[];
  branchNames: Record<string, string>;
  mode: ChartMode;
  from: string;
  to: string;
}

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const DAY_SHORT = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
const TZ_OFFSET = 7 * 60;

function wibDate(iso: string) {
  return new Date(new Date(iso).getTime() + TZ_OFFSET * 60000);
}

function isoDay(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}

function isoWeekKey(d: Date) {
  const thu = new Date(d);
  thu.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${thu.getUTCFullYear()}-W${wk.toString().padStart(2, "0")}`;
}

function buildDailySlots(from: string, to: string) {
  const slots: { key: string; label: string }[] = [];
  const start = wibDate(from);
  const end = wibDate(to);
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);
  const cur = new Date(start);
  while (cur <= end) {
    const key = isoDay(cur);
    const label = DAY_SHORT[cur.getUTCDay()];
    slots.push({ key, label });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return slots;
}

function buildWeeklySlots(from: string, to: string) {
  const slots: { key: string; label: string }[] = [];
  const startWib = wibDate(from);
  startWib.setUTCDate(startWib.getUTCDate() - ((startWib.getUTCDay() + 6) % 7));
  startWib.setUTCHours(0, 0, 0, 0);
  const endWib = wibDate(to);
  const seen = new Set<string>();
  const cur = new Date(startWib);
  while (cur <= endWib) {
    const key = isoWeekKey(cur);
    if (!seen.has(key)) {
      seen.add(key);
      const label = `${cur.getUTCDate()} ${MONTH_SHORT[cur.getUTCMonth()]}`;
      slots.push({ key, label });
    }
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return slots;
}

function buildMonthlySlots(from: string, to: string) {
  const slots: { key: string; label: string }[] = [];
  const startWib = wibDate(from);
  const endWib = wibDate(to);
  let y = startWib.getUTCFullYear();
  let m = startWib.getUTCMonth();
  const endY = endWib.getUTCFullYear();
  const endM = endWib.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${(m + 1).toString().padStart(2, "0")}`;
    const isJan = m === 0;
    const label = isJan ? `${MONTH_SHORT[m]}\n${y}` : MONTH_SHORT[m];
    slots.push({ key, label });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return slots;
}

function MultiBranchBarChart({ data, branchIds, branchNames, mode, from, to }: BarChartProps) {
  const CHART_H = 110;
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const dates =
    mode === 'daily' ? buildDailySlots(from, to) :
    mode === 'weekly' ? buildWeeklySlots(from, to) :
    buildMonthlySlots(from, to);

  const series = branchIds.map((bid, si) => ({
    branchId: bid,
    color: BRANCH_COLORS[si % BRANCH_COLORS.length],
    values: dates.map(({ key }) => data.find((d) => d.date === key && d.branch_id === bid)?.total ?? 0),
  }));

  const maxVal = Math.max(...series.flatMap((s) => s.values), 1);

  const hasData = series.some((s) => s.values.some((v) => v > 0));
  if (!hasData) {
    return (
      <View style={{ height: CHART_H, justifyContent: "center", alignItems: "center" }}>
        <Ionicons name="bar-chart-outline" size={32} color="#D4EFF4" />
        <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 6 }}>Belum ada data</Text>
      </View>
    );
  }

  const BAR_W = branchIds.length <= 2 ? 18 : branchIds.length <= 3 ? 12 : 8;
  const BAR_GAP = 2;

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: CHART_H + 20 }}>
        {dates.map(({ label }, di) => {
          const isLast = di === dates.length - 1;
          const isActive = activeIdx === di;
          const colTotal = series.reduce((s, b) => s + b.values[di], 0);
          return (
            <TouchableOpacity
              key={di}
              style={{ flex: 1, alignItems: "center" }}
              onPress={() => setActiveIdx(isActive ? null : di)}
              activeOpacity={0.8}
            >
              {isActive && (
                <View style={{
                  position: "absolute", top: -38, left: "50%",
                  transform: [{ translateX: -52 }],
                  backgroundColor: "#1A202C", borderRadius: 8,
                  paddingHorizontal: 8, paddingVertical: 5,
                  zIndex: 10, minWidth: 104, alignItems: "center",
                }}>
                  {series.length === 1 ? (
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#fff" }}>
                      {fmtCurrency(colTotal)}
                    </Text>
                  ) : (
                    series.map((s) => (
                      <View key={s.branchId} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.color }} />
                        <Text style={{ fontSize: 10, color: "#fff" }} numberOfLines={1}>
                          {(branchNames[s.branchId] ?? "").split(" ")[0]}: {fmtCurrency(s.values[di])}
                        </Text>
                      </View>
                    ))
                  )}
                  <View style={{
                    position: "absolute", bottom: -5, left: "50%",
                    transform: [{ translateX: -5 }],
                    width: 0, height: 0,
                    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 5,
                    borderLeftColor: "transparent", borderRightColor: "transparent",
                    borderTopColor: "#1A202C",
                  }} />
                </View>
              )}

              <View style={{ height: CHART_H, flexDirection: "row", alignItems: "flex-end", gap: BAR_GAP }}>
                {series.map((s) => {
                  const h = Math.max((s.values[di] / maxVal) * CHART_H, s.values[di] > 0 ? 4 : 2);
                  return (
                    <View
                      key={s.branchId}
                      style={{
                        width: BAR_W, height: h, borderRadius: 4,
                        backgroundColor: isActive ? s.color : (isLast ? s.color : s.color + "99"),
                        opacity: activeIdx !== null && !isActive ? 0.4 : 1,
                      }}
                    />
                  );
                })}
              </View>
              <Text style={{
                fontSize: 9, marginTop: 4,
                color: isActive ? "#347385" : isLast ? "#347385" : "#9CA3AF",
                fontWeight: isActive || isLast ? "700" : "400",
              }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {branchIds.length > 1 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
          {series.map((s) => (
            <View key={s.branchId} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color }} />
              <Text style={{ fontSize: 10, color: "#6B7280" }}>{branchNames[s.branchId] ?? s.branchId}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────


// ─── Owner interface ──────────────────────────────────────────────────────────

interface OwnerBranch {
  id: string;
  name: string;
  is_active: boolean;
}

// ─── Preset helpers ───────────────────────────────────────────────────────────

type Preset = 'today' | 'week' | 'month' | 'year' | 'custom';

function getPresetRange(preset: Preset) {
  const now = new Date();
  if (preset === 'today') return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { from: startOfDay(start), to: endOfDay(now) };
  }
  if (preset === 'month') {
    const start = new Date(now);
    start.setDate(1);
    return { from: startOfDay(start), to: endOfDay(now) };
  }
  if (preset === 'year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: startOfDay(start), to: endOfDay(now) };
  }
  return { from: startOfDay(now), to: endOfDay(now) };
}

const PRESET_LABELS: Record<Preset, string> = {
  today: 'Hari Ini',
  week: '7 Hari',
  month: 'Bulan Ini',
  year: 'Tahun Ini',
  custom: 'Custom',
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function OwnerDashboard() {
  const { user, logout } = useAuth();

  const [preset, setPreset] = useState<Preset>('today');
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date()),
  });
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [branches, setBranches] = useState<OwnerBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<BranchSummary[]>([]);
  const [chartData, setChartData] = useState<DailySales[]>([]);
  const [chartMode, setChartMode] = useState<ChartMode>('daily');
  const [chartRange, setChartRange] = useState<{ from: string; to: string }>({
    from: startOfDay(new Date()), to: endOfDay(new Date()),
  });
  const [topProducts, setTopProducts] = useState<TopProductMulti[]>([]);
  const [pendingOpnames, setPendingOpnames] = useState<PendingOpname[]>([]);
  const [criticalBranches, setCriticalBranches] = useState<CriticalStockBranch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (branchId: string | null, p: Preset, cRange?: { from: string; to: string }) => {
    setLoading(true);
    try {
      const { from, to } = p === 'custom' && cRange ? cRange : getPresetRange(p);
      const bIds = branchId ? [branchId] : null;

      let chartFetch: Promise<DailySales[]>;
      let mode: ChartMode;

      if (p === 'custom' && cRange) {
        const diffMs = new Date(cRange.to).getTime() - new Date(cRange.from).getTime();
        const diffDays = diffMs / 86400000;
        if (diffDays < 7) {
          mode = 'daily';
          chartFetch = getMultiBranchDailySales(bIds, 7, cRange.from, cRange.to);
        } else if (diffDays < 31) {
          mode = 'weekly';
          chartFetch = getMultiBranchWeeklySales(bIds, 4, cRange.from, cRange.to);
        } else {
          mode = 'monthly';
          chartFetch = getMultiBranchMonthlySales(bIds, 12, cRange.from, cRange.to);
        }
      } else if (p === 'month') {
        mode = 'weekly';
        chartFetch = getMultiBranchWeeklySales(bIds, 4, from, to);
      } else if (p === 'year') {
        mode = 'monthly';
        const yearStart = new Date(Date.UTC(new Date().getFullYear() - 1, 11, 31, 17, 0, 0, 0));
        chartFetch = getMultiBranchMonthlySales(bIds, 12, yearStart.toISOString(), to);
      } else {
        mode = 'daily';
        chartFetch = getMultiBranchDailySales(bIds, 7, from, to);
      }

      const [sumData, chartRaw, topProds, opnames, critical] = await Promise.all([
        getBranchSummaries(bIds, from, to),
        chartFetch,
        getMultiBranchTopProducts(bIds, from, to, 5),
        getPendingOpnames(),
        getCriticalStockBranches(),
      ]);
      setSummaries(sumData);
      setChartData(chartRaw);
      setChartMode(mode);
      setChartRange({ from, to });
      setTopProducts(topProds);
      setPendingOpnames(opnames);
      setCriticalBranches(critical);
    } catch (e) {
      console.error("[OwnerDashboard] load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllBranches()
      .then((b) => setBranches(b as OwnerBranch[]))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(selectedBranchId, preset, customRange);
    }, [selectedBranchId, preset, customRange]),
  );

  const totalRevenue = summaries.reduce((s, b) => s + b.total_revenue, 0);
  const totalTx = summaries.reduce((s, b) => s + b.transaction_count, 0);
  const avgTx = totalTx > 0 ? totalRevenue / totalTx : 0;
  const totalProfit = summaries.reduce((s, b) => s + b.gross_profit, 0);

  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const branchNamesMap: Record<string, string> = {};
  branches.forEach((b) => { branchNamesMap[b.id] = b.name; });

  const chartBranchIds = selectedBranchId
    ? [selectedBranchId]
    : [...new Set(chartData.map((d) => d.branch_id))];

  const alertCount = pendingOpnames.length + criticalBranches.reduce((s, b) => s + b.critical_count, 0);

  const menuItems = [
    { label: "Produk", icon: "cube-outline" as const, iconBg: "#EDE9FE", iconColor: "#7C3AED", route: "/(owner)/products" },
    { label: "Cabang", icon: "business-outline" as const, iconBg: "#DCFCE7", iconColor: "#16A34A", route: "/(owner)/management/branches" },
    { label: "Member", icon: "card-outline" as const, iconBg: "#FFF3E0", iconColor: "#D97706", route: "/(owner)/management/members" },
    { label: "Reward Poin", icon: "gift-outline" as const, iconBg: "#FEF3C7", iconColor: "#D97706", route: "/(owner)/management/rewards" },
    { label: "Shift", icon: "time-outline" as const, iconBg: "#EEF8FA", iconColor: "#347385", route: "/(owner)/management/shifts" },
    { label: "Pengeluaran", icon: "wallet-outline" as const, iconBg: "#FEF2F2", iconColor: "#DC2626", route: "/(owner)/management/expenses" },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* ── Header ── */}
      <OwnerDashboardHeader
        userName={user?.name}
        dateLabel={today}
        onLogout={() => logout().then(() => router.replace("/(auth)/login"))}
      />

      {/* ── Branch selector ── */}
      <View style={styles.branchBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: null as any, name: "Semua Cabang" }, ...branches]}
          keyExtractor={(b) => b.id ?? "__all__"}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
          renderItem={({ item }) => {
            const active = selectedBranchId === item.id;
            return (
              <TouchableOpacity
                style={[styles.branchChip, active && styles.branchChipActive]}
                onPress={() => setSelectedBranchId(item.id)}
                activeOpacity={0.75}
              >
                <Text style={[styles.branchChipText, active && styles.branchChipTextActive]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* ── Preset filter ── */}
      <View style={styles.presetBar}>
        {(['today', 'week', 'month', 'year', 'custom'] as Preset[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.presetChip, preset === p && styles.presetChipActive]}
            onPress={() => {
              if (p === 'custom') { setCustomModalVisible(true); }
              else { setPreset(p); }
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.presetChipText, preset === p && styles.presetChipTextActive]}>
              {PRESET_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {preset === 'custom' && (
        <TouchableOpacity style={styles.customRangeBar} onPress={() => setCustomModalVisible(true)}>
          <Ionicons name="calendar-outline" size={13} color="#347385" />
          <Text style={styles.customRangeText}>
            {fmtDisplay(customRange.from)} — {fmtDisplay(customRange.to)}
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={{ paddingTop: 80, alignItems: "center" }}>
          <ActivityIndicator size="large" color="#56B2C1" />
          <Text style={{ color: "#9CA3AF", fontSize: 13, marginTop: 12 }}>Memuat data...</Text>
        </View>
      ) : (
        <>
          {/* ── Hero card ── */}
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroLabel}>
                  Total Penjualan · {preset === 'custom' ? `${fmtDisplay(customRange.from)} — ${fmtDisplay(customRange.to)}` : PRESET_LABELS[preset]}
                </Text>
                <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
                  {fmtCurrency(totalRevenue)}
                </Text>
              </View>
              <View style={styles.heroBadge}>
                <Ionicons name="receipt-outline" size={14} color="#347385" />
                <Text style={styles.heroBadgeText}>{totalTx} transaksi</Text>
              </View>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>{fmtCurrency(avgTx)}</Text>
                <Text style={styles.heroStatLbl}>Rata-rata/Tx</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatVal, { color: "#38A169" }]}>{fmtCurrency(totalProfit)}</Text>
                <Text style={styles.heroStatLbl}>Laba Kotor Est.</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatVal, alertCount > 0 && { color: "#EF4444" }]}>{alertCount}</Text>
                <Text style={styles.heroStatLbl}>Perlu Perhatian</Text>
              </View>
            </View>
          </View>

          {/* ── Quick actions ── */}
          <Text style={styles.sectionLabel}>Menu</Text>
          <View style={styles.qaGrid}>
            {[0, 1].map((rowIdx) => (
              <View key={rowIdx} style={styles.qaRow}>
                {menuItems.slice(rowIdx * 3, rowIdx * 3 + 3).map((item) => (
                  <TouchableOpacity
                    key={item.label}
                    style={styles.qaBtn}
                    onPress={() => router.push(`${item.route}?from=dashboard` as any)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.qaIcon, { backgroundColor: item.iconBg }]}>
                      <Ionicons name={item.icon} size={22} color={item.iconColor} />
                    </View>
                    <Text style={styles.qaLabel}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>

          {/* ── Chart ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {chartMode === 'daily' ? 'Penjualan per Hari' :
                 chartMode === 'weekly' ? 'Penjualan per Minggu' :
                 'Penjualan per Bulan'}
              </Text>
              <TouchableOpacity onPress={() => router.push("/(owner)/reports" as any)}>
                <Text style={styles.cardLink}>Lihat detail</Text>
              </TouchableOpacity>
            </View>
            <MultiBranchBarChart
              data={chartData}
              branchIds={chartBranchIds}
              branchNames={branchNamesMap}
              mode={chartMode}
              from={chartRange.from}
              to={chartRange.to}
            />
          </View>

          {/* ── Top products ── */}
          {topProducts.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Produk Terlaris</Text>
                <Text style={styles.cardSub}>{preset === 'custom' ? `${fmtDisplay(chartRange.from)} — ${fmtDisplay(chartRange.to)}` : PRESET_LABELS[preset]}</Text>
              </View>
              {topProducts.map((p, i) => {
                const maxQty = topProducts[0].qty_sold;
                const pct = maxQty > 0 ? p.qty_sold / maxQty : 0;
                return (
                  <View key={p.product_name} style={{ marginBottom: i < topProducts.length - 1 ? 12 : 0 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                        <View style={[styles.rankBadge, i === 0 && styles.rankBadgeTop]}>
                          <Text style={[styles.rankText, i === 0 && styles.rankTextTop]}>{i + 1}</Text>
                        </View>
                        <Text style={styles.productName} numberOfLines={1}>{p.product_name}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.productQty}>{p.qty_sold} terjual</Text>
                        <Text style={styles.productRevenue}>{fmtCurrency(p.revenue)}</Text>
                      </View>
                    </View>
                    <View style={styles.barBg}>
                      <View style={[styles.barFill, { width: `${pct * 100}%` as any }, i === 0 && styles.barFillTop]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Branch comparison ── */}
          {summaries.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Perbandingan Cabang</Text>
                <Text style={styles.cardSub}>{PRESET_LABELS[preset]}</Text>
              </View>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeadCell, { flex: 1.8 }]}>Cabang</Text>
                <Text style={[styles.tableHeadCell, { flex: 1.4, textAlign: "right" }]}>Penjualan</Text>
                <Text style={[styles.tableHeadCell, { flex: 0.6, textAlign: "center" }]}>Tx</Text>
              </View>
              {summaries.map((s, i) => (
                <TouchableOpacity
                  key={s.branch_id}
                  style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}
                  onPress={() => router.push(`/(owner)/reports/sales?branchId=${s.branch_id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1.8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length] }} />
                    <Text style={styles.tableCellText} numberOfLines={1}>{s.branch_name}</Text>
                  </View>
                  <Text style={[styles.tableCellText, { flex: 1.4, textAlign: "right", fontWeight: "700", color: "#1A202C" }]}>
                    {fmtCurrency(s.total_revenue)}
                  </Text>
                  <View style={{ flex: 0.6, alignItems: "center" }}>
                    <View style={styles.txBadge}>
                      <Text style={styles.txBadgeText}>{s.transaction_count}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Alerts ── */}
          {(pendingOpnames.length > 0 || criticalBranches.length > 0) && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Perlu Perhatian</Text>
                {alertCount > 0 && (
                  <View style={styles.alertCountBadge}>
                    <Text style={styles.alertCountText}>{alertCount}</Text>
                  </View>
                )}
              </View>

              {pendingOpnames.length > 0 && (
                <TouchableOpacity
                  style={styles.alertRow}
                  onPress={() => router.push("/(owner)/approvals" as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.alertIconWrap, { backgroundColor: "#D4EFF4" }]}>
                    <Ionicons name="clipboard-outline" size={18} color="#347385" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertTitle}>Opname Menunggu Persetujuan</Text>
                    <Text style={styles.alertSub}>
                      {pendingOpnames.length} opname · {[...new Set(pendingOpnames.map((o) => o.branch_name))].join(", ")}
                    </Text>
                  </View>
                  <View style={styles.alertBadge}>
                    <Text style={styles.alertBadgeText}>{pendingOpnames.length}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {criticalBranches.map((b) => (
                <View key={b.branch_id} style={styles.alertRow}>
                  <View style={[styles.alertIconWrap, { backgroundColor: "#FEF2F2" }]}>
                    <Ionicons name="warning-outline" size={18} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertTitle}>{b.branch_name}</Text>
                    <Text style={styles.alertSub}>{b.critical_count} produk stok habis</Text>
                  </View>
                  <View style={[styles.alertBadge, { backgroundColor: "#FEE2E2" }]}>
                    <Text style={[styles.alertBadgeText, { color: "#DC2626" }]}>{b.critical_count}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <CustomRangeModal
        visible={customModalVisible}
        from={customRange.from}
        to={customRange.to}
        onClose={() => setCustomModalVisible(false)}
        onConfirm={(from, to) => {
          setCustomModalVisible(false);
          setPreset('custom');
          setCustomRange({ from, to });
          load(selectedBranchId, 'custom', { from, to });
        }}
      />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EDF6F8" },

  // Branch bar
  branchBar: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E5F4F7" },
  branchChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#EEF8FA",
    borderWidth: 1,
    borderColor: "#A9DFE9",
  },
  branchChipActive: { backgroundColor: "#347385", borderColor: "#347385" },
  branchChipText: { fontSize: 13, fontWeight: "600", color: "#347385" },
  branchChipTextActive: { color: "#fff" },

  // Preset filter
  presetBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5F4F7",
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#EEF8FA",
  },
  presetChipActive: { backgroundColor: "#347385" },
  presetChipText: { fontSize: 13, fontWeight: "600", color: "#347385" },
  presetChipTextActive: { color: "#fff" },
  customRangeBar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: "#EEF8FA",
    borderBottomWidth: 1, borderBottomColor: "#E5F4F7",
  },
  customRangeText: { fontSize: 12, fontWeight: "600", color: "#347385" },

  // Hero card
  heroCard: {
    margin: 16,
    marginBottom: 4,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#347385",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#D4EFF4",
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  heroLabel: { fontSize: 12, color: "#6B7280", marginBottom: 4 },
  heroValue: { fontSize: 26, fontWeight: "800", color: "#1A202C", letterSpacing: -0.5 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF8FA",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#A9DFE9",
  },
  heroBadgeText: { fontSize: 12, fontWeight: "700", color: "#347385" },
  heroDivider: { height: 1, backgroundColor: "#F0F7F9", marginBottom: 16 },
  heroStats: { flexDirection: "row" },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatVal: { fontSize: 13, fontWeight: "800", color: "#1A202C", textAlign: "center" },
  heroStatLbl: { fontSize: 10, color: "#9CA3AF", marginTop: 2, textAlign: "center" },
  heroStatDivider: { width: 1, backgroundColor: "#F0F7F9", alignSelf: "stretch" },

  // Section label
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#347385",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Quick actions
  qaGrid: { paddingHorizontal: 16, gap: 10, marginBottom: 4 },
  qaRow: { flexDirection: "row", gap: 10 },
  qaBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    alignItems: "center",
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#D4EFF4",
    shadowColor: "#347385",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  qaIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  qaLabel: { fontSize: 10, fontWeight: "600", color: "#347385", textAlign: "center" },

  // Card
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#347385",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#D4EFF4",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#347385" },
  cardSub: { fontSize: 12, color: "#9CA3AF" },
  cardLink: { fontSize: 12, fontWeight: "600", color: "#56B2C1" },

  // Table
  tableHeader: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF8FA",
    marginBottom: 2,
  },
  tableHeadCell: { fontSize: 11, fontWeight: "700", color: "#9CA3AF" },
  tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 4, borderRadius: 8 },
  tableRowAlt: { backgroundColor: "#F8FCFD" },
  tableCellText: { fontSize: 13, color: "#374151" },
  txBadge: {
    backgroundColor: "#EEF8FA",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  txBadgeText: { fontSize: 12, fontWeight: "700", color: "#347385" },

  // Top products
  rankBadge: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: "#EEF8FA", justifyContent: "center", alignItems: "center",
  },
  rankBadgeTop: { backgroundColor: "#347385" },
  rankText: { fontSize: 11, fontWeight: "700", color: "#347385" },
  rankTextTop: { color: "#fff" },
  productName: { fontSize: 13, fontWeight: "600", color: "#111827", flex: 1 },
  productQty: { fontSize: 12, fontWeight: "700", color: "#347385" },
  productRevenue: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  barBg: { height: 6, backgroundColor: "#EEF8FA", borderRadius: 4, overflow: "hidden" },
  barFill: { height: 6, backgroundColor: "#A9DFE9", borderRadius: 4 },
  barFillTop: { backgroundColor: "#347385" },

  // Alerts
  alertCountBadge: {
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  alertCountText: { fontSize: 12, fontWeight: "700", color: "#DC2626" },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F7F9",
  },
  alertIconWrap: { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  alertTitle: { fontSize: 13, fontWeight: "700", color: "#1A202C" },
  alertSub: { fontSize: 12, color: "#9CA3AF", marginTop: 1 },
  alertBadge: { backgroundColor: "#D4EFF4", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  alertBadgeText: { fontSize: 12, fontWeight: "700", color: "#347385" },
});

const modalSt = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 420, gap: 10 },
  title: { fontSize: 16, fontWeight: '800', color: '#111827' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  datePicker: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#D4EFF4', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#F9FAFB',
    marginBottom: 8,
  },
  datePickerText: { fontSize: 14, fontWeight: '600', color: '#347385' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#347385', alignItems: 'center' },
  confirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
