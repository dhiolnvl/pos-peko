/**
 * Transfer Masuk — Back Office
 * Daftar kiriman dari gudang pusat yang menunggu konfirmasi
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { TabletCenteredView } from '@/components/TabletCenteredView';

interface TransferItem {
  id: string;
  status: string;
  notes: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  item_count: number;
  total_qty: number;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    sent: { label: 'Menunggu Konfirmasi', color: '#F59E0B', bg: '#FFFBEB' },
    received: { label: 'Sudah Diterima', color: '#22C55E', bg: '#F0FDF4' },
    draft: { label: 'Draft', color: '#9CA3AF', bg: '#F3F4F6' },
  }[status] ?? { label: status, color: '#9CA3AF', bg: '#F3F4F6' };

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function TransferCard({
  item,
  onConfirm,
  isTablet,
}: {
  item: TransferItem;
  onConfirm: () => void;
  isTablet: boolean;
}) {
  return (
    <View style={[styles.card, isTablet && styles.cardTablet]}>
      <View style={styles.cardTop}>
        <View style={styles.iconWrap}>
          <Ionicons name="arrow-down-circle" size={22} color="#347385" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Kiriman dari Gudang Pusat</Text>
          <Text style={styles.cardDate}>
            {item.sent_at ? `Dikirim: ${fmtDate(item.sent_at)}` : fmtDate(item.created_at)}
          </Text>
        </View>
        <StatusBadge status={item.status} />
      </View>

      <View style={styles.cardStats}>
        <View style={styles.statItem}>
          <Ionicons name="list-outline" size={14} color="#6B7280" />
          <Text style={styles.statText}>{item.item_count} jenis produk</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="cube-outline" size={14} color="#6B7280" />
          <Text style={styles.statText}>{item.total_qty} total unit</Text>
        </View>
      </View>

      {item.notes ? (
        <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text>
      ) : null}

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.detailBtn}
          onPress={() => router.push(`/(backoffice)/stock/incoming-transfer-detail?id=${item.id}` as any)}
          activeOpacity={0.75}
        >
          <Ionicons name="eye-outline" size={14} color="#347385" />
          <Text style={styles.detailBtnText}>Lihat Detail</Text>
        </TouchableOpacity>

        {item.status === 'sent' && (
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={onConfirm}
            activeOpacity={0.75}
          >
            <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
            <Text style={styles.confirmBtnText}>Konfirmasi Terima</Text>
          </TouchableOpacity>
        )}

        {item.status === 'received' && item.received_at && (
          <Text style={styles.receivedText}>
            Diterima: {fmtDate(item.received_at)}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function IncomingTransfersScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { currentBranch } = useAuthStore();

  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');

  const loadData = useCallback(async () => {
    if (!currentBranch?.id) return;
    try {
      const { data, error } = await supabase
        .from('stock_transfers')
        .select(`
          id, status, notes, sent_at, received_at, created_at,
          stock_transfer_items (quantity)
        `)
        .eq('branch_id', currentBranch.id)
        .in('status', activeTab === 'pending' ? ['sent'] : ['sent', 'received', 'draft'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: TransferItem[] = (data ?? []).map((t: any) => ({
        id: t.id,
        status: t.status,
        notes: t.notes,
        sent_at: t.sent_at,
        received_at: t.received_at,
        created_at: t.created_at,
        item_count: t.stock_transfer_items?.length ?? 0,
        total_qty: t.stock_transfer_items?.reduce((sum: number, i: any) => sum + (i.quantity ?? 0), 0) ?? 0,
      }));

      setTransfers(mapped);
    } catch (e: any) {
      Alert.alert('Gagal memuat data', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentBranch?.id, activeTab]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleConfirm = (item: TransferItem) => {
    Alert.alert(
      'Konfirmasi Terima Barang',
      `Apakah barang dari kiriman ini sudah diterima?\n\n${item.item_count} jenis produk, ${item.total_qty} total unit.\n\nStok cabang akan bertambah setelah dikonfirmasi.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, Sudah Diterima',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('receive_stock_transfer', {
                p_transfer_id: item.id,
              });
              if (error) throw error;
              Alert.alert('Berhasil', 'Barang berhasil dikonfirmasi. Stok cabang sudah diperbarui.');
              loadData();
            } catch (e: any) {
              Alert.alert('Gagal', e.message);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#347385" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Transfer Masuk</Text>
          <Text style={styles.headerSub}>Kiriman stok dari gudang pusat</Text>
        </View>
      </View>

      {/* Tab filter */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => { setActiveTab('pending'); setLoading(true); }}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
            Menunggu Konfirmasi
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.tabActive]}
          onPress={() => { setActiveTab('all'); setLoading(true); }}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
            Semua
          </Text>
        </TouchableOpacity>
      </View>

      <TabletCenteredView maxWidth={800} style={{ flex: 1, paddingHorizontal: 16 }}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#347385" />
            <Text style={styles.loadingText}>Memuat data...</Text>
          </View>
        ) : transfers.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="arrow-down-circle-outline" size={56} color="#CBD5E0" />
            <Text style={styles.emptyTitle}>
              {activeTab === 'pending' ? 'Tidak ada kiriman menunggu' : 'Belum ada transfer masuk'}
            </Text>
            <Text style={styles.emptyText}>
              {activeTab === 'pending'
                ? 'Semua kiriman sudah dikonfirmasi'
                : 'Kiriman dari gudang pusat akan muncul di sini'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={transfers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TransferCard
                item={item}
                onConfirm={() => handleConfirm(item)}
                isTablet={isTablet}
              />
            )}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); loadData(); }}
                colors={['#347385']}
                tintColor="#347385"
              />
            }
          />
        )}
      </TabletCenteredView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5F4F7',
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5F4F7',
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#347385' },
  tabText: { fontSize: 13, fontWeight: '500', color: '#9CA3AF' },
  tabTextActive: { color: '#347385', fontWeight: '700' },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: '#9CA3AF' },

  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 32 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#D4EFF4',
    shadowColor: '#347385',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTablet: { marginHorizontal: 4 },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  cardDate: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  cardStats: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, color: '#6B7280' },

  notes: { fontSize: 12, color: '#9CA3AF', marginBottom: 10, fontStyle: 'italic' },

  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A9DFE9',
    backgroundColor: '#EEF8FA',
  },
  detailBtnText: { fontSize: 12, fontWeight: '600', color: '#347385' },

  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#347385',
  },
  confirmBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  receivedText: { fontSize: 12, color: '#22C55E', fontWeight: '600' },
});
