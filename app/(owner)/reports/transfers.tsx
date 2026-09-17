/**
 * Laporan Distribusi - Owner
 * Filter periode, summary card, riwayat distribusi yang sudah dikirim
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
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
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import {
  getAllStockTransfers, type StockTransferHeader,
} from '@/lib/warehouseQueries';
import { buildTransfersPdfHtml, formatDetailedPeriodLabel, type TransferPdfRow } from '@/lib/reportQueries';
import DatePickerModal from '@/components/DatePickerModal';
import { mmkv, StorageKeys } from '@/lib/mmkvStorage';
import { APP_NAME } from '@/constants/config';

type Preset = 'this_month' | 'last_month' | 'custom' | 'all';

function getRange(preset: Preset, customFrom?: string, customTo?: string): { from: Date; to: Date; fromStr?: string; toStr?: string } {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === 'this_month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from: s, to: e, fromStr: dateStr(s), toStr: dateStr(e) };
  }
  if (preset === 'last_month') {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from: s, to: e, fromStr: dateStr(s), toStr: dateStr(e) };
  }
  if (preset === 'custom') {
    const sStr = customFrom ?? dateStr(now);
    const eStr = customTo ?? dateStr(now);
    const s = new Date(sStr + 'T00:00:00');
    const e = new Date(eStr + 'T23:59:59');
    return { from: s, to: e, fromStr: sStr, toStr: eStr };
  }
  return {
    from: new Date(2000, 0, 1),
    to: new Date(2100, 0, 1),
    fromStr: undefined,
    toStr: undefined,
  };
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function TransferRow({ transfer }: { transfer: StockTransferHeader }) {
  const sentDate = transfer.sent_at ? fmtDate(transfer.sent_at) : fmtDate(transfer.created_at);

  const renderBadge = () => {
    switch (transfer.status) {
      case 'received':
        return (
          <View style={[trStyles.sentBadge, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="checkmark-circle" size={11} color="#16A34A" />
            <Text style={[trStyles.sentText, { color: '#16A34A' }]}>Diterima</Text>
          </View>
        );
      case 'partial':
        return (
          <View style={[trStyles.sentBadge, { backgroundColor: '#FFFBEB' }]}>
            <Ionicons name="alert-circle" size={11} color="#D97706" />
            <Text style={[trStyles.sentText, { color: '#D97706' }]}>Parsial</Text>
          </View>
        );
      case 'sent':
      default:
        return (
          <View style={[trStyles.sentBadge, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="paper-plane" size={11} color="#2563EB" />
            <Text style={[trStyles.sentText, { color: '#2563EB' }]}>Terkirim</Text>
          </View>
        );
    }
  };

  return (
    <View style={trStyles.row}>
      <View style={trStyles.iconWrap}>
        <Ionicons name="swap-horizontal" size={20} color="#347385" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={trStyles.branchName} numberOfLines={1}>{transfer.branch_name}</Text>
        <Text style={trStyles.meta}>{sentDate} · oleh {transfer.created_by_name}</Text>
        {!!transfer.notes && (
          <Text style={trStyles.notes} numberOfLines={1}>{transfer.notes}</Text>
        )}
      </View>
      {renderBadge()}
    </View>
  );
}

const trStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center', alignItems: 'center',
  },
  branchName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  meta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  notes: { fontSize: 11, color: '#6B7280', marginTop: 2, fontStyle: 'italic' },
  sentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  sentText: { fontSize: 11, fontWeight: '700' },
});

function SummaryCard({ label, value, icon, color }: {
  label: string; value: string; icon: keyof typeof Ionicons.glyphMap; color: string;
}) {
  return (
    <View style={sumStyles.card}>
      <View style={[sumStyles.iconBox, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[sumStyles.value, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={sumStyles.label}>{label}</Text>
    </View>
  );
}

const sumStyles = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 6,
    alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  value: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 10, fontWeight: '600', color: '#9CA3AF', textAlign: 'center' },
});

export default function OwnerTransfersReport() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 768;

  const [preset, setPreset] = useState<Preset>('this_month');
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(1);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-01`;
  });
  const [customTo, setCustomTo] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  });
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to' | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [allTransfers, setAllTransfers] = useState<StockTransferHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const results = await getAllStockTransfers();
      setAllTransfers(results);
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { from, to, fromStr, toStr } = getRange(preset, customFrom, customTo);

  const filtered = useMemo(() => {
    return allTransfers
      .filter((t) => {
        if (t.status === 'draft') return false;
        if (preset === 'all') return true;
        const sentDate = t.sent_at ? new Date(t.sent_at) : new Date(t.created_at);
        return sentDate >= from && sentDate <= to;
      })
      .sort((a, b) => {
        const da = new Date(a.sent_at ?? a.created_at).getTime();
        const db = new Date(b.sent_at ?? b.created_at).getTime();
        return db - da;
      });
  }, [allTransfers, from, to, preset]);

  const handleExportPdf = async () => {
    if (filtered.length === 0) {
      Alert.alert('Perhatian', 'Tidak ada data distribusi untuk diekspor');
      return;
    }
    setExportingPdf(true);
    try {
      const periodStr = formatDetailedPeriodLabel(
        fromStr ?? '',
        toStr ?? '',
        preset === 'all' ? 'Semua Waktu' : undefined
      );
      const storeInfo = (await mmkv.getObject<any>(StorageKeys.STORE_SETTINGS)) ?? {};

      const rows: TransferPdfRow[] = filtered.map((t) => ({
        date: t.sent_at ? fmtDate(t.sent_at) : fmtDate(t.created_at),
        branchName: t.branch_name ?? '-',
        createdByName: t.created_by_name ?? '-',
        statusLabel: t.status === 'received' ? 'Diterima' : t.status === 'partial' ? 'Parsial' : 'Terkirim',
        notes: t.notes || '-',
      }));

      const html = await buildTransfersPdfHtml(
        rows,
        {
          periodLabel: periodStr,
          storeName: storeInfo.store_name || storeInfo.name || APP_NAME,
          storeAddress: storeInfo.address,
        }
      );

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const fileName = `laporan-distribusi-${fromStr || 'semua'}-${toStr || ''}.pdf`;

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
      Alert.alert('Gagal', e?.message || 'Gagal membuat PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const totalDistribusi = filtered.length;
  const uniqueBranches = new Set(filtered.map((t) => t.branch_id)).size;

  return (
    <View style={styles.root}>
      <OwnerPageHeader title="Laporan Distribusi" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <TabletCenteredView>
          <View style={styles.filterRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
              {([
                { key: 'this_month' as Preset, label: 'Bulan Ini' },
                { key: 'last_month' as Preset, label: 'Bulan Lalu' },
                { key: 'custom' as Preset, label: 'Custom' },
                { key: 'all' as Preset, label: 'Semua' },
              ]).map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.chip, preset === item.key && styles.chipActive]}
                  onPress={() => setPreset(item.key)}
                >
                  <Text style={[styles.chipText, preset === item.key && styles.chipTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.exportPdfBtn} onPress={handleExportPdf} disabled={exportingPdf}>
              {exportingPdf ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={14} color="#fff" />
                  <Text style={styles.exportPdfText}>PDF</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {preset === 'custom' && (
            <View style={styles.customDateRow}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setPickerTarget('from')}>
                <Ionicons name="calendar-outline" size={14} color="#347385" />
                <Text style={styles.dateBtnText}>Dari: {customFrom}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#9CA3AF' }}>-</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setPickerTarget('to')}>
                <Ionicons name="calendar-outline" size={14} color="#347385" />
                <Text style={styles.dateBtnText}>Sampai: {customTo}</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.dateRange}>
            {formatDetailedPeriodLabel(fromStr ?? '', toStr ?? '', preset === 'all' ? 'Semua Waktu' : undefined)}
          </Text>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#347385" />
              <Text style={styles.loadingText}>Memuat data distribusi...</Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={load}>
                <Text style={styles.retryText}>Coba Lagi</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[styles.summaryRow, isTablet && styles.summaryRowTablet]}>
                <SummaryCard
                  label="Total Distribusi"
                  value={totalDistribusi.toString()}
                  icon="swap-horizontal"
                  color="#347385"
                />
                <SummaryCard
                  label="Cabang Penerima"
                  value={uniqueBranches.toString()}
                  icon="business-outline"
                  color="#22C55E"
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  Riwayat Distribusi ({filtered.length})
                </Text>

                {filtered.length === 0 ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIcon}>
                      <Ionicons name="swap-horizontal-outline" size={38} color="#D1D5DB" />
                    </View>
                    <Text style={styles.emptyTitle}>Tidak ada distribusi</Text>
                    <Text style={styles.emptySub}>
                      Belum ada distribusi yang dikirim pada periode ini
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.list, isTablet && styles.listTablet]}>
                    {filtered.map((t) => (
                      <View key={t.id} style={isTablet ? styles.listItemTablet : undefined}>
                        <TransferRow transfer={t} />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
        </TabletCenteredView>
      </ScrollView>

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
  root: { flex: 1, backgroundColor: '#F3F4F6' },

  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16,
    paddingTop: 16, paddingBottom: 4, alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
  },
  chipActive: { backgroundColor: '#347385', borderColor: '#347385' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },

  exportPdfBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#DC2626', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  exportPdfText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  customDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB',
  },
  dateBtnText: { fontSize: 12, fontWeight: '600', color: '#347385' },

  dateRange: {
    fontSize: 11, fontWeight: '600', color: '#9CA3AF',
    paddingHorizontal: 16, paddingBottom: 12,
  },

  centered: { paddingTop: 60, alignItems: 'center', gap: 12 },
  loadingText: { color: '#9CA3AF', fontSize: 14 },
  errorText: { color: '#EF4444', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: {
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: '#EEF8FA', borderRadius: 10,
  },
  retryText: { fontSize: 13, fontWeight: '700', color: '#347385' },

  summaryRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingBottom: 16,
  },
  summaryRowTablet: {},

  section: { paddingHorizontal: 16 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 10,
  },

  list: { gap: 10 },
  listTablet: { flexDirection: 'row', flexWrap: 'wrap' },
  listItemTablet: { width: '48.5%' },

  emptyState: { paddingTop: 32, alignItems: 'center', gap: 10 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub: {
    fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 32,
  },
});

