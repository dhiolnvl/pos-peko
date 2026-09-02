import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStockStore, type PurchaseOrder, type PurchaseOrderItem } from '@/store/stockStore';

const STATUS_CFG = {
  draft: { label: 'Draft', color: '#F59E0B', bg: '#FFFBEB', icon: 'document' },
  received: { label: 'Diterima', color: '#22C55E', bg: '#F0FDF4', icon: 'checkmark-circle' },
};

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { loadPODetail, receivePO, deletePO, isLoading } = useStockStore();
  
  const [po, setPo] = useState<(PurchaseOrder & { items: PurchaseOrderItem[], creator_name?: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = async () => {
    setLoading(true);
    const data = await loadPODetail(id!);
    setPo(data as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const fmtCurrency = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

  const handleReceive = () => {
    Alert.alert(
      'Tandai Diterima',
      'Stok semua produk dalam pembelian ini akan otomatis diperbarui dan dicatat di mutasi stok. Lanjutkan?',
      [
        { text: 'Batal', style: 'cancel' },
        { 
          text: 'Diterima', 
          onPress: async () => {
            try {
              await receivePO(id!);
              Alert.alert('Berhasil', 'Pembelian berhasil ditandai diterima dan stok telah diupdate.');
              await fetchDetail(); // refresh data
            } catch (err: any) {
              Alert.alert('Gagal', err.message);
            }
          }
        }
      ]
    );
  };

  const handleDelete = () => {
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
              await deletePO(id!);
              router.back();
            } catch (err: any) {
              Alert.alert('Gagal', err.message);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#22C55E" />
      </View>
    );
  }

  if (!po) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="document-outline" size={48} color="#CBD5E0" />
        <Text style={styles.errorText}>Catatan pembelian tidak ditemukan</Text>
        <TouchableOpacity style={styles.backBtnAction} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cfg = STATUS_CFG[po.status as keyof typeof STATUS_CFG] || STATUS_CFG.draft;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detail Pembelian</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Info Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Informasi Pesanan</Text>
            <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tanggal Dibuat</Text>
            <Text style={styles.infoValue}>{fmtDate(po.created_at)}</Text>
          </View>
          
          {po.received_at && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tanggal Diterima</Text>
              <Text style={styles.infoValue}>{fmtDate(po.received_at)}</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Supplier</Text>
            <View>
              <Text style={styles.supplierName}>{po.supplier_name}</Text>
              {po.supplier_phone && <Text style={styles.supplierPhone}>{po.supplier_phone}</Text>}
            </View>
          </View>

          {po.creator_name && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Dibuat Oleh</Text>
              <Text style={styles.infoValue}>{po.creator_name}</Text>
            </View>
          )}

          {po.notes ? (
            <View style={[styles.infoRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
              <Text style={styles.infoLabel}>Catatan</Text>
              <Text style={styles.notesText}>{po.notes}</Text>
            </View>
          ) : null}
        </View>

        {/* Items Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Daftar Produk ({po.total_items} item)</Text>
          
          <View style={styles.itemsList}>
            {po.items.map((item, idx) => (
              <View key={item.id} style={[styles.itemRow, idx === po.items.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.product_name}</Text>
                  <Text style={styles.itemMeta}>
                    {item.quantity} x {fmtCurrency(item.cost_price)}
                  </Text>
                </View>
                <Text style={styles.itemSubtotal}>{fmtCurrency(item.subtotal)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Pembelian</Text>
            <Text style={styles.totalAmount}>{fmtCurrency(po.total_amount)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer Actions */}
      {po.status === 'draft' && (
        <View style={[styles.footer, { paddingBottom: insets.bottom || 16 }]}>
          <TouchableOpacity 
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={isLoading}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.receiveBtn}
            onPress={handleReceive}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.receiveBtnText}>Tandai Diterima</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 16, color: '#4A5568', marginTop: 12, marginBottom: 20 },
  backBtnAction: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#E2E8F0', borderRadius: 8 },
  backBtnText: { color: '#1A202C', fontWeight: '600' },
  
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  headerBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#1A202C', textAlign: 'center' },
  
  content: { padding: 16, gap: 16, paddingBottom: 100 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1A202C', marginBottom: 16 },
  
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  statusText: { fontSize: 13, fontWeight: '600' },
  
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F7FAFC',
  },
  infoLabel: { fontSize: 13, color: '#718096', width: 120 },
  infoValue: { flex: 1, fontSize: 14, color: '#1A202C', fontWeight: '500', textAlign: 'right' },
  
  supplierName: { fontSize: 15, fontWeight: 'bold', color: '#1A202C', textAlign: 'right' },
  supplierPhone: { fontSize: 13, color: '#718096', textAlign: 'right', marginTop: 2 },
  notesText: { flex: 1, fontSize: 14, color: '#4A5568', textAlign: 'right', fontStyle: 'italic' },
  
  itemsList: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 8, marginBottom: 12 },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F7FAFC',
  },
  itemInfo: { flex: 1, paddingRight: 12 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#1A202C', marginBottom: 4 },
  itemMeta: { fontSize: 13, color: '#718096' },
  itemSubtotal: { fontSize: 15, fontWeight: '700', color: '#1A202C' },
  
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 15, fontWeight: 'bold', color: '#1A202C' },
  totalAmount: { fontSize: 18, fontWeight: 'bold', color: '#22C55E' },
  
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0',
    flexDirection: 'row', padding: 16, gap: 12,
  },
  deleteBtn: {
    width: 50, height: 50, borderRadius: 10, backgroundColor: '#FEF2F2',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA'
  },
  receiveBtn: {
    flex: 1, height: 50, borderRadius: 10, backgroundColor: '#22C55E',
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  receiveBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
