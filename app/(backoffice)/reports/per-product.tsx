import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, useWindowDimensions, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { BackofficeHeader } from '@/components/BackofficeHeader';
import useAuthStore from '@/store/authStore';
import {
  getProductSalesReport, buildProductSalesPdfHtml, type ProductSalesReport,
  fmtCurrency, startOfDay, endOfDay,
} from '@/lib/reportQueries';

type Preset = 'today' | 'week' | 'month';

function getRange(preset: Preset) {
  const today = new Date();
  if (preset === 'today') return { from: startOfDay(today), to: endOfDay(today) };
  if (preset === 'week') {
    const s = new Date(today); s.setDate(today.getDate() - 6);
    return { from: startOfDay(s), to: endOfDay(today) };
  }
  const s = new Date(today); s.setDate(1);
  return { from: startOfDay(s), to: endOfDay(today) };
}

const presetLabel: Record<Preset, string> = { today: 'Hari Ini', week: '7 Hari', month: 'Bulan Ini' };

export default function PerProductReportBackoffice() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { currentBranch } = useAuthStore();
  const branchId = currentBranch?.id ?? '';

  const [preset, setPreset] = useState<Preset>('month');
  const [report, setReport] = useState<ProductSalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const rows = report?.rows ?? [];

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const { from, to } = getRange(preset);
      const data = await getProductSalesReport(from, to, branchId);
      setReport(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [preset, branchId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    if (!report || rows.length === 0) return;
    setExporting(true);
    try {
      const html = await buildProductSalesPdfHtml(report, {
        periodLabel: presetLabel[preset],
        branchName: currentBranch?.name ?? 'Cabang',
        storeName: currentBranch?.name ?? 'Toko',
        storeAddress: currentBranch?.address,
      });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const fileName = `laporan-produk-${presetLabel[preset].replace(/ /g, '-')}.pdf`;

      if (Platform.OS === 'android') {
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
          'content://com.android.externalstorage.documents/tree/primary%3ADownload'
        );
        if (!perm.granted) return;
        const content = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const dest = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, fileName, 'application/pdf');
        await FileSystem.writeAsStringAsync(dest, content, { encoding: 'base64' });
        Alert.alert('Berhasil', `PDF tersimpan:\n${fileName}`);
      } else {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Simpan PDF' });
      }
    } catch (e: any) {
      Alert.alert('Gagal', e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <BackofficeHeader
        title="Laporan Per Produk"
        rightElement={
          <TouchableOpacity
            style={[styles.exportBtn, (exporting || rows.length === 0) && { opacity: 0.5 }]}
            onPress={handleExport}
            disabled={exporting || rows.length === 0}
          >
            {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="download-outline" size={18} color="#fff" />}
            <Text style={styles.exportBtnText}>PDF</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={styles.filterRow}>
          {(['today', 'week', 'month'] as Preset[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.presetBtn, preset === p && styles.presetBtnActive]}
              onPress={() => setPreset(p)}
            >
              <Text style={[styles.presetBtnText, preset === p && styles.presetBtnTextActive]}>{presetLabel[p]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {report && (
          <View style={styles.statsRow}>
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, styles.statCardHalf]}>
                <Text style={styles.statLabel}>Total Penjualan</Text>
                <Text style={styles.statValue}>{fmtCurrency(report.totalRevenue)}</Text>
              </View>
              <View style={[styles.statCard, styles.statCardHalf]}>
                <Text style={styles.statLabel}>Laba Kotor</Text>
                <Text style={[styles.statValue, { color: '#16A34A' }]}>{fmtCurrency(report.totalGrossProfit)}</Text>
              </View>
              <View style={[styles.statCard, styles.statCardHalf]}>
                <Text style={styles.statLabel}>Total Qty</Text>
                <Text style={[styles.statValue, { color: '#347385' }]}>{report.totalQty.toLocaleString('id-ID')}</Text>
              </View>
              <View style={[styles.statCard, styles.statCardHalf]}>
                <Text style={styles.statLabel}>HPP</Text>
                <Text style={[styles.statValue, { color: '#6B7280', fontSize: 16 }]}>{fmtCurrency(report.totalHpp)}</Text>
              </View>
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color="#347385" style={{ marginTop: 40 }} />
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bar-chart-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>Tidak ada data penjualan</Text>
          </View>
        ) : isTablet ? (
          <View style={styles.tableWrap}>
            <View style={styles.tableHeader}>
              <Text style={[styles.thText, { width: 28 }]}>#</Text>
              <Text style={[styles.thText, { flex: 3 }]}>Produk</Text>
              <Text style={[styles.thText, { flex: 2 }]}>Barcode</Text>
              <Text style={[styles.thText, { flex: 1.5 }]}>Kategori</Text>
              <Text style={[styles.thText, { width: 52, textAlign: 'right' }]}>Qty</Text>
              <Text style={[styles.thText, { width: 52, textAlign: 'right' }]}>Qty%</Text>
              <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>Penjualan</Text>
              <Text style={[styles.thText, { width: 52, textAlign: 'right' }]}>%</Text>
              <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>HPP</Text>
              <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>Laba Kotor</Text>
            </View>
            {rows.map((r, i) => (
              <View key={r.product_id} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                <Text style={[styles.rankText, { width: 28 }]}>#{i + 1}</Text>
                <Text style={[styles.productName, { flex: 3 }]} numberOfLines={2}>{r.product_name}</Text>
                <Text style={[styles.tdText, { flex: 2, color: '#9CA3AF', fontSize: 11 }]} numberOfLines={1}>{r.barcode ?? '-'}</Text>
                <Text style={[styles.tdText, { flex: 1.5, color: '#6B7280', fontSize: 11 }]} numberOfLines={1}>{r.category ?? '-'}</Text>
                <Text style={[styles.tdText, { width: 52, textAlign: 'right' }]}>{r.total_qty.toLocaleString('id-ID')}</Text>
                <Text style={[styles.tdText, { width: 52, textAlign: 'right', color: '#9CA3AF', fontSize: 11 }]}>{r.qty_pct.toFixed(1)}%</Text>
                <Text style={[styles.tdText, { flex: 2, textAlign: 'right', fontWeight: '700' }]}>{fmtCurrency(r.total_revenue)}</Text>
                <Text style={[styles.tdText, { width: 52, textAlign: 'right', color: '#9CA3AF', fontSize: 11 }]}>{r.revenue_pct.toFixed(1)}%</Text>
                <Text style={[styles.tdText, { flex: 2, textAlign: 'right', color: '#6B7280' }]}>{fmtCurrency(r.total_hpp)}</Text>
                <Text style={[styles.tdText, { flex: 2, textAlign: 'right', fontWeight: '700', color: r.gross_profit >= 0 ? '#16A34A' : '#DC2626' }]}>
                  {fmtCurrency(r.gross_profit)}
                </Text>
              </View>
            ))}
            <View style={styles.tableFooter}>
              <Text style={[styles.tfText, { width: 28 }]} />
              <Text style={[styles.tfText, { flex: 3 }]}>TOTAL</Text>
              <Text style={[styles.tfText, { flex: 2 }]} />
              <Text style={[styles.tfText, { flex: 1.5 }]} />
              <Text style={[styles.tfText, { width: 52, textAlign: 'right' }]}>{report!.totalQty.toLocaleString('id-ID')}</Text>
              <Text style={[styles.tfText, { width: 52 }]} />
              <Text style={[styles.tfText, { flex: 2, textAlign: 'right', color: '#347385' }]}>{fmtCurrency(report!.totalRevenue)}</Text>
              <Text style={[styles.tfText, { width: 52 }]} />
              <Text style={[styles.tfText, { flex: 2, textAlign: 'right', color: '#6B7280' }]}>{fmtCurrency(report!.totalHpp)}</Text>
              <Text style={[styles.tfText, { flex: 2, textAlign: 'right', color: '#16A34A' }]}>{fmtCurrency(report!.totalGrossProfit)}</Text>
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 8 }}>
            {rows.map((r, i) => (
              <View key={r.product_id} style={styles.productCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardRank}>
                    <Text style={styles.cardRankText}>#{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardProductName} numberOfLines={2}>{r.product_name}</Text>
                    {r.category && <Text style={styles.cardCategory}>{r.category}</Text>}
                  </View>
                  <Text style={[styles.cardQty, { color: r.gross_profit >= 0 ? '#16A34A' : '#DC2626' }]}>
                    {fmtCurrency(r.gross_profit)}
                  </Text>
                </View>
                <View style={styles.cardDivider} />
                <View style={styles.cardStats}>
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatLabel}>Qty Terjual</Text>
                    <Text style={styles.cardStatValue}>{r.total_qty.toLocaleString('id-ID')}</Text>
                    <Text style={styles.cardStatPct}>{r.qty_pct.toFixed(1)}%</Text>
                  </View>
                  <View style={styles.cardStatDivider} />
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatLabel}>Penjualan</Text>
                    <Text style={[styles.cardStatValue, { color: '#347385' }]}>{fmtCurrency(r.total_revenue)}</Text>
                    <Text style={styles.cardStatPct}>{r.revenue_pct.toFixed(1)}%</Text>
                  </View>
                  <View style={styles.cardStatDivider} />
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatLabel}>HPP</Text>
                    <Text style={[styles.cardStatValue, { color: '#6B7280', fontSize: 13 }]}>{fmtCurrency(r.total_hpp)}</Text>
                  </View>
                  <View style={styles.cardStatDivider} />
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatLabel}>Laba Kotor</Text>
                    <Text style={[styles.cardStatValue, { color: r.gross_profit >= 0 ? '#16A34A' : '#DC2626', fontSize: 13 }]}>
                      {fmtCurrency(r.gross_profit)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#347385', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  exportBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  presetBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
  },
  presetBtnActive: { backgroundColor: '#347385', borderColor: '#347385' },
  presetBtnText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  presetBtnTextActive: { color: '#fff' },
  statsRow: { paddingHorizontal: 16, paddingVertical: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCardHalf: { flexBasis: '47%', flexGrow: 1 },
  statCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  statLabel: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#111827' },
  tableWrap: { marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', marginBottom: 16 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#347385',
    paddingHorizontal: 10, paddingVertical: 10, gap: 6, alignItems: 'center',
  },
  thText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  tableRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    paddingHorizontal: 10, paddingVertical: 10, gap: 6, alignItems: 'center',
  },
  tableRowAlt: { backgroundColor: '#F9FAFB' },
  productName: { fontSize: 12, fontWeight: '600', color: '#111827' },
  categoryText: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  rankText: { fontSize: 11, color: '#9CA3AF' },
  tdText: { fontSize: 12, color: '#374151' },
  tableFooter: {
    flexDirection: 'row', backgroundColor: '#EEF8FA',
    paddingHorizontal: 10, paddingVertical: 10, gap: 6,
    borderTopWidth: 2, borderTopColor: '#A9DFE9', alignItems: 'center',
  },
  tfText: { fontSize: 12, fontWeight: '800', color: '#111827' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
  productCard: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  cardRank: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  cardRankText: { fontSize: 11, fontWeight: '700', color: '#347385' },
  cardProductName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  cardCategory: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  cardQty: { fontSize: 14, fontWeight: '800' },
  cardDivider: { height: 1, backgroundColor: '#F3F4F6' },
  cardStats: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12 },
  cardStat: { flex: 1, alignItems: 'center', gap: 2 },
  cardStatDivider: { width: 1, backgroundColor: '#F3F4F6' },
  cardStatLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },
  cardStatValue: { fontSize: 12, fontWeight: '700', color: '#111827' },
  cardStatPct: { fontSize: 10, color: '#9CA3AF' },
});
