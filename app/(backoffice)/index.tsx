import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useProductStore } from "@/store/productStore";
import { BackofficeHeader } from "@/components/BackofficeHeader";
import {
  getSalesReport,
  getTopProducts,
  fmtCurrency,
  startOfDay,
  endOfDay,
  type SalesReportResult,
  type TopProduct,
  type SalesByDay,
} from "@/lib/reportQueries";

// ─── Types ────────────────────────────────────────────────────────────────────

type Preset = 'today' | 'week' | 'month' | 'custom';
type ChartMode = 'daily' | 'weekly' | 'monthly';

const PRESET_LABELS: Record<Preset, string> = {
  today: 'Hari Ini',
  week: '7 Hari',
  month: 'Bulan Ini',
  custom: 'Custom',
};

function fmtDisplay(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

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
  return { from: startOfDay(now), to: endOfDay(now) };
}

// ─── Custom Range Modal ───────────────────────────────────────────────────────

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

// ─── Chart ────────────────────────────────────────────────────────────────────

const DAY_SHORT = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
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
    slots.push({ key: isoDay(cur), label: DAY_SHORT[cur.getUTCDay()] });
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
      slots.push({ key, label: `${cur.getUTCDate()} ${MONTH_SHORT[cur.getUTCMonth()]}` });
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
    slots.push({ key, label: m === 0 ? `${MONTH_SHORT[m]}\n${y}` : MONTH_SHORT[m] });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return slots;
}

function aggregateToWeekly(byDay: SalesByDay[]): { date: string; total: number }[] {
  const map: Record<string, number> = {};
  for (const d of byDay) {
    const dt = wibDate(d.date + 'T00:00:00Z');
    const key = isoWeekKey(dt);
    map[key] = (map[key] ?? 0) + d.total;
  }
  return Object.entries(map).map(([date, total]) => ({ date, total }));
}

function aggregateToMonthly(byDay: SalesByDay[]): { date: string; total: number }[] {
  const map: Record<string, number> = {};
  for (const d of byDay) {
    const key = d.date.slice(0, 7);
    map[key] = (map[key] ?? 0) + d.total;
  }
  return Object.entries(map).map(([date, total]) => ({ date, total }));
}

interface BarChartSingleProps {
  byDay: SalesByDay[];
  mode: ChartMode;
  from: string;
  to: string;
}

