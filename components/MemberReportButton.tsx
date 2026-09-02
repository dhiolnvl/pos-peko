import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getMemberReport, type MemberReportRow } from '@/lib/memberQueries';
import { APP_NAME, formatCurrency } from '@/constants/config';
import DatePickerModal from '@/components/DatePickerModal';

interface Props {
  storeName: string;
  /** Nama cabang — kosongkan untuk mode owner (semua cabang) */
  branchName?: string;
  printerName: string;
  /** Tampilkan kolom Cabang di tabel PDF (mode owner) */
  showBranch?: boolean;
  /** 'default' = border teal di bg putih, 'onDark' = putih transparan untuk bg teal */
  variant?: 'default' | 'onDark';
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Jul', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function fmtDate(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtDateDisplay(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

function buildPeriodLabel(from: string | null, to: string | null) {
  if (!from && !to) return 'Semua Waktu';
  if (from && to) return `${fmtDateDisplay(from)} - ${fmtDateDisplay(to)}`;
  if (from) return `Mulai ${fmtDateDisplay(from)}`;
  return `Sampai ${fmtDateDisplay(to!)}`;
}

function buildHtml(
  rows: MemberReportRow[],
  storeName: string,
  branchName: string | undefined,
  printerName: string,
  periode: string,
  printedAt: string,
  showBranch: boolean,
): string {
  const totalTrx = rows.reduce((a, r) => a + r.total_transactions, 0);
  const totalSales = rows.reduce((a, r) => a + r.total_sales, 0);

  const rowsHtml = rows.map((r, i) => `
    <tr class="${i % 2 === 1 ? 'alt' : ''}">
      <td class="center">${i + 1}</td>
      <td><strong>${r.name}</strong></td>
      ${showBranch ? `<td>${r.branch_name ?? '-'}</td>` : ''}
      <td>${r.address ?? '-'}</td>
      <td>${r.phone ?? '-'}</td>
      <td class="center">${fmtDate(r.created_at)}</td>
      <td class="center">${r.total_transactions}</td>
      <td class="right">${formatCurrency(r.total_sales)}</td>
      <td class="center">${fmtDate(r.last_visit)}</td>
      <td class="center">${r.avg_visit_per_month}x</td>
      <td class="right">${formatCurrency(r.avg_nominal_per_month)}</td>
    </tr>
  `).join('');

  const branchMetaItem = branchName
    ? `<div class="meta-item"><label>Cabang</label><strong>${branchName}</strong></div>`
    : `<div class="meta-item"><label>Cabang</label><strong>Semua Cabang</strong></div>`;

  const branchColspan = showBranch ? 6 : 5;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 9px; color: #111; padding: 20px; }
    .header { text-align: center; margin-bottom: 14px; }
    .header h1 { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
    .header h2 { font-size: 11px; font-weight: 600; color: #374151; margin-bottom: 4px; }
    .meta {
      display: flex; justify-content: space-between;
      font-size: 8.5px; color: #6B7280;
      border-top: 1px solid #E5E7EB; border-bottom: 1px solid #E5E7EB;
      padding: 6px 0; margin-bottom: 14px; gap: 12px;
    }
    .meta-item { display: flex; flex-direction: column; gap: 1px; }
    .meta-item label { font-size: 7.5px; color: #9CA3AF; }
    .meta-item strong { font-size: 9px; color: #111; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #347385; color: #fff; }
    th { padding: 5px 6px; font-size: 7.5px; text-align: left; font-weight: 700; letter-spacing: 0.2px; }
    td { padding: 4px 6px; font-size: 8px; border-bottom: 1px solid #F3F4F6; vertical-align: top; }
    tr.alt td { background: #F9FAFB; }
    .center { text-align: center; }
    .right { text-align: right; }
    tfoot tr td { font-weight: 700; border-top: 2px solid #347385; background: #EEF8FA; font-size: 8.5px; }
    .footer { margin-top: 16px; font-size: 7.5px; color: #9CA3AF; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${storeName}</h1>
    <h2>Laporan Data Pelanggan</h2>
  </div>
  <div class="meta">
    ${branchMetaItem}
    <div class="meta-item"><label>Periode</label><strong>${periode}</strong></div>
    <div class="meta-item"><label>Dicetak oleh</label><strong>${printerName}</strong></div>
    <div class="meta-item"><label>Tanggal cetak</label><strong>${printedAt}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="center" style="width:24px">No</th>
        <th style="width:${showBranch ? 76 : 90}px">Nama</th>
        ${showBranch ? '<th style="width:70px">Cabang</th>' : ''}
        <th style="width:${showBranch ? 76 : 95}px">Alamat</th>
        <th style="width:68px">No. Telp</th>
        <th class="center" style="width:56px">Tgl Daftar</th>
        <th class="center" style="width:44px">Total Transaksi</th>
        <th class="right" style="width:74px">Total Penjualan (Rp)</th>
        <th class="center" style="width:56px">Last Visit</th>
        <th class="center" style="width:46px">Rata2 Visit/Bulan</th>
        <th class="right" style="width:78px">Rata2 Nominal/Bulan</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="${branchColspan}" class="right">TOTAL (${rows.length} pelanggan)</td>
        <td class="center">${totalTrx}</td>
        <td class="right">${formatCurrency(totalSales)}</td>
        <td colspan="3"></td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">${APP_NAME} &bull; Dicetak ${printedAt}</div>
</body>
</html>`;
}

// ─── Date Field Button ────────────────────────────────────────────────────────

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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MemberReportButton({ storeName, branchName, printerName, showBranch = false, variant = 'default' }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<'from' | 'to' | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setError('');
    setGenerating(true);
    try {
      const rows = await getMemberReport({ dateFrom, dateTo });

      const periode = buildPeriodLabel(dateFrom, dateTo);
      const now = new Date();
      const printedAt = now.toLocaleDateString('id-ID', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      const html = buildHtml(rows, storeName, branchName, printerName, periode, printedAt, showBranch);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const fileName = `laporan-pelanggan-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}.pdf`;

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
              <Text style={styles.cardTitle}>Download Laporan Pelanggan</Text>
              <TouchableOpacity onPress={handleClose} disabled={generating}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.cardDesc}>
              Kosongkan periode untuk mengambil semua data pelanggan.
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
