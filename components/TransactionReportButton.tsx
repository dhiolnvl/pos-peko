import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { APP_NAME, formatCurrency } from '@/constants/config';
import DatePickerModal from '@/components/DatePickerModal';

type StatusFilter = 'all' | 'completed' | 'void';
type MethodFilter = 'all' | 'cash' | 'transfer' | 'qris';

interface Props {
  printerName: string;
  branchId?: string;
  branchName?: string;
  showBranch?: boolean;
  variant?: 'default' | 'onDark';
  initialDateFrom?: string;
  initialDateTo?: string;
  initialStatus?: StatusFilter;
  initialMethod?: MethodFilter;
}

interface TxItemRow {
  invoice_number: string;
  created_at: string;
  branch_name: string | null;
  product_name: string;
  quantity: number;
  subtotal: number;
  total: number;
  payment_method: string;
  cashier_name: string | null;
  status: string;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  qris: 'QRIS',
};

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'Semua',
  completed: 'Selesai',
  void: 'Batal',
};

const METHOD_LABEL_MAP: Record<MethodFilter, string> = {
  all: 'Semua',
  cash: 'Tunai',
  transfer: 'Transfer',
  qris: 'QRIS',
};

const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function fmtDateDisplay(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtDateShort(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return iso; }
}

function buildPeriodLabel(from: string | null, to: string | null) {
  if (!from && !to) return 'Semua Waktu';
  if (from && to) return `${fmtDateDisplay(from)} - ${fmtDateDisplay(to)}`;
  if (from) return `Mulai ${fmtDateDisplay(from)}`;
  return `Sampai ${fmtDateDisplay(to!)}`;
}

async function fetchTransactionRows(
  branchId: string | undefined,
  dateFrom: string | null,
  dateTo: string | null,
  status: StatusFilter,
  method: MethodFilter,
): Promise<TxItemRow[]> {
  const startOfDay = (s: string) => { const d = new Date(s); d.setHours(0, 0, 0, 0); return d.toISOString(); };
  const endOfDay = (s: string) => { const d = new Date(s); d.setHours(23, 59, 59, 999); return d.toISOString(); };

  let txQ = supabase
    .from('transactions')
    .select('id, invoice_number, created_at, total, payment_method, status, branches!branch_id(name), users!cashier_id(name)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (branchId) txQ = (txQ as any).eq('branch_id', branchId);
  if (dateFrom) txQ = (txQ as any).gte('created_at', startOfDay(dateFrom));
  if (dateTo) txQ = (txQ as any).lte('created_at', endOfDay(dateTo));
  if (status === 'completed') txQ = (txQ as any).neq('status', 'void');
  else if (status === 'void') txQ = (txQ as any).eq('status', 'void');
  if (method !== 'all') txQ = (txQ as any).eq('payment_method', method);

  const { data: txData } = await txQ;
  const txRows = txData ?? [];

  if (txRows.length === 0) return [];

  const txIds = txRows.map((r: any) => r.id);
  const { data: itemData } = await supabase
    .from('transaction_items')
    .select('transaction_id, product_name, quantity, subtotal')
    .in('transaction_id', txIds)
    .order('product_name', { ascending: true });

  const txMap = new Map(txRows.map((r: any) => [r.id, r]));
  const result: TxItemRow[] = (itemData ?? []).map((item: any) => {
    const tx: any = txMap.get(item.transaction_id);
    return {
      invoice_number: tx?.invoice_number ?? '',
      created_at: tx?.created_at ?? '',
      branch_name: (tx as any)?.branches?.name ?? null,
      product_name: item.product_name,
      quantity: item.quantity,
      subtotal: item.subtotal,
      total: tx?.total ?? 0,
      payment_method: tx?.payment_method ?? '',
      cashier_name: (tx as any)?.users?.name ?? null,
      status: tx?.status ?? '',
    };
  });

  result.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.product_name.localeCompare(b.product_name));
  return result;
}

