/**
 * Laporan Penjualan Konsolidasi - Staff Pusat
 * Filter: periode + pilih cabang
 * Tabel: Cabang | Total Penjualan | Transaksi | Laba
 * Bar chart perbandingan per cabang
 * Drill-down: tap cabang -> detail transaksi
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, FlatList, Modal, useWindowDimensions, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  getBranchSummaries, fetchAllBranches, fmtCurrency,
  startOfDay, endOfDay, type BranchSummary,
} from '@/lib/ownerQueries';
import {
  getSalesReport, buildSalesConsolidatedPdfHtml, formatDetailedPeriodLabel,
  type SalesReportResult,
} from '@/lib/reportQueries';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import DatePickerModal from '@/components/DatePickerModal';
import { mmkv, StorageKeys } from '@/lib/mmkvStorage';
import { APP_NAME } from '@/constants/config';
import type { Branch } from '@/types';

const { width: SW } = Dimensions.get('window');
const BRANCH_COLORS = ['#347385', '#56B2C1', '#22C55E', '#F59E0B', '#06B6D4', '#EF4444'];

// ─── Preset periods ────────────────────────────────────────────────────────────

type Preset = 'today' | 'week' | 'month' | 'custom';

function getRange(preset: Preset, customFrom?: string, customTo?: string) {
  const today = new Date();
  if (preset === 'today') {
    return { from: startOfDay(today), to: endOfDay(today) };
  }
  if (preset === 'week') {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { from: startOfDay(start), to: endOfDay(today) };
  }
  if (preset === 'month') {
    const start = new Date(today);
    start.setDate(1);
    return { from: startOfDay(start), to: endOfDay(today) };
  }
  const fromD = customFrom ? new Date(customFrom) : today;
  const toD = customTo ? new Date(customTo) : today;
  return { from: startOfDay(fromD), to: endOfDay(toD) };
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
        <OwnerPageHeader title={branchName} onBack={onClose} />

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#347385" />
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

export default function StaffPusatSalesReport() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [preset, setPreset] = useState<Preset>('today');
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to' | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<BranchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [drilldown, setDrilldown] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchAllBranches()
      .then((b) => setBranches(b as Branch[]))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = getRange(preset, customFrom, customTo);
    const bIds = selectedBranchId ? [selectedBranchId] : null;
    try {
      const data = await getBranchSummaries(bIds, from, to);
      setSummaries(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo, selectedBranchId]);

  useEffect(() => { load(); }, [load]);

  const { from, to } = getRange(preset, customFrom, customTo);
  const totalRevenue = summaries.reduce((s, b) => s + b.total_revenue, 0);
  const totalTx = summaries.reduce((s, b) => s + b.transaction_count, 0);
  const totalGP = summaries.reduce((s, b) => s + b.gross_profit, 0);

  const barData = summaries.map((s, i) => ({
    label: s.branch_name,
    value: s.total_revenue,
    color: BRANCH_COLORS[i % BRANCH_COLORS.length],
  }));

  const handleExportPdf = async () => {
    if (summaries.length === 0) {
      Alert.alert('Perhatian', 'Tidak ada data untuk diekspor');
      return;
    }
    setExportingPdf(true);
    try {
      const periodStr = formatDetailedPeriodLabel(from, to);
      const storeInfo = (await mmkv.getObject<any>(StorageKeys.STORE_SETTINGS)) ?? {};
      const html = await buildSalesConsolidatedPdfHtml(
        summaries,
        { revenue: totalRevenue, transactions: totalTx, grossProfit: totalGP },
        {
          periodLabel: periodStr,
          storeName: storeInfo.store_name || storeInfo.name || APP_NAME,
          storeAddress: storeInfo.address,
          branchName: selectedBranchId ? branches.find((b) => b.id === selectedBranchId)?.name : 'Semua Cabang',
        },
      );

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const fileName = `laporan-penjualan-${from.slice(0, 10)}-${to.slice(0, 10)}.pdf`;

      if (Platform.OS === 'android') {
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (perm.granted) {
          const dest = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, fileName, 'application/pdf');
          const content = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          await FileSystem.writeAsStringAsync(dest, content, { encoding: FileSystem.EncodingType.Base64 });
          Alert.alert('Berhasil', `PDF tersimpan:\n${fileName}`);
        } else {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Simpan PDF' });
        }
      } else {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Simpan PDF' });
      }
    } catch (e: any) {
      Alert.alert('Gagal', e.message || 'Tidak dapat mengekspor PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <View style={styles.container}>
      <OwnerPageHeader title="Laporan Penjualan" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <TabletCenteredView>
          {/* Preset filter */}
          <View style={styles.filterRow}>
            {(['today', 'week', 'month', 'custom'] as Preset[]).map((p) => (
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
          <View style={styles.branchScrollWrap}>
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
          </View>

          {loading ? (
            <View style={{ paddingTop: 48, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#347385" />
            </View>
          ) : (
            <>
              {/* Summary cards */}
              <View style={[styles.cardRow, isTablet && styles.cardRowTablet]}>
                {[
                  { label: 'Total Penjualan', value: fmtCurrency(totalRevenue), color: '#347385' },
                  { label: 'Transaksi', value: totalTx.toString(), color: '#56B2C1' },
                  { label: 'Laba Kotor Est.', value: fmtCurrency(totalGP), color: '#22C55E' },
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

      {pickerTarget && (
        <DatePickerModal
          visible={!!pickerTarget}
          value={pickerTarget === 'from' ? customFrom : customTo}
          title={pickerTarget === 'from' ? 'Pilih Tanggal Mulai' : 'Pilih Tanggal Akhir'}
          onConfirm={(d) => {
            if (pickerTarget === 'from') setCustomFrom(d);
            else setCustomTo(d);
            setPickerTarget(null);
          }}
          onCancel={() => setPickerTarget(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16,
    paddingTop: 14, paddingBottom: 8, alignItems: 'center', flexWrap: 'wrap',
  },
  branchScrollWrap: { height: 48 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#347385', borderColor: '#347385' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },

  exportPdfBtn: {
    marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#347385', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
  },
  exportPdfText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  customDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingBottom: 10,
  },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
  },
  dateBtnText: { fontSize: 12, color: '#374151', fontWeight: '600' },

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
