/**
 * StockHistorySheet
 * Bottom sheet to show stock movement history for a product
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStockStore, type StockMovement } from '@/store/stockStore';
import { useProductStore } from '@/store/productStore';

interface Props {
  productId: string | null;
  visible: boolean;
  onClose: () => void;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string; sign: '+' | '-' }> = {
  sale:           { label: 'Penjualan',         color: '#EF4444', icon: 'cart',               sign: '-' },
  purchase:       { label: 'Pembelian',          color: '#22C55E', icon: 'bag-add',            sign: '+' },
  adjustment_in:  { label: 'Penyesuaian (+)',    color: '#22C55E', icon: 'add-circle',         sign: '+' },
  adjustment_out: { label: 'Penyesuaian (-)',    color: '#F59E0B', icon: 'remove-circle',      sign: '-' },
  opname:         { label: 'Stok Opname',        color: '#347385', icon: 'clipboard',          sign: '+' },
  void:           { label: 'Void',               color: '#A0AEC0', icon: 'close-circle',       sign: '-' },
};

export function StockHistorySheet({ productId, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { movements, loadMovements, isLoading } = useStockStore();
  const { products } = useProductStore();

  const product = products.find(p => p.id === productId);
  const productMovements = movements.filter(m => m.product_id === productId);

  useEffect(() => {
    if (visible && productId) {
      loadMovements(productId);
    }
  }, [visible, productId]);

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const renderItem = ({ item, index }: { item: StockMovement; index: number }) => {
    const cfg = TYPE_CONFIG[item.type] || {
      label: item.type, color: '#718096', icon: 'ellipse', sign: '+' as const,
    };
    const isPositive = cfg.sign === '+';
    const diff = item.qty_after - item.qty_before;
    const absDiff = Math.abs(diff);

    return (
      <View style={styles.timelineItem}>
        {/* Timeline line */}
        <View style={styles.timelineLeft}>
          <View style={[styles.timelineDot, { backgroundColor: cfg.color }]}>
            <Ionicons name={cfg.icon as any} size={12} color="#fff" />
          </View>
          {index < productMovements.length - 1 && <View style={styles.timelineLine} />}
        </View>

        {/* Content */}
        <View style={styles.timelineContent}>
          <View style={styles.timelineHeader}>
            <Text style={styles.movementType}>{cfg.label}</Text>
            <Text style={[styles.movementQty, { color: isPositive ? '#22C55E' : '#EF4444' }]}>
              {isPositive ? '+' : '-'}{absDiff}
            </Text>
          </View>
          <View style={styles.timelineMeta}>
            <Text style={styles.metaDate}>{formatDate(item.created_at)}</Text>
            {item.qty_after !== undefined && (
              <Text style={styles.metaStock}>Stok: {item.qty_after}</Text>
            )}
          </View>
          {item.reason ? (
            <Text style={styles.movementReason} numberOfLines={2}>{item.reason}</Text>
          ) : null}
          {item.user_name ? (
            <Text style={styles.movementBy}>Oleh: {item.user_name}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.productInfo}>
              <View style={styles.productAvatar}>
                <Text style={styles.productAvatarText}>
                  {product?.name.substring(0, 2).toUpperCase() || '??'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.productName} numberOfLines={1}>
                  {product?.name || 'Produk'}
                </Text>
                <Text style={styles.productStock}>
                  Stok saat ini:{' '}
                  <Text style={{ fontWeight: '700', color: '#1A202C' }}>
                    {product?.stock ?? '-'}
                  </Text>{' '}
                  {product?.unit || 'pcs'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#718096" />
            </TouchableOpacity>
          </View>

          <Text style={styles.sheetSubtitle}>Riwayat Mutasi Stok</Text>

          {/* Content */}
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#347385" />
            </View>
          ) : productMovements.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="time-outline" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>Belum ada mutasi stok</Text>
            </View>
          ) : (
            <FlatList
              data={productMovements}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.timelineList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingTop: 12,
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#E2E8F0',
    borderRadius: 2, alignSelf: 'center', marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#F7FAFC', gap: 12,
  },
  productInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  productAvatar: {
    width: 46, height: 46, borderRadius: 12, backgroundColor: '#EEF8FA',
    justifyContent: 'center', alignItems: 'center',
  },
  productAvatarText: { fontSize: 15, fontWeight: 'bold', color: '#347385' },
  productName: { fontSize: 15, fontWeight: '700', color: '#1A202C' },
  productStock: { fontSize: 12, color: '#718096', marginTop: 2 },
  closeBtn: { padding: 6 },

  sheetSubtitle: {
    fontSize: 12, fontWeight: '600', color: '#A0AEC0',
    paddingHorizontal: 16, paddingVertical: 10, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  timelineList: { paddingHorizontal: 16, paddingBottom: 8 },

  timelineItem: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  timelineLeft: { alignItems: 'center', width: 28 },
  timelineDot: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#E2E8F0', marginVertical: 2 },

  timelineContent: {
    flex: 1, paddingBottom: 14, paddingTop: 2, gap: 2,
  },
  timelineHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  movementType: { fontSize: 14, fontWeight: '600', color: '#1A202C' },
  movementQty: { fontSize: 16, fontWeight: 'bold' },
  timelineMeta: { flexDirection: 'row', gap: 10 },
  metaDate: { fontSize: 11, color: '#A0AEC0' },
  metaStock: { fontSize: 11, color: '#347385', fontWeight: '600' },
  movementReason: { fontSize: 12, color: '#718096', fontStyle: 'italic' },
  movementBy: { fontSize: 11, color: '#A0AEC0' },

  centered: {
    height: 200, justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  emptyText: { fontSize: 14, color: '#A0AEC0' },
});
