/**
 * Laporan Distribusi - Owner
 * Filter periode, summary card, riwayat distribusi yang sudah dikirim
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import {
  getStockTransfers, getWarehouses, type StockTransferHeader,
} from '@/lib/warehouseQueries';
import type { Warehouse } from '@/types';

type Preset = 'this_month' | 'last_month';

function getRange(preset: Preset): { from: Date; to: Date } {
  const now = new Date();
  if (preset === 'this_month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  return {
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
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

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function TransferRow({ transfer }: { transfer: StockTransferHeader }) {
  const sentDate = transfer.sent_at ? fmtDate(transfer.sent_at) : fmtDate(transfer.created_at);
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
      <View style={trStyles.sentBadge}>
        <Ionicons name="checkmark-circle" size={11} color="#16A34A" />
        <Text style={trStyles.sentText}>Terkirim</Text>
      </View>
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
    backgroundColor: '#F0FDF4', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  sentText: { fontSize: 11, fontWeight: '700', color: '#16A34A' },
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
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [allTransfers, setAllTransfers] = useState<StockTransferHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getWarehouses()
      .then(setWarehouses)
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (warehouses.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(
        warehouses.map((w) => getStockTransfers(w.id))
      );
      setAllTransfers(results.flat());
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [warehouses]);

  useEffect(() => { load(); }, [load]);

  const { from, to } = getRange(preset);

  const filtered = useMemo(() => {
    return allTransfers
      .filter((t) => {
        if (t.status !== 'sent') return false;
        const sentDate = t.sent_at ? new Date(t.sent_at) : new Date(t.created_at);
        return sentDate >= from && sentDate <= to;
      })
      .sort((a, b) => {
        const da = new Date(a.sent_at ?? a.created_at).getTime();
        const db = new Date(b.sent_at ?? b.created_at).getTime();
        return db - da;
      });
  }, [allTransfers, from, to]);

  const totalDistribusi = filtered.length;
  const uniqueBranches = new Set(filtered.map((t) => t.branch_id)).size;
  const periodLabel = preset === 'this_month' ? 'Bulan Ini' : 'Bulan Lalu';

  return (
    <View style={styles.root}>
      <OwnerPageHeader title="Laporan Distribusi" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <TabletCenteredView>
          <View style={styles.filterRow}>
            {([
              { key: 'this_month' as Preset, label: 'Bulan Ini' },
              { key: 'last_month' as Preset, label: 'Bulan Lalu' },
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
          </View>

          <Text style={styles.dateRange}>
            {fmtDateShort(from)} - {fmtDateShort(to)}
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
                      Belum ada distribusi yang dikirim pada {periodLabel.toLowerCase()}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },

  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16,
    paddingTop: 16, paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
  },
  chipActive: { backgroundColor: '#347385', borderColor: '#347385' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },

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
