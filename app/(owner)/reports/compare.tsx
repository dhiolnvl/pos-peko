import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, Modal, useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import {
  getBranchSummaries, fmtCurrency,
  startOfDay, endOfDay, type BranchSummary,
} from '@/lib/ownerQueries';
import { getSalesReport, type SalesReportResult } from '@/lib/reportQueries';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { OwnerPageHeader } from '@/components/OwnerHeader';

const { width: SW } = Dimensions.get('window');
const BRANCH_COLORS = ['#744F3D', '#A67C6B', '#22C55E', '#F59E0B', '#06B6D4', '#EF4444'];

type Preset = 'today' | 'week' | 'month';
type Metric = 'revenue' | 'transaction' | 'profit';

function getRange(preset: Preset) {
  const today = new Date();
  if (preset === 'today') return { from: startOfDay(today), to: endOfDay(today) };
  if (preset === 'week') {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { from: startOfDay(start), to: endOfDay(today) };
  }
  const start = new Date(today);
  start.setDate(1);
  return { from: startOfDay(start), to: endOfDay(today) };
}

function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const BAR_H = 180;
  const BAR_W = Math.max(40, (SW - 80) / Math.max(data.length, 1) - 10);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, minHeight: BAR_H + 60 }}>
      {data.map((item, i) => {
        const h = Math.max(4, (item.value / maxVal) * BAR_H);
        return (
          <View key={i} style={{ alignItems: 'center', gap: 4, width: BAR_W }}>
            <Text style={{ fontSize: 9, color: '#6B7280', textAlign: 'center' }} numberOfLines={2}>
              {fmtCurrency(item.value)}
            </Text>
            <View style={{ width: BAR_W, height: h, borderRadius: 8, backgroundColor: item.color }} />
            <Text style={{ fontSize: 10, color: '#374151', textAlign: 'center', fontWeight: '600' }} numberOfLines={2}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function DrilldownModal({
  branchId, branchName, from, to, onClose,
}: { branchId: string; branchName: string; from: string; to: string; onClose: () => void }) {
  const [report, setReport] = useState<SalesReportResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSalesReport(from, to, branchId)
      .then(setReport).catch(console.error).finally(() => setLoading(false));
  }, [branchId, from, to]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
        <OwnerPageHeader title={branchName} onClose={onClose} />
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#744F3D" />
          </View>
        ) : report ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'Penjualan', value: fmtCurrency(report.total_revenue), color: '#22C55E' },
                { label: 'Transaksi', value: report.transaction_count.toString(), color: '#744F3D' },
                { label: 'HPP', value: fmtCurrency(report.total_cost), color: '#EF4444' },
                { label: 'Laba Kotor', value: fmtCurrency(report.gross_profit), color: '#A67C6B' },
              ].map((m) => (
                <View key={m.label} style={ddStyles.card}>
                  <Text style={[ddStyles.val, { color: m.color }]}>{m.value}</Text>
                  <Text style={ddStyles.lbl}>{m.label}</Text>
                </View>
              ))}
            </View>
            <Text style={ddStyles.section}>Transaksi</Text>
            {report.transactions.map((tx) => (
              <View key={tx.id} style={ddStyles.txRow}>
                <View style={{ flex: 1 }}>
                  <Text style={ddStyles.invoice}>{tx.invoice_number}</Text>
                  <Text style={ddStyles.sub}>{tx.cashier_name} · {tx.payment_method}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={ddStyles.amount}>{fmtCurrency(tx.total)}</Text>
                  <Text style={[ddStyles.sub, tx.status === 'void' && { color: '#EF4444' }]}>{tx.status}</Text>
                </View>
              </View>
            ))}
            {report.transactions.length === 0 && (
              <Text style={{ color: '#9CA3AF', textAlign: 'center', paddingVertical: 20 }}>Belum ada transaksi</Text>
            )}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

