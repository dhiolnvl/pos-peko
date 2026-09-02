/**
 * Distribusi Stok — List Screen
 * Role: staff_pusat
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getStockTransfers,
  getWarehouses,
  deleteStockTransfer,
  type StockTransferHeader,
} from '@/lib/warehouseQueries';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import type { Warehouse } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return iso;
  }
}

function getMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  return { from, to };
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    draft: { label: 'Draft', color: '#9CA3AF', bg: '#F3F4F6' },
    sent: { label: 'Terkirim', color: '#F59E0B', bg: '#FFFBEB' },
    received: { label: 'Diterima Cabang', color: '#22C55E', bg: '#F0FDF4' },
  }[status] ?? { label: status, color: '#9CA3AF', bg: '#F3F4F6' };

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

interface TransferCardProps {
  item: StockTransferHeader;
  itemCount: number;
  onPress: () => void;
  onLongPress: () => void;
  isTablet: boolean;
}

function TransferCard({ item, itemCount, onPress, onLongPress, isTablet }: TransferCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, isTablet && styles.cardTablet]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <View style={styles.branchIconWrap}>
            <Ionicons name="business-outline" size={18} color="#347385" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardBranch} numberOfLines={1}>
              {item.branch_name}
            </Text>
            <Text style={styles.cardDate}>{fmtDate(item.created_at)}</Text>
          </View>
        </View>
        <StatusBadge status={item.status} />
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.cardMeta}>
          <Ionicons name="cube-outline" size={13} color="#718096" />
          <Text style={styles.cardMetaText}>{itemCount} jenis produk</Text>
        </View>
        <View style={styles.cardMeta}>
          <Ionicons name="person-outline" size={13} color="#718096" />
          <Text style={styles.cardMetaText} numberOfLines={1}>
            {item.created_by_name}
          </Text>
        </View>
      </View>
      {item.status === 'draft' && (
        <View style={styles.longPressHint}>
          <Text style={styles.longPressHintText}>Tahan untuk hapus</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TransfersScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [transfers, setTransfers] = useState<StockTransferHeader[]>([]);
  const [itemCountMap, setItemCountMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      // Load warehouse first
      const warehouses = await getWarehouses();
      if (warehouses.length === 0) {
        setError('Tidak ada gudang aktif');
        return;
      }
      const wh = warehouses[0];
      setWarehouse(wh);

      // Load transfers
      const data = await getStockTransfers(wh.id);
      setTransfers(data);

      // Load item counts per transfer
      const { supabase } = await import('@/lib/supabase');
      if (data.length > 0) {
        const ids = data.map((t) => t.id);
        const { data: countRows } = await supabase
          .from('stock_transfer_items')
          .select('transfer_id')
          .in('transfer_id', ids);

        const map: Record<string, number> = {};
        for (const row of countRows ?? []) {
          map[row.transfer_id] = (map[row.transfer_id] ?? 0) + 1;
        }
        setItemCountMap(map);
      }
    } catch (err: any) {
      setError(err.message ?? 'Gagal memuat data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleDelete = (transfer: StockTransferHeader) => {
    if (transfer.status !== 'draft') return;
    Alert.alert(
      'Hapus Transfer',
      `Hapus distribusi ke ${transfer.branch_name}? Tindakan ini tidak dapat dibatalkan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteStockTransfer(transfer.id);
              setTransfers((prev) => prev.filter((t) => t.id !== transfer.id));
            } catch (err: any) {
              Alert.alert('Gagal', err.message ?? 'Gagal menghapus transfer');
            }
          },
        },
      ]
    );
  };

  // Stats
  const { from, to } = getMonthRange();
  const stats = useMemo(() => {
    const thisMonth = transfers.filter(
      (t) => t.created_at >= from && t.created_at <= to
    );
    return {
      draft: transfers.filter((t) => t.status === 'draft').length,
      sent: transfers.filter((t) => t.status === 'sent').length,
      total: thisMonth.length,
    };
  }, [transfers, from, to]);

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="swap-horizontal-outline" size={56} color="#CBD5E0" />
      <Text style={styles.emptyTitle}>Belum ada distribusi</Text>
      <Text style={styles.emptyDesc}>Tap tombol + untuk membuat distribusi baru</Text>
    </View>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color="#347385" />
          <Text style={styles.loadingText}>Memuat data...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadData()}>
            <Text style={styles.retryBtnText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={transfers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          isTablet && styles.listContentTablet,
          transfers.length === 0 && styles.listContentEmpty,
        ]}
        renderItem={({ item }) => (
          <TransferCard
            item={item}
            itemCount={itemCountMap[item.id] ?? 0}
            isTablet={isTablet}
            onPress={() =>
              router.push(`/(staff-pusat)/transfers/${item.id}` as any)
            }
            onLongPress={() => handleDelete(item)}
          />
        )}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            colors={['#347385']}
            tintColor="#347385"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Distribusi Stok ke Cabang</Text>
          {warehouse && (
            <Text style={styles.headerSub}>Gudang: {warehouse.name}</Text>
          )}
        </View>
      </View>

      <TabletCenteredView maxWidth={900}>
        {/* Stats */}
        <View style={[styles.statsRow, isTablet && styles.statsRowTablet]}>
          <View style={[styles.statCard, styles.statCardDraft]}>
            <Text style={styles.statNum}>{stats.draft}</Text>
            <Text style={styles.statLabel}>Draft</Text>
          </View>
          <View style={[styles.statCard, styles.statCardSent]}>
            <Text style={styles.statNum}>{stats.sent}</Text>
            <Text style={styles.statLabel}>Terkirim</Text>
          </View>
          <View style={[styles.statCard, styles.statCardTotal]}>
            <Text style={styles.statNum}>{stats.total}</Text>
            <Text style={styles.statLabel}>Bulan Ini</Text>
          </View>
        </View>

        {/* List */}
        <View style={{ flex: 1 }}>{renderContent()}</View>
      </TabletCenteredView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => router.push('/(staff-pusat)/transfers/new' as any)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A202C' },
  headerSub: { fontSize: 12, color: '#718096', marginTop: 2 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 10,
  },
  statsRowTablet: { paddingHorizontal: 24 },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statCardDraft: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D' },
  statCardSent: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC' },
  statCardTotal: { backgroundColor: '#EEF8FA', borderWidth: 1, borderColor: '#A7D4DC' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#1A202C' },
  statLabel: { fontSize: 11, color: '#718096', fontWeight: '500' },

  // List
  listContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 100,
  },
  listContentTablet: { paddingHorizontal: 24 },
  listContentEmpty: { flexGrow: 1 },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  cardTablet: { padding: 16 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  branchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBranch: { fontSize: 15, fontWeight: '700', color: '#1A202C' },
  cardDate: { fontSize: 12, color: '#718096', marginTop: 1 },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaText: { fontSize: 12, color: '#718096' },
  longPressHint: { alignSelf: 'flex-start' },
  longPressHintText: { fontSize: 10, color: '#CBD5E0', fontStyle: 'italic' },

  // Badge
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeSent: { backgroundColor: '#DCFCE7' },
  badgeDraft: { backgroundColor: '#FEF3C7' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextSent: { color: '#15803D' },
  badgeTextDraft: { color: '#B45309' },

  // Empty
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 60,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#4A5568' },
  emptyDesc: { fontSize: 13, color: '#A0AEC0', textAlign: 'center' },

  // Center
  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  loadingText: { fontSize: 14, color: '#718096' },
  errorText: { fontSize: 14, color: '#EF4444', textAlign: 'center' },
  retryBtn: {
    marginTop: 4,
    backgroundColor: '#347385',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#347385',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#347385',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
});
