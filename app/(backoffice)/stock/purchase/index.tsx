/**
 * Purchase Order List Screen
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStockStore, type PurchaseOrder } from '@/store/stockStore';
import { TabletCenteredView } from '@/components/TabletCenteredView';

const STATUS_CFG = {
  draft: { label: 'Draft', color: '#F59E0B', bg: '#FFFBEB', icon: 'document' },
  received: { label: 'Diterima', color: '#22C55E', bg: '#F0FDF4', icon: 'checkmark-circle' },
};

export default function PurchaseListScreen() {
  const insets = useSafeAreaInsets();
  const { purchaseOrders, isLoading, loadPurchaseOrders, deletePO } = useStockStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadPurchaseOrders();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPurchaseOrders();
    setRefreshing(false);
  };

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

  const fmtCurrency = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

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
              await deletePO(id);
            } catch (err: any) {
              Alert.alert('Gagal', err.message);
            }
          }
        }
      ]
    );
  };

  const totalValue = purchaseOrders.reduce((s, p) => s + p.total_amount, 0);

  const renderItem = ({ item }: { item: PurchaseOrder }) => {
    const cfg = STATUS_CFG[item.status];
    return (
      <TouchableOpacity 
        style={styles.card} 
        activeOpacity={0.7}
        onPress={() => router.push(`/(backoffice)/stock/purchase/${item.id}` as any)}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon as any} size={13} color={cfg.color} />
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.cardDate}>{fmtDate(item.created_at)}</Text>
            {item.status === 'draft' && (
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Text style={styles.supplierName}>{item.supplier_name}</Text>
        {item.supplier_phone ? (
          <Text style={styles.supplierPhone}>{item.supplier_phone}</Text>
        ) : null}
        <View style={styles.cardFooter}>
          <Text style={styles.itemCount}>{item.total_items} item</Text>
          <Text style={styles.totalAmount}>{fmtCurrency(item.total_amount)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pencatatan Pembelian</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* All content below header consistently centered on tablet */}
      <TabletCenteredView maxWidth={800}>
        <View style={[styles.statsRow, { maxWidth: 800 }]}>
          <View style={[styles.statBox, { backgroundColor: '#FFFBEB' }]}>
            <Text style={[styles.statNum, { color: '#F59E0B' }]}>
              {purchaseOrders.filter(p => p.status === 'draft').length}
            </Text>
            <Text style={[styles.statLbl, { color: '#F59E0B' }]}>Draft</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#F0FDF4' }]}>
            <Text style={[styles.statNum, { color: '#22C55E' }]}>
              {purchaseOrders.filter(p => p.status === 'received').length}
            </Text>
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

        {isLoading && purchaseOrders.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#22C55E" />
          </View>
        ) : (
          <FlatList
            data={purchaseOrders}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#22C55E']} />
            }
            ListEmptyComponent={
              <View style={styles.centered}>
                <Ionicons name="cart-outline" size={56} color="#CBD5E0" />
                <Text style={styles.emptyText}>Belum ada pembelian</Text>
              </View>
            }
          />
        )}
      </TabletCenteredView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(backoffice)/stock/purchase/new' as any)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#1A202C', textAlign: 'center' },
  statsRow: { flexDirection: 'row', padding: 16, gap: 10 },
  statBox: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 20, fontWeight: 'bold' },
  statLbl: { fontSize: 11, fontWeight: '500' },
  listContent: { padding: 16, gap: 10, paddingBottom: 90 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E2E8F0', gap: 6,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardDate: { fontSize: 12, color: '#718096' },
  deleteBtn: { padding: 4, backgroundColor: '#FEF2F2', borderRadius: 6 },
  supplierName: { fontSize: 16, fontWeight: '700', color: '#1A202C' },
  supplierPhone: { fontSize: 13, color: '#718096' },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F7FAFC',
  },
  itemCount: { fontSize: 13, color: '#718096' },
  totalAmount: { fontSize: 16, fontWeight: '700', color: '#22C55E' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 10 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#4A5568' },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#22C55E', justifyContent: 'center', alignItems: 'center',
    elevation: 5, shadowColor: '#22C55E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8,
  },
});