export default function CompareBranchesReport() {
  const { width } = useWindowDimensions();

  const [preset, setPreset] = useState<Preset>('today');
  const [metric, setMetric] = useState<Metric>('revenue');
  const [summaries, setSummaries] = useState<BranchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = getRange(preset);
    try {
      const data = await getBranchSummaries(null, from, to);
      setSummaries(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => { load(); }, [load]);

  const { from, to } = getRange(preset);
  const totalRevenue = summaries.reduce((s, b) => s + b.total_revenue, 0);

  const metricVal = (s: BranchSummary) =>
    metric === 'revenue' ? s.total_revenue :
    metric === 'transaction' ? s.transaction_count :
    s.gross_profit;

  const sorted = [...summaries].sort((a, b) => metricVal(b) - metricVal(a));

  const barData = sorted.map((s, i) => ({
    label: s.branch_name,
    value: metricVal(s),
    color: BRANCH_COLORS[i % BRANCH_COLORS.length],
  }));

  return (
    <View style={styles.container}>
      <OwnerPageHeader title="Perbandingan Antar Cabang" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <TabletCenteredView>

          {/* Filter periode */}
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

          {/* Pilih metrik */}
          <View style={[styles.filterRow, { paddingTop: 0 }]}>
            {([
              { key: 'revenue', label: 'Penjualan' },
              { key: 'transaction', label: 'Transaksi' },
              { key: 'profit', label: 'Laba Kotor' },
            ] as { key: Metric; label: string }[]).map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[styles.chip, metric === m.key && styles.chipActiveAlt]}
                onPress={() => setMetric(m.key)}
              >
                <Text style={[styles.chipText, metric === m.key && styles.chipTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <View style={{ paddingTop: 48, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#744F3D" />
            </View>
          ) : summaries.length === 0 ? (
            <View style={{ paddingTop: 48, alignItems: 'center' }}>
              <Text style={{ color: '#9CA3AF' }}>Belum ada data untuk periode ini</Text>
            </View>
          ) : (
            <>
              {/* Bar chart */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {metric === 'revenue' ? 'Total Penjualan' :
                   metric === 'transaction' ? 'Jumlah Transaksi' : 'Laba Kotor'} per Cabang
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <BarChart data={barData} />
                </ScrollView>
              </View>

              {/* Ranking */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Ranking Cabang</Text>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { width: 24 }]}>#</Text>
                  <Text style={[styles.th, { flex: 1.8 }]}>Cabang</Text>
                  <Text style={[styles.th, { flex: 1.4, textAlign: 'right' }]}>Penjualan</Text>
                  <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>Tx</Text>
                  <Text style={[styles.th, { flex: 1.3, textAlign: 'right' }]}>Laba</Text>
                </View>
                {sorted.map((s, i) => {
                  const colorIdx = i % BRANCH_COLORS.length;
                  return (
                    <TouchableOpacity
                      key={s.branch_id}
                      style={[styles.tableRow, i % 2 === 1 && { backgroundColor: '#F9FAFB' }]}
                      onPress={() => setDrilldown({ id: s.branch_id, name: s.branch_name })}
                    >
                      <Text style={[styles.rank, i === 0 && { color: '#744F3D' }]}>{i + 1}</Text>
                      <View style={{ flex: 1.8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BRANCH_COLORS[colorIdx] }} />
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
                  );
                })}
              </View>

              {/* Share penjualan */}
              {totalRevenue > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Share Penjualan per Cabang</Text>
                  {sorted.map((s, i) => {
                    const pct = (s.total_revenue / totalRevenue) * 100;
                    return (
                      <View key={s.branch_id} style={{ marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                          <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600' }} numberOfLines={1}>
                            {s.branch_name}
                          </Text>
                          <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '600' }}>
                            {pct.toFixed(1)}%  ·  {fmtCurrency(s.total_revenue)}
                          </Text>
                        </View>
                        <View style={{ height: 10, borderRadius: 5, backgroundColor: '#F3F4F6' }}>
                          <View style={{
                            height: 10, borderRadius: 5,
                            width: `${pct}%` as any,
                            backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length],
                          }} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
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
  chipActive: { backgroundColor: '#744F3D' },
  chipActiveAlt: { backgroundColor: '#A67C6B' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },
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
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderRadius: 6, paddingHorizontal: 2 },
  rank: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', width: 24 },
  td: { fontSize: 13, color: '#374151' },
});

const ddStyles = StyleSheet.create({
  card: {
    flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 10, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  val: { fontSize: 14, fontWeight: '800' },
  lbl: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  section: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 4, marginBottom: 6 },
  txRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 6,
  },
  invoice: { fontSize: 13, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '700', color: '#111827' },
});
