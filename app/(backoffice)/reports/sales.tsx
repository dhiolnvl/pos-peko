/**
 * Laporan Penjualan
 * Filter: Hari ini / Minggu ini / Bulan ini / Custom
 * Ringkasan: total, HPP, laba, by-method
 * Bar chart per hari
 * Tabel transaksi dengan modal detail
 * Export: Share teks (expo-sharing via Share)
 */

import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  Modal, Alert, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { useAuth } from '@/hooks/useAuth';
import { useReportStore, type DateRangePreset } from '@/store/reportStore';
import { BackofficeHeader } from '@/components/BackofficeHeader';
import { getTransactionItems, fmtCurrency, startOfDay, endOfDay, type SalesTransaction } from '@/lib/reportQueries';

const METHOD_LABELS: Record<string, string> = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS' };
const METHOD_COLORS: Record<string, string> = { cash: '#22C55E', transfer: '#347385', qris: '#F59E0B' };

function isoShort(iso: string) {
  try {
    const d = new Date(iso);
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return iso; }
}

// ─── Inline bar chart ─────────────────────────────────────────────────────────

interface BarProps { data: { label: string; value: number }[] }

function BarChart({ data }: BarProps) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const H = 90;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
      {data.map((d, i) => {
        const h = Math.max((d.value / maxVal) * H, d.value > 0 ? 4 : 0);
        return (
          <View key={i} style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ height: H, justifyContent: 'flex-end' }}>
              <View style={{ height: h, backgroundColor: '#347385', borderRadius: 3 }} />
            </View>
            <Text style={{ fontSize: 9, color: '#9CA3AF', marginTop: 2 }}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Custom date range picker ─────────────────────────────────────────────────

function fmtDisplay(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}

interface CustomRangeModalProps {
  visible: boolean;
  from: string;
  to: string;
  onConfirm: (from: string, to: string) => void;
  onClose: () => void;
}

function CustomRangeModal({ visible, from, to, onConfirm, onClose }: CustomRangeModalProps) {
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
              onChange={(_, selected) => {
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

// ─── Transaction detail modal ─────────────────────────────────────────────────

interface TxDetailModalProps {
  tx: SalesTransaction | null;
  onClose: () => void;
}

function TxDetailModal({ tx, onClose }: TxDetailModalProps) {
  const [items, setItems] = useState<{ product_name: string; quantity: number; price: number; subtotal: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useFocusEffect(useCallback(() => {}, [])); // keep hook count stable

  React.useEffect(() => {
    if (!tx) return;
    setLoading(true);
    getTransactionItems(tx.id).then((r) => { setItems(r); setLoading(false); }).catch(() => setLoading(false));
  }, [tx?.id]);

  if (!tx) return null;

  return (
    <Modal visible={!!tx} transparent animationType="slide">
      <View style={modalSt.overlay}>
        <View style={[modalSt.card, { maxHeight: '80%' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={modalSt.title}>{tx.invoice_number}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>{isoShort(tx.created_at)} · {tx.cashier_name}</Text>

          {loading ? <ActivityIndicator size="small" color="#347385" /> : (
            <ScrollView>
              {items.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>{item.product_name}</Text>
                    <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{item.quantity} × {fmtCurrency(item.price)}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>{fmtCurrency(item.subtotal)}</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>TOTAL</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>{fmtCurrency(tx.total)}</Text>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SalesReportScreen() {
  const { currentBranch } = useAuth();
  const branchId = currentBranch?.id ?? '';

  const { salesReport, isLoadingSales, preset, dateRange, setPreset, loadSalesReport } = useReportStore();

  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [selectedTx, setSelectedTx] = useState<SalesTransaction | null>(null);

  const reload = useCallback((p: DateRangePreset, from?: string, to?: string) => {
    if (!branchId) return;
    setPreset(p, from && to ? { from, to } : undefined);
    const dr = from && to ? { from, to } : undefined;
    loadSalesReport(branchId, dr?.from, dr?.to);
  }, [branchId]);

  useFocusEffect(useCallback(() => { reload(preset); }, [branchId]));

  const handleExport = async () => {
    if (!salesReport) return;
    try {
      // Baris ringkasan
      const summaryRows = [
        ['LAPORAN PENJUALAN', currentBranch?.name || ''],
        ['Periode', `${dateRange.from.slice(0, 10)} s/d ${dateRange.to.slice(0, 10)}`],
        [],
        ['Total Penjualan', salesReport.total_revenue],
        ['Total HPP', salesReport.total_cost],
        ['Laba Kotor', salesReport.gross_profit],
        ['Jumlah Transaksi', salesReport.transaction_count],
        [],
        ['Metode Pembayaran', 'Total', 'Jumlah Transaksi'],
        ...salesReport.by_method.map((m) => [METHOD_LABELS[m.method] || m.method, m.total, m.count]),
        [],
        ['No Invoice', 'Waktu', 'Kasir', 'Metode', 'Total', 'Status'],
        ...salesReport.transactions.map((t) => [
          t.invoice_number,
          isoShort(t.created_at),
          t.cashier_name,
          METHOD_LABELS[t.payment_method] || t.payment_method,
          t.total,
          t.status === 'void' ? 'Batal' : 'Selesai',
        ]),
      ];

      const csv = summaryRows
        .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const fileName = `laporan_penjualan_${dateRange.from.slice(0, 10)}_${dateRange.to.slice(0, 10)}.csv`;
      const fileUri = (FileSystem.cacheDirectory ?? '') + fileName;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: 'utf8' });

      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
          'content://com.android.externalstorage.documents/tree/primary%3ADownload'
        );
        if (!permissions.granted) {
          Alert.alert('Dibatalkan', 'Pilih folder untuk menyimpan file.');
          return;
        }
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          fileName,
          'text/csv'
        );
        await FileSystem.writeAsStringAsync(destUri, csv, { encoding: 'utf8' });
        Alert.alert('Berhasil', `File tersimpan:\n${fileName}`);
      } else {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Simpan Laporan' });
      }
    } catch (e: any) {
      Alert.alert('Gagal', e.message || 'Tidak dapat mengekspor laporan');
    }
  };

  const handleExportPdf = async () => {
    if (!salesReport) return;
    try {
      const txRows = salesReport.transactions.map((t) => `
        <tr style="border-bottom:1px solid #eee;">
          <td>${t.invoice_number}</td>
          <td>${isoShort(t.created_at)}</td>
          <td>${t.cashier_name}</td>
          <td>${METHOD_LABELS[t.payment_method] || t.payment_method}</td>
          <td style="text-align:right">${fmtCurrency(t.total)}</td>
          <td style="text-align:center;color:${t.status === 'void' ? '#DC2626' : '#16A34A'}">${t.status === 'void' ? 'Batal' : 'Selesai'}</td>
        </tr>`).join('');

      const methodRows = salesReport.by_method.map((m) => `
        <tr>
          <td>${METHOD_LABELS[m.method] || m.method}</td>
          <td style="text-align:right">${fmtCurrency(m.total)}</td>
          <td style="text-align:center">${m.count}</td>
        </tr>`).join('');

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 24px; }
            h1 { font-size: 18px; color: #347385; margin-bottom: 4px; }
            h2 { font-size: 13px; color: #6B7280; font-weight: normal; margin-bottom: 20px; }
            .summary { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
            .card { background: #EEF8FA; border-radius: 8px; padding: 12px 16px; min-width: 140px; }
            .card-label { font-size: 11px; color: #6B7280; margin-bottom: 4px; }
            .card-value { font-size: 15px; font-weight: bold; color: #347385; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #347385; color: #fff; padding: 8px; text-align: left; font-size: 11px; }
            td { padding: 7px 8px; font-size: 11px; }
            tr:nth-child(even) td { background: #F9FAFB; }
            .section-title { font-size: 13px; font-weight: bold; color: #347385; margin: 16px 0 8px; }
          </style>
        </head>
        <body>
          <h1>Laporan Penjualan — ${currentBranch?.name || ''}</h1>
          <h2>Periode: ${dateRange.from.slice(0, 10)} s/d ${dateRange.to.slice(0, 10)}</h2>

          <div class="summary">
            <div class="card"><div class="card-label">Total Penjualan</div><div class="card-value">${fmtCurrency(salesReport.total_revenue)}</div></div>
            <div class="card"><div class="card-label">Jumlah Transaksi</div><div class="card-value">${salesReport.transaction_count}</div></div>
            <div class="card"><div class="card-label">Total HPP</div><div class="card-value">${fmtCurrency(salesReport.total_cost)}</div></div>
            <div class="card"><div class="card-label">Laba Kotor</div><div class="card-value">${fmtCurrency(salesReport.gross_profit)}</div></div>
          </div>

          <div class="section-title">Metode Pembayaran</div>
          <table>
            <tr><th>Metode</th><th>Total</th><th>Jumlah Transaksi</th></tr>
            ${methodRows}
          </table>

          <div class="section-title">Daftar Transaksi</div>
          <table>
            <tr><th>No Invoice</th><th>Waktu</th><th>Kasir</th><th>Metode</th><th>Total</th><th>Status</th></tr>
            ${txRows}
          </table>
        </body>
        </html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });

      if (Platform.OS === 'android') {
        const fileName = `laporan_penjualan_${dateRange.from.slice(0, 10)}_${dateRange.to.slice(0, 10)}.pdf`;
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
          'content://com.android.externalstorage.documents/tree/primary%3ADownload'
        );
        if (!permissions.granted) return;
        const content = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri, fileName, 'application/pdf'
        );
        await FileSystem.writeAsStringAsync(destUri, content, { encoding: 'base64' });
        Alert.alert('Berhasil', `PDF tersimpan:\n${fileName}`);
      } else {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Simpan PDF' });
      }
    } catch (e: any) {
      Alert.alert('Gagal', e.message || 'Tidak dapat mengekspor PDF');
    }
  };

  const presets: { key: DateRangePreset; label: string }[] = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'week', label: 'Minggu Ini' },
    { key: 'month', label: 'Bulan Ini' },
    { key: 'custom', label: 'Custom' },
  ];

  // Chart data
  const chartData = (() => {
    if (!salesReport?.by_day?.length) return [];
    return salesReport.by_day.map((d) => {
      const dt = new Date(d.date);
      return { label: `${dt.getDate()}/${dt.getMonth() + 1}`, value: d.total };
    });
  })();

  return (
    <View style={styles.container}>
      <BackofficeHeader
        title="Laporan Penjualan"
        rightElement={
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity onPress={handleExport} style={{ padding: 8 }}>
              <Ionicons name="document-text-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleExportPdf} style={{ padding: 8 }}>
              <Ionicons name="document-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {presets.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.filterChip, preset === p.key && styles.filterChipActive]}
            onPress={() => p.key === 'custom' ? setCustomModalVisible(true) : reload(p.key)}
          >
            <Text style={[styles.filterChipText, preset === p.key && styles.filterChipTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Keterangan periode */}
      <View style={styles.periodRow}>
        <Ionicons name="calendar-outline" size={13} color="#347385" />
        <Text style={styles.periodText}>
          {fmtDisplay(dateRange.from)} — {fmtDisplay(dateRange.to)}
        </Text>
        {preset === 'custom' && (
          <TouchableOpacity onPress={() => setCustomModalVisible(true)}>
            <Text style={styles.periodEdit}>Ubah</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoadingSales ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#347385" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Summary cards */}
          <View style={styles.row}>
            <View style={[styles.summCard, { flex: 1 }]}>
              <Text style={styles.summLabel}>Total Penjualan</Text>
              <Text style={[styles.summValue, { color: '#22C55E' }]}>{fmtCurrency(salesReport?.total_revenue ?? 0)}</Text>
            </View>
            <View style={[styles.summCard, { flex: 1 }]}>
              <Text style={styles.summLabel}>Jumlah Transaksi</Text>
              <Text style={styles.summValue}>{salesReport?.transaction_count ?? 0}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={[styles.summCard, { flex: 1 }]}>
              <Text style={styles.summLabel}>HPP</Text>
              <Text style={[styles.summValue, { color: '#EF4444' }]}>{fmtCurrency(salesReport?.total_cost ?? 0)}</Text>
            </View>
            <View style={[styles.summCard, { flex: 1 }]}>
              <Text style={styles.summLabel}>Laba Kotor</Text>
              <Text style={[styles.summValue, { color: '#347385' }]}>{fmtCurrency(salesReport?.gross_profit ?? 0)}</Text>
            </View>
          </View>

          {/* By method */}
          {!!salesReport?.by_method?.length && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Metode Pembayaran</Text>
              {salesReport.by_method.map((m) => {
                const pct = salesReport.total_revenue > 0 ? (m.total / salesReport.total_revenue) * 100 : 0;
                return (
                  <View key={m.method} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{METHOD_LABELS[m.method] || m.method}</Text>
                      <Text style={{ fontSize: 13, color: '#6B7280' }}>{fmtCurrency(m.total)} · {m.count} tx</Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#F3F4F6', borderRadius: 3 }}>
                      <View style={{ height: 6, width: `${pct}%` as any, backgroundColor: METHOD_COLORS[m.method] || '#347385', borderRadius: 3 }} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Bar chart */}
          {chartData.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Penjualan per Hari</Text>
              <BarChart data={chartData} />
            </View>
          )}

          {/* Transaction table */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Daftar Transaksi ({salesReport?.transactions?.length ?? 0})</Text>
            {!salesReport?.transactions?.length ? (
              <Text style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 16 }}>Belum ada transaksi</Text>
            ) : (
              salesReport.transactions.map((tx) => (
                <TouchableOpacity key={tx.id} style={styles.txRow} onPress={() => setSelectedTx(tx)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txInvoice}>{tx.invoice_number}</Text>
                    <Text style={styles.txMeta}>{isoShort(tx.created_at)} · {tx.cashier_name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.txTotal}>{fmtCurrency(tx.total)}</Text>
                    <View style={[styles.methodBadge, { backgroundColor: (METHOD_COLORS[tx.payment_method] || '#347385') + '20' }]}>
                      <Text style={[styles.methodBadgeText, { color: METHOD_COLORS[tx.payment_method] || '#347385' }]}>
                        {METHOD_LABELS[tx.payment_method] || tx.payment_method}
                      </Text>
                    </View>
                  </View>
                  {tx.status === 'void' && (
                    <View style={styles.voidChip}><Text style={styles.voidChipText}>Batal</Text></View>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      )}

      <CustomRangeModal
        visible={customModalVisible}
        from={dateRange.from}
        to={dateRange.to}
        onClose={() => setCustomModalVisible(false)}
        onConfirm={(from, to) => { setCustomModalVisible(false); reload('custom', from, to); }}
      />

      <TxDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  filterChipActive: { backgroundColor: '#347385' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  filterChipTextActive: { color: '#fff' },
  periodRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#EEF8FA', borderBottomWidth: 1, borderBottomColor: '#D4EFF4',
  },
  periodText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#347385' },
  periodEdit: { fontSize: 12, fontWeight: '700', color: '#56B2C1', textDecorationLine: 'underline' },
  scroll: { padding: 14, gap: 12, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  summCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  summLabel: { fontSize: 12, color: '#6B7280' },
  summValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 },
  txRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB', gap: 8,
  },
  txInvoice: { fontSize: 13, fontWeight: '700', color: '#111827' },
  txMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  txTotal: { fontSize: 14, fontWeight: '800', color: '#111827' },
  methodBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  methodBadgeText: { fontSize: 11, fontWeight: '600' },
  voidChip: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, position: 'absolute', top: 8, right: 0 },
  voidChipText: { fontSize: 10, fontWeight: '700', color: '#DC2626' },
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