function BarChartSingle({ byDay, mode, from, to }: BarChartSingleProps) {
  const CHART_H = 110;
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const slots =
    mode === 'daily' ? buildDailySlots(from, to) :
    mode === 'weekly' ? buildWeeklySlots(from, to) :
    buildMonthlySlots(from, to);

  const aggregated =
    mode === 'weekly' ? aggregateToWeekly(byDay) :
    mode === 'monthly' ? aggregateToMonthly(byDay) :
    byDay;

  const values = slots.map(({ key }) =>
    aggregated.find((d) => d.date === key)?.total ?? 0
  );
  const maxVal = Math.max(...values, 1);
  const hasData = values.some((v) => v > 0);

  if (!hasData) {
    return (
      <View style={{ height: CHART_H, justifyContent: "center", alignItems: "center" }}>
        <Ionicons name="bar-chart-outline" size={32} color="#D4EFF4" />
        <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 6 }}>Belum ada data</Text>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: CHART_H + 20 }}>
      {slots.map(({ label }, di) => {
        const isLast = di === slots.length - 1;
        const isActive = activeIdx === di;
        const val = values[di];
        return (
          <TouchableOpacity
            key={di}
            style={{ flex: 1, alignItems: "center" }}
            onPress={() => setActiveIdx(isActive ? null : di)}
            activeOpacity={0.8}
          >
            {isActive && (
              <View style={{
                position: "absolute", top: -34, left: "50%",
                transform: [{ translateX: -48 }],
                backgroundColor: "#1A202C", borderRadius: 8,
                paddingHorizontal: 8, paddingVertical: 5,
                zIndex: 10, minWidth: 96, alignItems: "center",
              }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#fff" }}>
                  {fmtCurrency(val)}
                </Text>
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
            <View style={{ height: CHART_H, justifyContent: "flex-end", alignItems: "center" }}>
              <View style={{
                width: 22,
                height: Math.max((val / maxVal) * CHART_H, val > 0 ? 4 : 2),
                borderRadius: 5,
                backgroundColor: isActive ? "#347385" : (isLast ? "#347385" : "#A9DFE9"),
                opacity: activeIdx !== null && !isActive ? 0.4 : 1,
              }} />
            </View>
            <Text style={{
              fontSize: 9, marginTop: 4,
              color: isActive ? "#347385" : isLast ? "#347385" : "#9CA3AF",
              fontWeight: isActive || isLast ? "700" : "400",
              textAlign: "center",
            }}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function BackOfficeDashboard() {
  const { user, currentBranch, logout } = useAuth();
  const { products, syncFromSupabase } = useProductStore();

  const branchId = currentBranch?.id ?? "";

  const [preset, setPreset] = useState<Preset>('today');
  const [customRange, setCustomRange] = useState({ from: startOfDay(), to: endOfDay() });
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [salesReport, setSalesReport] = useState<SalesReportResult | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [chartMode, setChartMode] = useState<ChartMode>('daily');
  const [chartRange, setChartRange] = useState({ from: startOfDay(), to: endOfDay() });
  const [loading, setLoading] = useState(true);
  const [pendingTransfers, setPendingTransfers] = useState<{ id: string; created_at: string; total_qty: number }[]>([]);

  const loadPendingTransfers = useCallback(async () => {
    if (!branchId) return;
    try {
      const { data } = await supabase
        .from('stock_transfers')
        .select('id, created_at, stock_transfer_items(quantity)')
        .eq('branch_id', branchId)
        .eq('status', 'sent')
        .order('created_at', { ascending: false });
      setPendingTransfers(
        (data ?? []).map((t: any) => ({
          id: t.id,
          created_at: t.created_at,
          total_qty: (t.stock_transfer_items ?? []).reduce((s: number, i: any) => s + (i.quantity ?? 0), 0),
        }))
      );
    } catch {}
  }, [branchId]);

  const load = useCallback(async (p: Preset, cRange?: { from: string; to: string }) => {
    if (!branchId) return;
    setLoading(true);
    try {
      const { from, to } = p === 'custom' && cRange ? cRange : getPresetRange(p);

      let mode: ChartMode;
      if (p === 'custom' && cRange) {
        const diffDays = (new Date(cRange.to).getTime() - new Date(cRange.from).getTime()) / 86400000;
        mode = diffDays < 7 ? 'daily' : diffDays < 31 ? 'weekly' : 'monthly';
      } else if (p === 'month') {
        mode = 'weekly';
      } else {
        mode = 'daily';
      }

      const [report, topProds] = await Promise.all([
        getSalesReport(from, to, branchId),
        getTopProducts(from, to, branchId, 5),
      ]);

      setSalesReport(report);
      setTopProducts(topProds);
      setChartMode(mode);
      setChartRange({ from, to });
    } catch (e) {
      console.error("[BackofficeDashboard] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useFocusEffect(
    useCallback(() => {
      syncFromSupabase();
      load(preset, customRange);
      loadPendingTransfers();
    }, [branchId, preset, customRange]),
  );

  const productStats = (() => {
    const active = products.filter((p) => p.is_active === 1);
    return {
      total: active.length,
      lowStock: active.filter((p) => p.stock > 0 && p.stock <= p.min_stock).length,
      outOfStock: active.filter((p) => p.stock === 0).length,
    };
  })();

  const totalRevenue = salesReport?.total_revenue ?? 0;
  const totalTx = salesReport?.transaction_count ?? 0;
  const avgTx = totalTx > 0 ? totalRevenue / totalTx : 0;
  const grossProfit = salesReport?.gross_profit ?? 0;

  const handleLogout = async () => {
    Alert.alert("Keluar", "Yakin ingin keluar?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Keluar",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const menuItems = [
    { label: "Manajemen Shift", icon: "time-outline" as const, iconBg: "#EEF8FA", iconColor: "#347385", route: "/(backoffice)/reports/shifts" },
    { label: "Pengeluaran", icon: "wallet-outline" as const, iconBg: "#FEF2F2", iconColor: "#DC2626", route: "/(backoffice)/reports/expenses" },
    { label: "Pengaturan Printer", icon: "print-outline" as const, iconBg: "#F0FDF4", iconColor: "#16A34A", route: "/(backoffice)/settings/printer" },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <BackofficeHeader
        title={`Halo, ${user?.name || "Staff"}`}
        subtitle={`Staff Cabang · ${currentBranch?.name || "-"}`}
        onLogout={handleLogout}
      />

      {/* ── Preset filter ── */}
      <View style={styles.presetBar}>
        {(['today', 'week', 'month', 'custom'] as Preset[]).map((p) => (
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
          {/* ── Notif distribusi pending ── */}
          {pendingTransfers.length > 0 && (
            <TouchableOpacity
              style={styles.incomingBanner}
              onPress={() => router.push('/(backoffice)/stock/incoming-transfers' as any)}
              activeOpacity={0.85}
            >
              <View style={styles.incomingIconWrap}>
                <Ionicons name="arrow-down-circle" size={24} color="#fff" />
                {pendingTransfers.length > 1 && (
                  <View style={styles.incomingBadge}>
                    <Text style={styles.incomingBadgeText}>{pendingTransfers.length}</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.incomingTitle}>
                  {pendingTransfers.length === 1
                    ? 'Ada distribusi stok masuk'
                    : `${pendingTransfers.length} distribusi stok menunggu`}
                </Text>
                <Text style={styles.incomingSub}>
                  {pendingTransfers.length === 1
                    ? `${pendingTransfers[0].total_qty} produk · Tap untuk konfirmasi`
                    : 'Tap untuk lihat dan konfirmasi penerimaan'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}

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
                <Text style={[styles.heroStatVal, { color: "#38A169" }]}>{fmtCurrency(grossProfit)}</Text>
                <Text style={styles.heroStatLbl}>Laba Kotor Est.</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatVal, productStats.outOfStock > 0 && { color: "#EF4444" }]}>
                  {productStats.outOfStock}
                </Text>
                <Text style={styles.heroStatLbl}>Stok Habis</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatVal, productStats.lowStock > 0 && { color: "#E69738" }]}>
                  {productStats.lowStock}
                </Text>
                <Text style={styles.heroStatLbl}>Stok Rendah</Text>
              </View>
            </View>
          </View>

          {/* ── Chart ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {chartMode === 'daily' ? 'Penjualan per Hari' :
                 chartMode === 'weekly' ? 'Penjualan per Minggu' :
                 'Penjualan per Bulan'}
              </Text>
              <TouchableOpacity onPress={() => router.push("/(backoffice)/reports" as any)}>
                <Text style={styles.cardLink}>Lihat detail</Text>
              </TouchableOpacity>
            </View>
            <BarChartSingle
              byDay={salesReport?.by_day ?? []}
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
                  <View key={p.product_id || p.product_name} style={{ marginBottom: i < topProducts.length - 1 ? 12 : 0 }}>
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

          {/* ── Menu ── */}
          <Text style={styles.sectionLabel}>Menu</Text>
          <View style={styles.menuCard}>
            {menuItems.map((item, idx) => (
              <TouchableOpacity
                key={item.label}
                style={[styles.menuItem, idx === 0 && { borderTopWidth: 0 }]}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={19} color={item.iconColor} />
                </View>
                <Text style={styles.menuTitle}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color="#C4E5ED" />
              </TouchableOpacity>
            ))}
          </View>
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
          load('custom', { from, to });
        }}
      />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EDF6F8" },

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
  incomingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: '#347385', borderRadius: 16, padding: 16,
  },
  incomingIconWrap: { position: 'relative' },
  incomingBadge: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#EF4444', borderRadius: 10,
    minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  incomingBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  incomingTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  incomingSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

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
  heroStatVal: { fontSize: 12, fontWeight: "800", color: "#1A202C", textAlign: "center" },
  heroStatLbl: { fontSize: 10, color: "#9CA3AF", marginTop: 2, textAlign: "center" },
  heroStatDivider: { width: 1, backgroundColor: "#F0F7F9", alignSelf: "stretch" },

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

  // Menu
  menuCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D4EFF4",
    shadowColor: "#347385",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "#F0F7F9",
  },
  menuIconWrap: {
    width: 40, height: 40, borderRadius: 11,
    justifyContent: "center", alignItems: "center",
  },
  menuTitle: { fontSize: 14, fontWeight: "600", color: "#1A202C", flex: 1 },
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
