import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, useWindowDimensions, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStockStore, type StockOpname } from '@/store/stockStore';

type OpnameStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

const STATUS_CFG: Record<OpnameStatus, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  approved: { label: 'Disetujui',       color: '#145a6c', bg: '#d0f3ff', icon: 'checkmark-circle' },
  submitted: { label: 'Menunggu Review', color: '#44636e', bg: '#c7e8f5', icon: 'time-outline' },
  draft:     { label: 'Draft',           color: '#764900', bg: '#ffddb8', icon: 'create' },
  rejected:  { label: 'Ditolak',         color: '#ba1a1a', bg: '#ffdad6', icon: 'close-circle' },
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

function OpnameListFooter({ loadingMore, hasMore, search, onLoadMore }: {
  loadingMore: boolean;
  hasMore: boolean;
  search: string;
  onLoadMore: () => void;
}) {
  if (loadingMore) {
    return (
      <View style={footerStyles.wrap}>
        <ActivityIndicator size="small" color="#145a6c" />
        <Text style={footerStyles.text}>Memuat lebih banyak...</Text>
      </View>
    );
  }
  if (hasMore && !search) {
    return (
      <TouchableOpacity style={footerStyles.btn} onPress={onLoadMore}>
        <Text style={footerStyles.btnText}>Muat Lebih Banyak</Text>
      </TouchableOpacity>
    );
  }
  return null;
}

const footerStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  text: { fontSize: 13, color: '#70787c' },
  btn: { alignItems: 'center', paddingVertical: 14 },
  btnText: { fontSize: 13, fontWeight: '600', color: '#145a6c' },
});

