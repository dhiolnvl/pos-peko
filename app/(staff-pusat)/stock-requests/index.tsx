import React, { useState, useCallback } from 'react';
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
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { TabletCenteredView } from '@/components/TabletCenteredView';

type TabFilter = 'pending' | 'all';

interface RequestItem {
  product_id: string;
  quantity: number;
  products: { name: string; unit: string } | null;
}

interface StockRequest {
  id: string;
  status: string;
  notes: string | null;
  review_notes: string | null;
  created_at: string;
  branch_id: string;
  branches: { name: string } | null;
  created_by: string | null;
  stock_request_items: RequestItem[];
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
      .toString()
      .padStart(2, '0')}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  const cfg =
    {
      pending: { label: 'Menunggu', color: '#B45309', bg: '#FFFBEB' },
      approved: { label: 'Disetujui', color: '#15803D', bg: '#F0FDF4' },
      rejected: { label: 'Ditolak', color: '#DC2626', bg: '#FEF2F2' },
    }[status] ?? { label: status, color: '#9CA3AF', bg: '#F3F4F6' };

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

interface RequestCardProps {
  item: StockRequest;
  isTablet: boolean;
}

function RequestCard({ item, isTablet }: RequestCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, isTablet && styles.cardTablet]}
      onPress={() => router.push(`/(staff-pusat)/stock-requests/${item.id}` as any)}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <View style={styles.iconWrap}>
            <Ionicons name="business-outline" size={18} color="#347385" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardBranch} numberOfLines={1}>
              {item.branches?.name ?? '-'}
            </Text>
            <Text style={styles.cardDate}>{fmtDate(item.created_at)}</Text>
          </View>
        </View>
        <StatusBadge status={item.status} />
      </View>

      <View style={styles.itemsList}>
        {item.stock_request_items.map((ri, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Ionicons name="cube-outline" size={13} color="#718096" />
            <Text style={styles.itemText} numberOfLines={1}>
              {ri.products?.name ?? 'Produk Dihapus'} — {ri.quantity} {ri.products?.unit ?? ''}
            </Text>
          </View>
        ))}
      </View>

      {item.notes ? (
        <Text style={styles.notesText} numberOfLines={2}>
          Catatan: {item.notes}
        </Text>
      ) : null}


      {item.status === 'rejected' && item.review_notes ? (
        <Text style={styles.reviewNotes}>Alasan tolak: {item.review_notes}</Text>
      ) : null}

      <View style={styles.cardFooter}>
        <Text style={styles.cardFooterText}>Lihat detail & proses</Text>
        <Ionicons name="chevron-forward" size={14} color="#347385" />
      </View>
    </TouchableOpacity>
  );
}

export default function StockRequestsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [tab, setTab] = useState<TabFilter>('pending');
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (showRefresh = false) => {
      try {
        if (showRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        let query = supabase
          .from('stock_requests')
          .select(
            'id, status, notes, review_notes, created_at, branch_id, created_by, branches(name), stock_request_items(product_id, quantity, products(name, unit))'
          )
          .order('created_at', { ascending: false });

        if (tab === 'pending') {
          query = query.in('status', ['pending']);
        }

        const { data, error: qErr } = await query;
        if (qErr) throw qErr;
        setRequests((data as any[]) ?? []);
      } catch (err: any) {
        setError(err.message ?? 'Gagal memuat data');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tab]
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="clipboard-outline" size={56} color="#CBD5E0" />
      <Text style={styles.emptyTitle}>Tidak ada permintaan</Text>
      <Text style={styles.emptyDesc}>
        {tab === 'pending' ? 'Belum ada permintaan yang menunggu persetujuan' : 'Belum ada permintaan stok'}
      </Text>
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
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          isTablet && styles.listContentTablet,
          requests.length === 0 && styles.listContentEmpty,
        ]}
        renderItem={({ item }) => (
          <RequestCard item={item} isTablet={isTablet} />
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Permintaan Stok dari Cabang</Text>
        {pendingCount > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
          </View>
        )}
      </View>

      <TabletCenteredView maxWidth={900}>
        <View style={[styles.tabRow, isTablet && styles.tabRowTablet]}>
          {(['pending', 'all'] as TabFilter[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => setTab(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                {t === 'pending' ? 'Menunggu' : 'Semua'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ flex: 1 }}>{renderContent()}</View>
      </TabletCenteredView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A202C', flex: 1 },
  pendingBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  pendingBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  tabRowTablet: { paddingHorizontal: 24 },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#EDF2F7',
  },
  tabBtnActive: { backgroundColor: '#347385' },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: '#718096' },
  tabBtnTextActive: { color: '#fff' },

  listContent: { padding: 16, gap: 12, paddingBottom: 40 },
  listContentTablet: { paddingHorizontal: 24 },
  listContentEmpty: { flexGrow: 1 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  cardTablet: { padding: 18 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBranch: { fontSize: 15, fontWeight: '700', color: '#1A202C' },
  cardDate: { fontSize: 12, color: '#718096', marginTop: 1 },

  itemsList: { gap: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemText: { fontSize: 13, color: '#4A5568', flex: 1 },

  notesText: { fontSize: 12, color: '#718096', fontStyle: 'italic' },
  reviewNotes: {
    fontSize: 12,
    color: '#DC2626',
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    padding: 8,
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
    marginTop: 2,
  },
  cardFooterText: { fontSize: 12, color: '#347385', fontWeight: '600' },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 60,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#4A5568' },
  emptyDesc: { fontSize: 13, color: '#A0AEC0', textAlign: 'center', paddingHorizontal: 32 },

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

});
