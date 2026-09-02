/**
 * Laporan Penjualan Konsolidasi - multi-cabang
 * Filter: periode + pilih cabang
 * Tabel: Cabang | Total Penjualan | Transaksi | HPP | Laba Kotor
 * Bar chart perbandingan per cabang
 * Drill-down: tap cabang → detail transaksi
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, FlatList, Modal, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getBranchSummaries, fetchAllBranches, fmtCurrency,
  startOfDay, endOfDay, type BranchSummary,
} from '@/lib/ownerQueries';
import { getSalesReport, type SalesReportResult, type SalesTransaction } from '@/lib/reportQueries';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { OwnerPageHeader } from '@/components/OwnerHeader';

const { width: SW } = Dimensions.get('window');
const BRANCH_COLORS = ['#347385', '#56B2C1', '#22C55E', '#F59E0B', '#06B6D4', '#EF4444'];

// ─── Preset periods ────────────────────────────────────────────────────────────

type Preset = 'today' | 'week' | 'month';

function getRange(preset: Preset) {
  const today = new Date();
  if (preset === 'today') {
    return { from: startOfDay(today), to: endOfDay(today) };
  }
  if (preset === 'week') {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { from: startOfDay(start), to: endOfDay(today) };
  }
  const start = new Date(today);
  start.setDate(1);
  return { from: startOfDay(start), to: endOfDay(today) };
}

// ─── Simple bar chart ──────────────────────────────────────────────────────────

function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const BAR_H = 160;
  const BAR_W = Math.max(32, (SW - 64) / Math.max(data.length, 1) - 8);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
      {data.map((item, i) => {
        const h = Math.max(4, (item.value / maxVal) * BAR_H);
        return (
          <View key={i} style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 8, color: '#9CA3AF', textAlign: 'center' }} numberOfLines={2}>
              {fmtCurrency(item.value)}
            </Text>
            <View
              style={{
                width: BAR_W, height: h, borderRadius: 6,
                backgroundColor: item.color,
                opacity: 0.85,
              }}
            />
            <Text style={{ fontSize: 9, color: '#6B7280', textAlign: 'center', maxWidth: BAR_W + 8 }} numberOfLines={2}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Drill-down modal ──────────────────────────────────────────────────────────

function DrilldownModal({
  branchId,
  branchName,
  from,
  to,
  onClose,
}: {
  branchId: string;
  branchName: string;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<SalesReportResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSalesReport(from, to, branchId)
      .then(setReport)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [branchId, from, to]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={ddStyles.container}>
        <OwnerPageHeader title={branchName} onClose={onClose} />

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#56B2C1" />
          </View>
        ) : report ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <View style={ddStyles.summaryRow}>
              {[
                { label: 'Penjualan', value: fmtCurrency(report.total_revenue) },
                { label: 'Transaksi', value: report.transaction_count.toString() },
                { label: 'HPP', value: fmtCurrency(report.total_cost) },
                { label: 'Laba Kotor', value: fmtCurrency(report.gross_profit) },
              ].map((m) => (
                <View key={m.label} style={ddStyles.summaryCard}>
                  <Text style={ddStyles.summaryValue} numberOfLines={1}>{m.value}</Text>
                  <Text style={ddStyles.summaryLabel}>{m.label}</Text>
                </View>
              ))}
            </View>

            <Text style={ddStyles.sectionTitle}>Transaksi</Text>
            {report.transactions.map((tx) => (
              <View key={tx.id} style={ddStyles.txRow}>
                <View style={{ flex: 1 }}>
                  <Text style={ddStyles.txInvoice}>{tx.invoice_number}</Text>
                  <Text style={ddStyles.txSub}>{tx.cashier_name} · {tx.payment_method}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={ddStyles.txAmount}>{fmtCurrency(tx.total)}</Text>
                  <Text style={[ddStyles.txSub, tx.status === 'void' && { color: '#EF4444' }]}>
                    {tx.status}
                  </Text>
                </View>
              </View>
            ))}
            {report.transactions.length === 0 && (
              <Text style={{ color: '#9CA3AF', textAlign: 'center', paddingVertical: 20 }}>
                Belum ada transaksi
              </Text>
            )}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

interface OwnerBranch { id: string; name: string; is_active: boolean }

export default function ConsolidatedSalesReport() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const params = useLocalSearchParams<{ branchId?: string; mode?: string }>();

  const [preset, setPreset] = useState<Preset>('today');
  const [branches, setBranches] = useState<OwnerBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    params.branchId ?? null
  );
  const [summaries, setSummaries] = useState<BranchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchAllBranches()
      .then((b) => setBranches(b as OwnerBranch[]))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = getRange(preset);
    const bIds = selectedBranchId ? [selectedBranchId] : null;
    try {
      const data = await getBranchSummaries(bIds, from, to);
      setSummaries(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [preset, selectedBranchId]);

  useEffect(() => { load(); }, [load]);

  const { from, to } = getRange(preset);
  const totalRevenue = summaries.reduce((s, b) => s + b.total_revenue, 0);
  const totalTx = summaries.reduce((s, b) => s + b.transaction_count, 0);
  const totalGP = summaries.reduce((s, b) => s + b.gross_profit, 0);

  const barData = summaries.map((s, i) => ({
    label: s.branch_name,
    value: s.total_revenue,
    color: BRANCH_COLORS[i % BRANCH_COLORS.length],
  }));

  return (
    <View style={styles.container}>
      <OwnerPageHeader title="Penjualan Konsolidasi" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <TabletCenteredView>
          {/* Preset filter */}
          <View style={styles.filterRow}>
            {(['today', 'week', 'month'] as Preset[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, preset === p && styles.chipActive]}
                onPress={() => setPreset(p)}
              >
                <Text style={[styles.chipText, preset === p && styles.chipTextActive]}>
                  {p === 'today' ? 'Hari Ini' : p === 'week' ? '7 Hari' : 'Bulan Ini'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Branch filter */}
          <FlatList
            horizontal showsHorizontalScrollIndicator={false}
            data={[{ id: null as any, name: 'Semua Cabang' }, ...branches]}
            keyExtractor={(b) => b.id ?? '__all__'}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}
            renderItem={({ item }) => {
              const active = selectedBranchId === item.id;
              return (
                <TouchableOpacity
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSelectedBranchId(item.id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />

          {loading ? (
            <View style={{ paddingTop: 48, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#56B2C1" />
            </View>
          ) : (
            <>
              {/* Summary cards */}
              <View style={[styles.cardRow, isTablet && styles.cardRowTablet]}>
                {[
                  { label: 'Total Penjualan', value: fmtCurrency(totalRevenue), color: '#22C55E' },
                  { label: 'Transaksi', value: totalTx.toString(), color: '#347385' },
                  { label: 'Laba Kotor Est.', value: fmtCurrency(totalGP), color: '#56B2C1' },
                ].map((m) => (
                  <View key={m.label} style={[styles.summaryCard, isTablet && styles.summaryCardTablet]}>
                    <Text style={[styles.summaryValue, { color: m.color }]}>{m.value}</Text>
                    <Text style={styles.summaryLabel}>{m.label}</Text>
                  </View>
                ))}
              </View>

              {/* Bar chart */}
              {summaries.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Perbandingan Penjualan per Cabang</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <BarChart data={barData} />
                  </ScrollView>
                </View>
              )}

              {/* Table */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Detail per Cabang</Text>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 1.6 }]}>Cabang</Text>
                  <Text style={[styles.th, { flex: 1.4, textAlign: 'right' }]}>Penjualan</Text>
                  <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>Tx</Text>
                  <Text style={[styles.th, { flex: 1.3, textAlign: 'right' }]}>Laba</Text>
                </View>
                {summaries.length === 0 && (
                  <Text style={styles.empty}>Belum ada data</Text>
                )}
                {summaries.map((s, i) => (
                  <TouchableOpacity
                    key={s.branch_id}
                    style={[styles.tableRow, i % 2 === 1 && { backgroundColor: '#F9FAFB' }]}
                    onPress={() => setDrilldown({ id: s.branch_id, name: s.branch_name })}
                  >
                    <View style={{ flex: 1.6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length] }} />
                      <Text style={styles.td} numberOfLines={1}>{s.branch_name}</Text>
                    </View>
                    <Text style={[styles.td, { flex: 1.4, textAlign: 'right', fontWeight: '700' }]}>
                      {fmtCurrency(s.total_revenue)}
                    </Text>
                    <Text style={[styles.td, { flex: 0.7, textAlign: 'center' }]}>{s.transaction_count}</Text>
                    <Text style={[styles.td, { flex: 1.3, textAlign: 'right', color: '#22C55E' }]}>
                      {fmtCurrency(s.gross_profit)}
                    </Text>
                  </TouchableOpacity>
                ))}
                {/* Totals row */}
                {summaries.length > 0 && (
                  <View style={[styles.tableRow, styles.totalsRow]}>
                    <Text style={[styles.td, { flex: 1.6, fontWeight: '700' }]}>Total</Text>
                    <Text style={[styles.td, { flex: 1.4, textAlign: 'right', fontWeight: '700' }]}>
                      {fmtCurrency(totalRevenue)}
                    </Text>
                    <Text style={[styles.td, { flex: 0.7, textAlign: 'center', fontWeight: '700' }]}>{totalTx}</Text>
                    <Text style={[styles.td, { flex: 1.3, textAlign: 'right', fontWeight: '700', color: '#22C55E' }]}>
                      {fmtCurrency(totalGP)}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </TabletCenteredView>
      </ScrollView>

      {drilldown && (
        <DrilldownModal
          branchId={drilldown.id}
          branchName={drilldown.name}
          from={from}
          to={to}
          onClose={() => setDrilldown(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16,
    paddingTop: 14, paddingBottom: 8,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F3F4F6' },
  chipActive: { backgroundColor: '#56B2C1' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },

  cardRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  cardRowTablet: {},
  summaryCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  summaryCardTablet: {},
  summaryValue: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  summaryLabel: { fontSize: 10, color: '#9CA3AF' },

  card: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 },

  tableHeader: {
    flexDirection: 'row', paddingBottom: 6,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 2,
  },
  th: { fontSize: 11, fontWeight: '700', color: '#9CA3AF' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderRadius: 6, paddingHorizontal: 4 },
  totalsRow: { borderTopWidth: 1, borderTopColor: '#E5E7EB', marginTop: 4, backgroundColor: '#F9FAFB' },
  td: { fontSize: 13, color: '#374151' },
  empty: { color: '#9CA3AF', textAlign: 'center', paddingVertical: 20 },
});

const ddStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  summaryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  summaryCard: {
    flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 10, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  summaryValue: { fontSize: 14, fontWeight: '800', color: '#111827' },
  summaryLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 4, marginBottom: 6 },
  txRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 6,
  },
  txInvoice: { fontSize: 13, fontWeight: '700', color: '#111827' },
  txSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700', color: '#111827' },
});
