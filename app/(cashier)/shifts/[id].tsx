import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, useWindowDimensions, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getShiftDetail, type ShiftDetail, type ShiftTransaction } from '@/lib/shiftQueries';
import { formatCurrency } from '@/constants/config';
import { printShiftReceipt, isPrinterConnected } from '@/lib/printerHelper';
import { useAuthStore } from '@/store/authStore';

const METHOD_LABELS: Record<string, string> = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS' };
const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  cash:     { bg: '#DCFCE7', text: '#16A34A' },
  transfer: { bg: '#DBEAFE', text: '#1D4ED8' },
  qris:     { bg: '#EDE9FE', text: '#6D28D9' },
};

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return iso; }
}

function fmtDuration(openedAt: string, closedAt: string | null) {
  if (!closedAt) return 'Shift masih berlangsung';
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} jam ${m} menit` : `${m} menit`;
}

// ─── PDF Generator ───────────────────────────────────────────────────────────

function buildShiftPdfHtml(detail: ShiftDetail): string {
  const rows = detail.transactions.map((t) => {
    const mc = METHOD_COLORS[t.payment_method] ?? { bg: '#F3F4F6', text: '#374151' };
    const isVoid = t.status === 'void';
    return `
      <tr style="border-bottom:1px solid #F3F4F6; ${isVoid ? 'opacity:0.5;' : ''}">
        <td style="padding:8px 6px; font-size:12px; color:#111827; font-weight:600;">${t.invoice_number}</td>
        <td style="padding:8px 6px; font-size:11px; color:#9CA3AF;">${fmtDateTime(t.created_at)}</td>
        <td style="padding:8px 6px;">
          <span style="background:${mc.bg}; color:${mc.text}; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:700;">
            ${METHOD_LABELS[t.payment_method] ?? t.payment_method}
          </span>
        </td>
        <td style="padding:8px 6px; text-align:right; font-size:13px; font-weight:800; color:${isVoid ? '#9CA3AF' : '#111827'}; ${isVoid ? 'text-decoration:line-through;' : ''}">
          ${formatCurrency(t.total)}
        </td>
        <td style="padding:8px 6px; text-align:center;">
          <span style="background:${isVoid ? '#FEE2E2' : '#DCFCE7'}; color:${isVoid ? '#DC2626' : '#16A34A'}; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:700;">
            ${isVoid ? 'Batal' : 'Selesai'}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  const isOpen = detail.status === 'open';
  const duration = fmtDuration(detail.opened_at, detail.closed_at);
  const now = new Date();
  const printDate = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Arial, sans-serif; background: #fff; color: #111827; padding: 32px; }
    h1 { font-size: 22px; font-weight: 800; color: #111827; }
    h2 { font-size: 14px; font-weight: 700; color: #347385; margin-bottom: 12px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #A9DFE9; padding-bottom: 16px; }
    .header-left h1 { margin-bottom: 4px; }
    .header-left p { font-size: 13px; color: #6B7280; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
    .badge-open { background: #DCFCE7; color: #16A34A; }
    .badge-closed { background: #F3F4F6; color: #6B7280; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
    .info-card { background: #F9FAFB; border-radius: 10px; padding: 14px; }
    .info-label { font-size: 11px; color: #9CA3AF; font-weight: 600; margin-bottom: 4px; }
    .info-value { font-size: 14px; font-weight: 700; color: #111827; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
    .summary-card { border: 1px solid #E5E7EB; border-radius: 10px; padding: 14px; text-align: center; }
    .summary-num { font-size: 20px; font-weight: 800; color: #347385; }
    .summary-label { font-size: 11px; color: #9CA3AF; font-weight: 600; margin-top: 4px; }
    .method-row { display: flex; gap: 10px; margin-bottom: 24px; }
    .method-card { flex: 1; border-radius: 10px; padding: 12px; text-align: center; }
    .method-card.cash { background: #DCFCE7; }
    .method-card.transfer { background: #DBEAFE; }
    .method-card.qris { background: #EDE9FE; }
    .method-card .num { font-size: 16px; font-weight: 800; }
    .method-card.cash .num { color: #16A34A; }
    .method-card.transfer .num { color: #1D4ED8; }
    .method-card.qris .num { color: #6D28D9; }
    .method-card .lbl { font-size: 11px; font-weight: 600; color: #6B7280; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #F9FAFB; }
    thead th { padding: 10px 6px; text-align: left; font-size: 11px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; }
    .footer { margin-top: 24px; text-align: center; font-size: 11px; color: #9CA3AF; border-top: 1px solid #E5E7EB; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>Laporan Shift</h1>
      <p>${detail.branch_name} &nbsp;·&nbsp; ${detail.cashier_name}</p>
    </div>
    <span class="badge ${isOpen ? 'badge-open' : 'badge-closed'}">${isOpen ? 'Sedang Buka' : 'Sudah Tutup'}</span>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <div class="info-label">Waktu Buka</div>
      <div class="info-value">${fmtDateTime(detail.opened_at)}</div>
    </div>
    <div class="info-card">
      <div class="info-label">Waktu Tutup</div>
      <div class="info-value">${detail.closed_at ? fmtDateTime(detail.closed_at) : '-'}</div>
    </div>
    <div class="info-card">
      <div class="info-label">Durasi</div>
      <div class="info-value">${duration}</div>
    </div>
    <div class="info-card">
      <div class="info-label">Kas Buka / Tutup</div>
      <div class="info-value">${formatCurrency(detail.opening_cash)} / ${detail.closing_cash != null ? formatCurrency(detail.closing_cash) : '-'}</div>
    </div>
  </div>

  <h2>Ringkasan Penjualan</h2>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-num">${detail.summary.totalTransactions}</div>
      <div class="summary-label">Transaksi</div>
    </div>
    <div class="summary-card">
      <div class="summary-num" style="color:#22C55E;">${formatCurrency(detail.summary.totalSales)}</div>
      <div class="summary-label">Total Penjualan</div>
    </div>
    <div class="summary-card">
      <div class="summary-num" style="color:#347385;">${formatCurrency(detail.opening_cash)}</div>
      <div class="summary-label">Kas Awal</div>
    </div>
    <div class="summary-card">
      <div class="summary-num" style="color:#347385;">${detail.closing_cash != null ? formatCurrency(detail.closing_cash) : '-'}</div>
      <div class="summary-label">Kas Akhir</div>
    </div>
  </div>

  <h2>Metode Pembayaran</h2>
  <div class="method-row">
    ${detail.summary.cashSales > 0 ? `<div class="method-card cash"><div class="num">${formatCurrency(detail.summary.cashSales)}</div><div class="lbl">Tunai</div></div>` : ''}
    ${detail.summary.transferSales > 0 ? `<div class="method-card transfer"><div class="num">${formatCurrency(detail.summary.transferSales)}</div><div class="lbl">Transfer</div></div>` : ''}
    ${detail.summary.qrisSales > 0 ? `<div class="method-card qris"><div class="num">${formatCurrency(detail.summary.qrisSales)}</div><div class="lbl">QRIS</div></div>` : ''}
    ${detail.summary.splitSales > 0 ? `<div class="method-card" style="background:#F5F3FF"><div class="num" style="color:#7C3AED">${formatCurrency(detail.summary.splitSales)}</div><div class="lbl">Campuran</div></div>` : ''}
    ${detail.summary.deliverySales > 0 ? `<div class="method-card" style="background:#FEF2F2"><div class="num" style="color:#DC2626">${formatCurrency(detail.summary.deliverySales)}</div><div class="lbl">Delivery</div></div>` : ''}
  </div>

  <h2>Detail Transaksi (${detail.transactions.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Invoice</th>
        <th>Waktu</th>
        <th>Metode</th>
        <th style="text-align:right;">Total</th>
        <th style="text-align:center;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#9CA3AF;">Tidak ada transaksi</td></tr>'}
    </tbody>
  </table>

  <div class="footer">Dicetak pada ${printDate} &nbsp;·&nbsp; Qasio POS</div>
</body>
</html>`;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }: {
  label: string; value: string; color: string; icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[statStyles.card, { borderColor: color + '30' }]}>
      <View style={[statStyles.iconBox, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1, alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    borderWidth: 1,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  iconBox: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  value: { fontSize: 15, fontWeight: '800' },
  label: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', textAlign: 'center' },
});

// ─── Transaction row ──────────────────────────────────────────────────────────

function TxRow({ tx }: { tx: ShiftTransaction }) {
  const mc = METHOD_COLORS[tx.payment_method] ?? { bg: '#F3F4F6', text: '#374151' };
  const isVoid = tx.status === 'void';
  return (
    <View style={[txStyles.row, isVoid && txStyles.rowVoid]}>
      <View style={txStyles.rowLeft}>
        <Text style={txStyles.invoice}>{tx.invoice_number}</Text>
        <Text style={txStyles.time}>{fmtDateTime(tx.created_at)}</Text>
        {tx.member_name && (
          <View style={txStyles.memberChip}>
            <Ionicons name="person-outline" size={10} color="#347385" />
            <Text style={txStyles.memberChipText}>{tx.member_name}</Text>
          </View>
        )}
      </View>
      <View style={txStyles.rowRight}>
        <Text style={[txStyles.total, isVoid && txStyles.totalVoid]}>{formatCurrency(tx.total)}</Text>
        <View style={[txStyles.methodBadge, { backgroundColor: mc.bg }]}>
          <Text style={[txStyles.methodText, { color: mc.text }]}>{METHOD_LABELS[tx.payment_method] ?? tx.payment_method}</Text>
        </View>
        {isVoid && (
          <View style={txStyles.voidBadge}>
            <Text style={txStyles.voidText}>Batal</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const txStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, gap: 10,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  rowVoid: { opacity: 0.55 },
  rowLeft: { flex: 1, gap: 3 },
  invoice: { fontSize: 13, fontWeight: '700', color: '#111827' },
  time: { fontSize: 11, color: '#9CA3AF' },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start' },
  memberChipText: { fontSize: 10, color: '#347385', fontWeight: '600' },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  total: { fontSize: 14, fontWeight: '800', color: '#111827' },
  totalVoid: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  methodBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  methodText: { fontSize: 10, fontWeight: '700' },
  voidBadge: { backgroundColor: '#FEE2E2', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  voidText: { fontSize: 10, fontWeight: '700', color: '#DC2626' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ShiftDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { currentBranch } = useAuthStore();
  const [detail, setDetail] = useState<ShiftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getShiftDetail(id);
      setDetail(data);
    } catch (e) {
      console.error('[ShiftDetail] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDownloadPdf = async () => {
    if (!detail) return;
    setDownloading(true);
    try {
      const html = buildShiftPdfHtml(detail);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const openedDate = detail.opened_at.slice(0, 10).replace(/-/g, '');
      const fileName = `laporan_shift_${openedDate}.pdf`;
      if (Platform.OS === 'android') {
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
      Alert.alert('Gagal', e.message ?? 'Tidak dapat membuat PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    if (!detail) return;
    if (!isPrinterConnected()) {
      Alert.alert('Printer Tidak Terhubung', 'Hubungkan printer thermal terlebih dahulu di menu Pengaturan Printer.');
      return;
    }
    setPrinting(true);
    try {
      const byMethod = detail.transactions
        .filter((t) => t.status !== 'void')
        .reduce((acc: Record<string, number>, t) => {
          acc[t.payment_method] = (acc[t.payment_method] ?? 0) + t.total;
          return acc;
        }, {});
      await printShiftReceipt({
        storeName: currentBranch?.name ?? 'Toko',
        storeAddress: currentBranch?.address,
        storePhone: currentBranch?.phone,
        cashierName: detail.cashier_name,
        type: detail.status === 'open' ? 'open' : 'close',
        openedAt: detail.opened_at,
        closedAt: detail.closed_at,
        openingCash: detail.opening_cash,
        closingCash: detail.closing_cash,
        totalTransactions: detail.total_transactions ?? detail.transactions.filter((t) => t.status !== 'void').length,
        totalSales: detail.total_sales ?? detail.transactions.filter((t) => t.status !== 'void').reduce((s, t) => s + t.total, 0),
        cashSales: byMethod['cash'] ?? 0,
        transferSales: byMethod['transfer'] ?? 0,
        qrisSales: byMethod['qris'] ?? 0,
        splitSales: byMethod['split'] ?? 0,
        deliverySales: byMethod['delivery'] ?? 0,
      });
    } catch (e: any) {
      Alert.alert('Gagal Cetak', e.message ?? 'Tidak dapat mencetak');
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#56B2C1" />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" />
        <Text style={{ fontSize: 14, color: '#9CA3AF', marginTop: 8 }}>Shift tidak ditemukan</Text>
      </View>
    );
  }

  const isOpen = detail.status === 'open';
  const contentMaxWidth = isTablet ? 800 : undefined;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle}>Detail Shift</Text>
          <View style={[styles.statusBadge, { backgroundColor: isOpen ? '#DCFCE7' : '#F3F4F6' }]}>
            <View style={[styles.statusDot, { backgroundColor: isOpen ? '#22C55E' : '#9CA3AF' }]} />
            <Text style={[styles.statusText, { color: isOpen ? '#16A34A' : '#6B7280' }]}>
              {isOpen ? 'Sedang Buka' : 'Sudah Tutup'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {isPrinterConnected() && (
            <TouchableOpacity
              style={[styles.pdfBtn, { backgroundColor: '#56B2C1' }, printing && { opacity: 0.6 }]}
              onPress={handlePrint}
              disabled={printing}
            >
              {printing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="print-outline" size={18} color="#fff" />
              }
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.pdfBtn, downloading && { opacity: 0.6 }]}
            onPress={handleDownloadPdf}
            disabled={downloading}
          >
            {downloading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="download-outline" size={18} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 24 },
          isTablet && { alignItems: 'center' },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.content, isTablet && { width: contentMaxWidth }]}>

          {/* Info row */}
          <View style={styles.infoGrid}>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Kasir</Text>
              <Text style={styles.infoValue}>{detail.cashier_name}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Cabang</Text>
              <Text style={styles.infoValue}>{detail.branch_name}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Buka</Text>
              <Text style={styles.infoValue}>{fmtDateTime(detail.opened_at)}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Tutup</Text>
              <Text style={styles.infoValue}>{detail.closed_at ? fmtDateTime(detail.closed_at) : '-'}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Durasi</Text>
              <Text style={styles.infoValue}>{fmtDuration(detail.opened_at, detail.closed_at)}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Kas Awal</Text>
              <Text style={styles.infoValue}>{formatCurrency(detail.opening_cash)}</Text>
            </View>
          </View>

          {/* Summary stats */}
          <Text style={styles.sectionTitle}>Ringkasan Penjualan</Text>
          <View style={styles.statsRow}>
            <StatCard label="Transaksi" value={String(detail.summary.totalTransactions)} color="#347385" icon="receipt-outline" />
            <StatCard label="Total" value={formatCurrency(detail.summary.totalSales)} color="#22C55E" icon="cash-outline" />
            <StatCard label="Kas Akhir" value={detail.closing_cash != null ? formatCurrency(detail.closing_cash) : '-'} color="#F59E0B" icon="wallet-outline" />
          </View>

          {/* Payment methods */}
          <View style={styles.methodsRow}>
            {detail.summary.cashSales > 0 && (
              <View style={[styles.methodCard, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="cash-outline" size={16} color="#16A34A" />
                <Text style={[styles.methodAmount, { color: '#16A34A' }]}>{formatCurrency(detail.summary.cashSales)}</Text>
                <Text style={styles.methodLabel}>Tunai</Text>
              </View>
            )}
            {detail.summary.transferSales > 0 && (
              <View style={[styles.methodCard, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="swap-horizontal-outline" size={16} color="#1D4ED8" />
                <Text style={[styles.methodAmount, { color: '#1D4ED8' }]}>{formatCurrency(detail.summary.transferSales)}</Text>
                <Text style={styles.methodLabel}>Transfer</Text>
              </View>
            )}
            {detail.summary.qrisSales > 0 && (
              <View style={[styles.methodCard, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="qr-code-outline" size={16} color="#6D28D9" />
                <Text style={[styles.methodAmount, { color: '#6D28D9' }]}>{formatCurrency(detail.summary.qrisSales)}</Text>
                <Text style={styles.methodLabel}>QRIS</Text>
              </View>
            )}
            {detail.summary.splitSales > 0 && (
              <View style={[styles.methodCard, { backgroundColor: '#F5F3FF' }]}>
                <Ionicons name="shuffle-outline" size={16} color="#7C3AED" />
                <Text style={[styles.methodAmount, { color: '#7C3AED' }]}>{formatCurrency(detail.summary.splitSales)}</Text>
                <Text style={styles.methodLabel}>Campuran</Text>
              </View>
            )}
            {detail.summary.deliverySales > 0 && (
              <View style={[styles.methodCard, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="bicycle-outline" size={16} color="#DC2626" />
                <Text style={[styles.methodAmount, { color: '#DC2626' }]}>{formatCurrency(detail.summary.deliverySales)}</Text>
                <Text style={styles.methodLabel}>Delivery</Text>
              </View>
            )}
          </View>

          {/* Notes */}
          {!!detail.notes && (
            <View style={styles.notesCard}>
              <Ionicons name="document-text-outline" size={14} color="#9CA3AF" />
              <Text style={styles.notesText}>{detail.notes}</Text>
            </View>
          )}

          {/* Transactions list */}
          <View style={styles.txSection}>
            <Text style={styles.sectionTitle}>
              Transaksi ({detail.transactions.length})
            </Text>
            <View style={styles.txList}>
              {detail.transactions.length === 0 ? (
                <View style={styles.emptyTx}>
                  <Ionicons name="receipt-outline" size={36} color="#D1D5DB" />
                  <Text style={styles.emptyTxText}>Tidak ada transaksi</Text>
                </View>
              ) : (
                detail.transactions.map((tx) => <TxRow key={tx.id} tx={tx} />)
              )}
            </View>
          </View>

          {/* Download button */}
          <TouchableOpacity
            style={[styles.downloadBtn, downloading && { opacity: 0.6 }]}
            onPress={handleDownloadPdf}
            disabled={downloading}
          >
            {downloading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="document-text-outline" size={18} color="#fff" />
                <Text style={styles.downloadBtnText}>Download PDF Laporan Shift</Text>
              </>
            )}
          </TouchableOpacity>

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topBarCenter: { flex: 1, alignItems: 'center', gap: 4 },
  topBarTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  pdfBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#347385', justifyContent: 'center', alignItems: 'center',
  },

  scroll: { flexGrow: 1 },
  content: { padding: 16, gap: 14, width: '100%' },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoCard: {
    minWidth: '47%', flex: 1,
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#F0F0F0',
    gap: 3,
  },
  infoLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#111827' },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151' },

  statsRow: { flexDirection: 'row', gap: 8 },

  methodsRow: { flexDirection: 'row', gap: 8 },
  methodCard: {
    flex: 1, alignItems: 'center', gap: 4,
    borderRadius: 12, padding: 12,
  },
  methodAmount: { fontSize: 13, fontWeight: '800' },
  methodLabel: { fontSize: 10, color: '#6B7280', fontWeight: '600' },

  notesCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  notesText: { flex: 1, fontSize: 13, color: '#92400E' },

  txSection: { gap: 8 },
  txList: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
  },
  emptyTx: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyTxText: { fontSize: 13, color: '#9CA3AF' },

  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#347385', borderRadius: 14,
    paddingVertical: 15, marginTop: 4,
  },
  downloadBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
