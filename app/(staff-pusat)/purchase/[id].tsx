/**
 * Purchase Order Detail Screen — Staff Pusat
 * Menggunakan getPurchaseOrderDetail dan receivePurchaseOrder dari warehouseQueries
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import {
  getPurchaseOrderDetail,
  receivePurchaseOrder,
  deletePurchaseOrder,
  fmtCurrency,
  type PurchaseOrderHeader,
  type PurchaseOrderItemRow,
} from '@/lib/warehouseQueries';

const STATUS_CFG = {
  draft: { label: 'Draft', color: '#F59E0B', bg: '#FFFBEB', icon: 'document' },
  received: { label: 'Diterima', color: '#22C55E', bg: '#F0FDF4', icon: 'checkmark-circle' },
} as const;

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function StaffPurchaseDetailScreen() {
  const { id, fromProduct } = useLocalSearchParams<{ id: string; fromProduct?: string }>();
  const handleBack = () => fromProduct ? router.push(`/(staff-pusat)/products/${fromProduct}` as any) : router.back();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [header, setHeader] = useState<PurchaseOrderHeader | null>(null);
  const [items, setItems] = useState<PurchaseOrderItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPurchaseOrderDetail(id!);
      setHeader(result.header);
      setItems(result.items);
    } catch (err: any) {
      Alert.alert('Gagal memuat', err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleReceive = () => {
    Alert.alert(
      'Tandai Diterima',
      'Stok semua produk dalam pembelian ini akan otomatis diperbarui di gudang. Lanjutkan?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Diterima',
          onPress: async () => {
            setActing(true);
            try {
              await receivePurchaseOrder(id!);
              Alert.alert('Berhasil', 'Pembelian berhasil ditandai diterima dan stok gudang telah diperbarui.', [
                { text: 'OK', onPress: fetchDetail },
              ]);
            } catch (err: any) {
              Alert.alert('Gagal', err.message);
            } finally {
              setActing(false);
            }
          },
        },
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
            setActing(true);
            try {
              await deletePurchaseOrder(id!);
              router.back();
            } catch (err: any) {
              Alert.alert('Gagal', err.message);
              setActing(false);
            }
          },
        },
      ]
    );
  };

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#347385" />
      </View>
    );
  }

  // Not found
  if (!header) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="document-outline" size={48} color="#CBD5E0" />
        <Text style={styles.errorText}>Catatan pembelian tidak ditemukan</Text>
        <TouchableOpacity style={styles.backBtnAction} onPress={handleBack}>
          <Text style={styles.backBtnActionText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cfg = STATUS_CFG[header.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.draft;
  const isDraft = header.status === 'draft';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detail Pembelian</Text>
        <View style={styles.headerBtn} />
      </View>

      <TabletCenteredView maxWidth={800}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            isDraft && { paddingBottom: insets.bottom + 90 },
            !isDraft && { paddingBottom: insets.bottom + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Info Card */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Informasi Pesanan</Text>
              <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
                <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tanggal Dibuat</Text>
              <Text style={styles.infoValue}>{fmtDate(header.created_at)}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier</Text>
              <View style={styles.infoValueWrap}>
                <Text style={styles.supplierName}>{header.supplier_name}</Text>
                {header.supplier_phone ? (
                  <Text style={styles.supplierPhone}>{header.supplier_phone}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Dibuat Oleh</Text>
              <Text style={styles.infoValue}>{header.created_by_name}</Text>
            </View>

            {header.notes ? (
              <View style={[styles.infoRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <Text style={styles.infoLabel}>Catatan</Text>
                <Text style={styles.notesText}>{header.notes}</Text>
              </View>
            ) : null}
          </View>

          {/* Items Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              Daftar Produk ({header.total_items} produk)
            </Text>

            <View style={styles.itemsList}>
              {items.map((item, idx) => (
                <View
                  key={item.id}
                  style={[
                    styles.itemRow,
                    idx === items.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
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
              <Text style={styles.totalAmount}>{fmtCurrency(header.total_amount)}</Text>
            </View>
          </View>

          {/* Status card for received */}
          {!isDraft ? (
            <View style={[styles.card, styles.receivedCard]}>
              <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
              <Text style={styles.receivedText}>
                Pembelian ini telah diterima dan stok gudang sudah diperbarui.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </TabletCenteredView>

      {/* Footer Actions — hanya untuk draft */}
      {isDraft ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 },
            isTablet && styles.footerTablet,
          ]}
        >
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={acting}
          >
            {acting ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.receiveBtn, acting && styles.btnDisabled]}
            onPress={handleReceive}
            disabled={acting}
          >
            {acting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.receiveBtnText}>Tandai Diterima</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 20 },

  errorText: { fontSize: 16, color: '#4A5568', marginTop: 12, marginBottom: 20 },
  backBtnAction: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
  },
  backBtnActionText: { color: '#1A202C', fontWeight: '600' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A202C',
    textAlign: 'center',
  },

  content: { padding: 16, gap: 16 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 12,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: { fontSize: 13, fontWeight: '600' },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F7FAFC',
  },
  infoLabel: { fontSize: 13, color: '#718096', width: 120 },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: '#1A202C',
    fontWeight: '500',
    textAlign: 'right',
  },
  infoValueWrap: { flex: 1, alignItems: 'flex-end' },
  supplierName: { fontSize: 15, fontWeight: 'bold', color: '#1A202C', textAlign: 'right' },
  supplierPhone: { fontSize: 13, color: '#718096', textAlign: 'right', marginTop: 2 },
  notesText: {
    flex: 1,
    fontSize: 14,
    color: '#4A5568',
    textAlign: 'right',
    fontStyle: 'italic',
  },

  itemsList: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 8,
    marginBottom: 12,
    gap: 0,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F7FAFC',
  },
  itemInfo: { flex: 1, paddingRight: 12 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#1A202C', marginBottom: 4 },
  itemMeta: { fontSize: 13, color: '#718096' },
  itemSubtotal: { fontSize: 15, fontWeight: '700', color: '#1A202C' },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  totalLabel: { fontSize: 15, fontWeight: 'bold', color: '#1A202C' },
  totalAmount: { fontSize: 18, fontWeight: 'bold', color: '#22C55E' },

  receivedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  receivedText: { flex: 1, fontSize: 14, color: '#15803D', fontWeight: '500' },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  footerTablet: {
    paddingHorizontal: 32,
  },
  deleteBtn: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  receiveBtn: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#22C55E',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  receiveBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  btnDisabled: { opacity: 0.5 },
});