function buildHtml(
  rows: TxItemRow[],
  branchName: string | undefined,
  showBranch: boolean,
  printerName: string,
  periode: string,
  printedAt: string,
  statusLabel: string,
  methodLabel: string,
): string {
  const invoiceMap = new Map<string, { total: number; status: string }>();
  for (const r of rows) {
    if (!invoiceMap.has(r.invoice_number)) {
      invoiceMap.set(r.invoice_number, { total: r.total, status: r.status });
    }
  }
  const totalPenjualan = [...invoiceMap.values()]
    .filter((v) => v.status !== 'void')
    .reduce((s, v) => s + v.total, 0);
  const totalTransaksi = invoiceMap.size;

  const branchLabel = branchName ?? 'Semua Cabang';

  const rowsHtml = rows.map((r, i) => `
    <tr class="${i % 2 === 1 ? 'alt' : ''}${r.status === 'void' ? ' void' : ''}">
      <td class="center">${i + 1}</td>
      <td><strong>${r.invoice_number}</strong></td>
      <td class="center">${fmtDateTime(r.created_at)}</td>
      ${showBranch ? `<td>${r.branch_name ?? '-'}</td>` : ''}
      <td>${r.product_name ?? '-'}</td>
      <td class="center">${r.quantity ?? '-'}</td>
      <td class="right">${r.subtotal != null ? formatCurrency(r.subtotal) : '-'}</td>
      <td>${METHOD_LABELS[r.payment_method] ?? r.payment_method}</td>
      <td>${r.cashier_name ?? '-'}</td>
    </tr>
  `).join('');

  const colCount = showBranch ? 9 : 8;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 8px; color: #111; padding: 16px; }
    .header { text-align: center; margin-bottom: 12px; }
    .header h1 { font-size: 13px; font-weight: bold; margin-bottom: 2px; }
    .header h2 { font-size: 10px; font-weight: 600; color: #374151; margin-bottom: 4px; }
    .meta {
      display: flex; flex-wrap: wrap; gap: 10px;
      font-size: 8px; color: #6B7280;
      border-top: 1px solid #E5E7EB; border-bottom: 1px solid #E5E7EB;
      padding: 6px 0; margin-bottom: 10px;
    }
    .meta-item { display: flex; flex-direction: column; gap: 1px; min-width: 90px; }
    .meta-item label { font-size: 7px; color: #9CA3AF; }
    .meta-item strong { font-size: 8px; color: #111; }
    .summary {
      display: flex; gap: 16px;
      background: #EEF8FA; border-radius: 6px;
      padding: 8px 12px; margin-bottom: 12px;
    }
    .summary-item { display: flex; flex-direction: column; gap: 1px; }
    .summary-item label { font-size: 7px; color: #6B7280; }
    .summary-item strong { font-size: 10px; color: #111; font-weight: 800; }
    .summary-item.green strong { color: #16A34A; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #347385; color: #fff; }
    th { padding: 4px 5px; font-size: 7px; text-align: left; font-weight: 700; letter-spacing: 0.2px; }
    td { padding: 3px 5px; font-size: 7.5px; border-bottom: 1px solid #F3F4F6; vertical-align: top; }
    tr.alt td { background: #F9FAFB; }
    tr.void td { opacity: 0.5; text-decoration: line-through; }
    .center { text-align: center; }
    .right { text-align: right; }
    tfoot tr td { font-weight: 700; border-top: 2px solid #347385; background: #EEF8FA; font-size: 8px; }
    .footer { margin-top: 12px; font-size: 7px; color: #9CA3AF; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${APP_NAME}</h1>
    <h2>Laporan Transaksi</h2>
  </div>
  <div class="meta">
    <div class="meta-item"><label>Cabang</label><strong>${branchLabel}</strong></div>
    <div class="meta-item"><label>Periode</label><strong>${periode}</strong></div>
    <div class="meta-item"><label>Status</label><strong>${statusLabel}</strong></div>
    <div class="meta-item"><label>Metode Bayar</label><strong>${methodLabel}</strong></div>
    <div class="meta-item"><label>Dicetak oleh</label><strong>${printerName}</strong></div>
    <div class="meta-item"><label>Tanggal Cetak</label><strong>${printedAt}</strong></div>
  </div>
  <div class="summary">
    <div class="summary-item green">
      <label>Total Penjualan</label>
      <strong>${formatCurrency(totalPenjualan)}</strong>
    </div>
    <div class="summary-item">
      <label>Total Transaksi</label>
      <strong>${totalTransaksi} transaksi</strong>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="center" style="width:20px">No</th>
        <th style="width:${showBranch ? 70 : 80}px">No Transaksi</th>
        <th class="center" style="width:68px">Waktu Bayar</th>
        ${showBranch ? '<th style="width:60px">Cabang</th>' : ''}
        <th>Produk</th>
        <th class="center" style="width:24px">Qty</th>
        <th class="right" style="width:68px">Total Penjualan</th>
        <th style="width:48px">Metode Bayar</th>
        <th style="width:60px">Nama Kasir</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="${colCount - 2}" class="right">TOTAL (${totalTransaksi} transaksi)</td>
        <td class="right" colspan="2">${formatCurrency(totalPenjualan)}</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">${APP_NAME} &bull; Dicetak ${printedAt}</div>
</body>
</html>`;
}

function DateFieldBtn({
  label, value, placeholder, onPress,
}: { label: string; value: string | null; placeholder: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.dateField} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.dateLabel}>{label}</Text>
      <View style={styles.dateInputWrap}>
        <Ionicons name="calendar-outline" size={14} color="#347385" style={{ marginLeft: 10 }} />
        <Text style={[styles.dateInputText, !value && styles.datePlaceholder]} numberOfLines={1}>
          {value ? fmtDateDisplay(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={13} color="#9CA3AF" style={{ marginRight: 10 }} />
      </View>
    </TouchableOpacity>
  );
}

export default function TransactionReportButton({
  printerName,
  branchId,
  branchName,
  showBranch = false,
  variant = 'default',
  initialDateFrom,
  initialDateTo,
  initialStatus = 'all',
  initialMethod = 'all',
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(initialDateFrom ?? null);
  const [dateTo, setDateTo] = useState<string | null>(initialDateTo ?? null);
  const [pickerFor, setPickerFor] = useState<'from' | 'to' | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setError('');
    setGenerating(true);
    try {
      const rows = await fetchTransactionRows(branchId, dateFrom, dateTo, initialStatus, initialMethod);

      const periode = buildPeriodLabel(dateFrom, dateTo);
      const now = new Date();
      const printedAt = now.toLocaleDateString('id-ID', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      const html = buildHtml(
        rows, branchName, showBranch, printerName,
        periode, printedAt,
        STATUS_LABELS[initialStatus],
        METHOD_LABEL_MAP[initialMethod],
      );

      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const fileName = `laporan-transaksi-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}.pdf`;

      setShowModal(false);

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
      setError(e.message ?? 'Gagal membuat laporan');
    } finally {
      setGenerating(false);
    }
  };

  const handleClose = () => {
    if (generating) return;
    setShowModal(false);
    setError('');
  };

  return (
    <>
      <TouchableOpacity
        style={variant === 'onDark' ? styles.btnOnDark : styles.btn}
        onPress={() => setShowModal(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="download-outline" size={16} color={variant === 'onDark' ? '#fff' : '#347385'} />
        <Text style={variant === 'onDark' ? styles.btnOnDarkText : styles.btnText}>Laporan PDF</Text>
      </TouchableOpacity>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={handleClose}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
          <TouchableOpacity style={styles.card} activeOpacity={1} onPress={() => {}}>

            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <Ionicons name="document-text-outline" size={18} color="#347385" />
              </View>
              <Text style={styles.cardTitle}>Download Laporan Transaksi</Text>
              <TouchableOpacity onPress={handleClose} disabled={generating}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.cardDesc}>
              Laporan akan menggunakan filter aktif saat ini. Pilih periode tanggal untuk membatasi data.
            </Text>

            <View style={styles.dateRow}>
              <DateFieldBtn
                label="Dari Tanggal"
                value={dateFrom}
                placeholder="Semua"
                onPress={() => setPickerFor('from')}
              />
              <DateFieldBtn
                label="Sampai Tanggal"
                value={dateTo}
                placeholder="Semua"
                onPress={() => setPickerFor('to')}
              />
            </View>

            {(dateFrom || dateTo) && (
              <TouchableOpacity
                onPress={() => { setDateFrom(null); setDateTo(null); setError(''); }}
                style={styles.clearBtn}
              >
                <Ionicons name="close-circle-outline" size={13} color="#9CA3AF" />
                <Text style={styles.clearBtnText}>Hapus filter periode</Text>
              </TouchableOpacity>
            )}

            {!!error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={13} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.generateBtn, generating && { opacity: 0.7 }]}
              onPress={handleGenerate}
              disabled={generating}
              activeOpacity={0.85}
            >
              {generating ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.generateBtnText}>Membuat PDF...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="download-outline" size={16} color="#fff" />
                  <Text style={styles.generateBtnText}>Download PDF</Text>
                </>
              )}
            </TouchableOpacity>

          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <DatePickerModal
        visible={pickerFor === 'from'}
        title="Dari Tanggal"
        value={dateFrom}
        maxDate={dateTo ?? undefined}
        onConfirm={(d) => { setDateFrom(d); setPickerFor(null); }}
        onCancel={() => setPickerFor(null)}
      />
      <DatePickerModal
        visible={pickerFor === 'to'}
        title="Sampai Tanggal"
        value={dateTo}
        minDate={dateFrom ?? undefined}
        onConfirm={(d) => { setDateTo(d); setPickerFor(null); }}
        onCancel={() => setPickerFor(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: '#347385', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#EEF8FA',
  },
  btnText: { fontSize: 13, fontWeight: '700', color: '#347385' },
  btnOnDark: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  btnOnDarkText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 20,
    padding: 20, width: '100%', maxWidth: 420, gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: '#111827' },
  cardDesc: { fontSize: 12, color: '#6B7280', lineHeight: 18 },

  dateRow: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1, gap: 5 },
  dateLabel: { fontSize: 11, fontWeight: '700', color: '#374151' },
  dateInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#A9DFE9', borderRadius: 10,
    backgroundColor: '#F0F7F9', paddingVertical: 9,
  },
  dateInputText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#111827', paddingHorizontal: 6 },
  datePlaceholder: { color: '#9CA3AF', fontWeight: '400' },

  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  clearBtnText: { fontSize: 11, color: '#9CA3AF' },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10,
  },
  errorText: { color: '#DC2626', fontSize: 12, flex: 1 },

  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#347385', borderRadius: 12,
    paddingVertical: 13, marginTop: 4,
  },
  generateBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
