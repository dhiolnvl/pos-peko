/**
 * Purchase Order List Screen — Staff Pusat
 * Data bersumber dari warehouse pertama yang aktif (getWarehouses)
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import {
  getWarehouses,
  getPurchaseOrders,
  deletePurchaseOrder,
  fmtCurrency,
  type PurchaseOrderHeader,
} from '@/lib/warehouseQueries';
import type { Warehouse } from '@/types';

const STATUS_CFG = {
  draft: { label: 'Draft', color: '#F59E0B', bg: '#FFFBEB', icon: 'document' },
  received: { label: 'Diterima', color: '#22C55E', bg: '#F0FDF4', icon: 'checkmark-circle' },
} as const;

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

export default function StaffPurchaseListScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [orders, setOrders] = useState<PurchaseOrderHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const warehouses = await getWarehouses();
      const wh = warehouses[0] ?? null;
      setWarehouse(wh);
      if (wh) {
        const data = await getPurchaseOrders(wh.id);
        setOrders(data);
      }
    } catch (err: any) {
      Alert.alert('Gagal memuat data', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Hapus Catatan',
      'Apakah Anda yakin ingin menghapus catatan pembelian ini? Aksi ini tidak dapat dibatalkan.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePurchaseOrder(id);
              setOrders(prev => prev.filter(o => o.id !== id));
            } catch (err: any) {
              Alert.alert('Gagal', err.message);
            }
          },
        },
      ]
    );
  };

  const totalValue = orders.reduce((s, o) => s + o.total_amount, 0);
  const draftCount = orders.filter(o => o.status === 'draft').length;
  const receivedCount = orders.filter(o => o.status === 'received').length;

  const renderItem = ({ item }: { item: PurchaseOrderHeader }) => {
    const cfg = STATUS_CFG[item.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.draft;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push(`/(staff-pusat)/purchase/${item.id}` as any)}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon as any} size={13} color={cfg.color} />
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.cardDate}>{fmtDate(item.created_at)}</Text>
            {item.status === 'draft' && (
              <TouchableOpacity
                onPress={() => handleDelete(item.id)}
                style={styles.deleteBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={styles.supplierName}>{item.supplier_name}</Text>
        {item.supplier_phone ? (
          <Text style={styles.supplierPhone}>{item.supplier_phone}</Text>
        ) : null}

        <View style={styles.cardMeta}>
          <Text style={styles.createdBy}>Oleh: {item.created_by_name}</Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.itemCount}>{item.total_items} item</Text>
          <Text style={styles.totalAmount}>{fmtCurrency(item.total_amount)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A202C" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Pencatatan Pembelian Gudang</Text>
          {warehouse ? (
            <Text style={styles.headerSubtitle}>{warehouse.name}</Text>
          ) : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <TabletCenteredView maxWidth={800}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: '#FFFBEB' }]}>
            <Text style={[styles.statNum, { color: '#F59E0B' }]}>{draftCount}</Text>
            <Text style={[styles.statLbl, { color: '#F59E0B' }]}>Draft</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#F0FDF4' }]}>
            <Text style={[styles.statNum, { color: '#22C55E' }]}>{receivedCount}</Text>
            <Text style={[styles.statLbl, { color: '#22C55E' }]}>Diterima</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#EEF8FA' }]}>
            <Text style={[styles.statNum, { color: '#347385' }]} numberOfLines={1}>
              {totalValue >= 1_000_000
                ? `${(totalValue / 1_000_000).toFixed(1)}jt`
                : `${(totalValue / 1_000).toFixed(0)}rb`}
            </Text>
            <Text style={[styles.statLbl, { color: '#347385' }]}>Total</Text>
          </View>
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#347385" />
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={['#347385']}
                tintColor="#347385"
              />
            }
            ListEmptyComponent={
              <View style={styles.centered}>
                <Ionicons name="cart-outline" size={56} color="#CBD5E0" />
                <Text style={styles.emptyTitle}>Belum ada pembelian</Text>
                <Text style={styles.emptySubtitle}>Tekan tombol + untuk mencatat pembelian baru</Text>
              </View>
            }
          />
        )}
      </TabletCenteredView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, isTablet && styles.fabTablet]}
        onPress={() => router.push('/(staff-pusat)/purchase/new' as any)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTextWrap: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1A202C',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#347385',
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },

  statsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
  },
  statBox: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statNum: { fontSize: 20, fontWeight: 'bold' },
  statLbl: { fontSize: 11, fontWeight: '500' },

  listContent: { padding: 16, gap: 10, paddingBottom: 100 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardDate: { fontSize: 12, color: '#718096' },
  deleteBtn: {
    padding: 4,
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
  },

  supplierName: { fontSize: 16, fontWeight: '700', color: '#1A202C' },
  supplierPhone: { fontSize: 13, color: '#718096' },
  cardMeta: { marginTop: 2 },
  createdBy: { fontSize: 12, color: '#A0AEC0' },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F7FAFC',
  },
  itemCount: { fontSize: 13, color: '#718096' },
  totalAmount: { fontSize: 16, fontWeight: '700', color: '#22C55E' },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 10,
    minHeight: 300,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#4A5568' },
  emptySubtitle: { fontSize: 13, color: '#A0AEC0', textAlign: 'center' },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#347385',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#347385',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabTablet: {
    right: 32,
    bottom: 32,
    width: 60,
    height: 60,
    borderRadius: 30,
  },
});