export default function OpnameListScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { opnames, opnamesHasMore, isLoading, loadOpnames, loadMoreOpnames, createOpname, deleteOpname } = useStockStore();
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { loadOpnames(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadOpnames();
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (!opnamesHasMore || loadingMore || search) return;
    setLoadingMore(true);
    await loadMoreOpnames();
    setLoadingMore(false);
  };

  const handleNew = async () => {
    try {
      const id = await createOpname();
      router.push(`/(backoffice)/stock/opname/${id}` as any);
    } catch (err: any) {
      Alert.alert('Gagal', err.message);
    }
  };

  const handleDelete = (item: StockOpname) => {
    if (item.status !== 'draft') return;
    Alert.alert(
      'Hapus Sesi Opname',
      'Sesi opname ini akan dihapus permanen. Lanjutkan?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus', style: 'destructive',
          onPress: async () => {
            try { await deleteOpname(item.id); }
            catch (err: any) { Alert.alert('Gagal', err.message); }
          },
        },
      ],
    );
  };

  const filtered = opnames.filter(
    (s) =>
      (s.creator_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      fmtDate(s.created_at).toLowerCase().includes(search.toLowerCase()),
  );

  const totalOpname = opnames.length;
  const activeDrafts = opnames.filter((s) => s.status === 'draft').length;
  const awaitingApproval = opnames.filter((s) => s.status === 'submitted').length;
  const rejectedCount = opnames.filter((s) => s.status === 'rejected').length;

  const renderItem = ({ item }: { item: StockOpname }) => {
    const cfg = STATUS_CFG[item.status];
    const total = item.item_count ?? 0;
    const checked = item.checked_count ?? 0;
    const discrepancy = item.discrepancy_count ?? 0;
    const matched = checked - discrepancy;
    const progress = total > 0 ? checked / total : 0;
    const pct = Math.round(progress * 100);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push(`/(backoffice)/stock/opname/${item.id}` as any)}
        onLongPress={() => handleDelete(item)}
      >
        {/* Row atas: icon + info + badge */}
        <View style={styles.cardTop}>
          <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={22} color={cfg.color} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardDate}>{fmtDate(item.created_at)}</Text>
            <Text style={styles.cardCreator}>Oleh: {item.creator_name ?? '-'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {/* Progress bar */}
        {total > 0 && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
            </View>
            <Text style={styles.progressLabel}>{pct}% · {checked}/{total}</Text>
          </View>
        )}

        {/* 3 stat */}
        {total > 0 && (
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{checked}</Text>
              <Text style={styles.statLbl}>Dicek</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, discrepancy > 0 && { color: '#ba1a1a' }]}>{discrepancy}</Text>
              <Text style={styles.statLbl}>Selisih</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: '#145a6c' }]}>{matched}</Text>
              <Text style={styles.statLbl}>Cocok</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#191c1d" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>STOCK OPNAME</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, isTablet && styles.listContentTablet]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#145a6c']} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={<OpnameListFooter loadingMore={loadingMore} hasMore={opnamesHasMore} search={search} onLoadMore={handleLoadMore} />}
        ListHeaderComponent={
          <View style={isTablet ? styles.headerContentTablet : undefined}>
            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, styles.statCardWide]}>
                <Text style={styles.statLabel}>Total Opname</Text>
                <View style={styles.statRowHeader}>
                  <Text style={[styles.statNum, { color: '#145a6c' }]}>{totalOpname}</Text>
                  <Text style={styles.statUnit}>sesi</Text>
                </View>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Draft Aktif</Text>
                <View style={styles.statRowHeader}>
                  <Text style={[styles.statNum, { color: '#764900' }]}>{activeDrafts}</Text>
                  <Ionicons name="create" size={16} color="#764900" />
                </View>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Menunggu Review</Text>
                <View style={styles.statRowHeader}>
                  <Text style={[styles.statNum, { color: '#44636e' }]}>{awaitingApproval}</Text>
                  <Ionicons name="time-outline" size={16} color="#44636e" />
                </View>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Ditolak</Text>
                <View style={styles.statRowHeader}>
                  <Text style={[styles.statNum, { color: '#ba1a1a' }]}>{rejectedCount}</Text>
                  <Ionicons name="close-circle" size={16} color="#ba1a1a" />
                </View>
              </View>
            </View>

            {/* Search Bar */}
            <View style={styles.searchWrap}>
              <Ionicons name="filter" size={18} color="#70787c" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Filter berdasarkan pembuat atau tanggal..."
                placeholderTextColor="#70787c"
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <Text style={styles.sectionTitle}>Sesi Terbaru</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator size="large" color="#145a6c" />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="cube-outline" size={52} color="#bfc8cb" />
              <Text style={styles.emptyText}>Belum ada sesi opname</Text>
            </View>
          )
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={handleNew}
        activeOpacity={0.85}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Ionicons name="add" size={28} color="#fff" />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fb' },

  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, backgroundColor: '#f8f9fb',
    borderBottomWidth: 1, borderBottomColor: '#e1e3e4',
  },
  headerBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: {
    flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700',
    color: '#191c1d', letterSpacing: 1,
  },

  listContent: { padding: 16, paddingBottom: 100 },
  listContentTablet: { paddingHorizontal: 80 },
  headerContentTablet: { maxWidth: 800, alignSelf: 'center', width: '100%' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1, minWidth: 100, backgroundColor: '#ffffff',
    borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#bfc8cb',
  },
  statCardWide: { flexBasis: '100%' },
  statLabel: { fontSize: 11, fontWeight: '700', color: '#40484b', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  statRowHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  statNum: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  statUnit: { fontSize: 13, color: '#70787c' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#eceeef', borderRadius: 8,
    paddingHorizontal: 12, marginBottom: 16, height: 48,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#191c1d' },

  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#191c1d', marginBottom: 8 },

  card: {
    backgroundColor: '#ffffff', borderRadius: 8, padding: 14,
    borderWidth: 1, borderColor: '#bfc8cb', marginBottom: 8, gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardDate: { fontSize: 15, fontWeight: '600', color: '#191c1d' },
  cardCreator: { fontSize: 12, color: '#70787c', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, height: 6, backgroundColor: '#eceeef', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: '#145a6c', borderRadius: 3 },
  progressLabel: { fontSize: 11, fontWeight: '700', color: '#145a6c', minWidth: 72, textAlign: 'right' },

  statRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 16, fontWeight: '700', color: '#191c1d' },
  statLbl: { fontSize: 10, color: '#70787c', fontWeight: '600', letterSpacing: 0.3, marginTop: 1 },
  statDivider: { width: 1, height: 28, backgroundColor: '#e1e3e4' },

  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: '#70787c', fontWeight: '500' },

  fab: {
    position: 'absolute', right: 20, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#FF9800',
    justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6,
  },
});
