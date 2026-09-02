import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, KeyboardAvoidingView,
  Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { processRefund, type RefundItem } from '@/lib/refundQueries';
import { formatCurrency } from '@/constants/config';

interface TxItem {
  product_id: string | null;
  product_name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface TxMeta {
  invoice_number: string;
  total: number;
  status: string;
}

export default function RefundScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [tx, setTx] = useState<TxMeta | null>(null);
  const [items, setItems] = useState<TxItem[]>([]);
  const [refundQtys, setRefundQtys] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: txData, error: txErr } = await supabase
        .from('transactions')
        .select('invoice_number, total, status')
        .eq('id', id)
        .single();
      if (txErr || !txData) return;
      setTx(txData);

      const { data: itemsData } = await supabase
        .from('transaction_items')
        .select('product_id, product_name, quantity, price, subtotal')
        .eq('transaction_id', id)
        .order('created_at', { ascending: true });

      const txItems = itemsData ?? [];
      setItems(txItems);
      const initial: Record<number, number> = {};
      txItems.forEach((_, i) => { initial[i] = 0; });
      setRefundQtys(initial);
    } catch (e) {
      console.error('[Refund] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setQty = (idx: number, val: number, max: number) => {
    setRefundQtys((prev) => ({ ...prev, [idx]: Math.min(Math.max(0, val), max) }));
  };

  const selectedItems: RefundItem[] = items
    .map((item, idx) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: refundQtys[idx] ?? 0,
      price: item.price,
      subtotal: (refundQtys[idx] ?? 0) * item.price,
      max_quantity: item.quantity,
    }))
    .filter((i) => i.quantity > 0);

  const totalRefund = selectedItems.reduce((s, i) => s + i.subtotal, 0);

  const handleSubmit = async () => {
    if (!tx || !id) return;
    if (selectedItems.length === 0) {
      Alert.alert('Perhatian', 'Pilih minimal 1 item yang akan di-refund');
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Perhatian', 'Alasan refund wajib diisi');
      return;
    }

    Alert.alert(
      'Konfirmasi Refund',
      `Refund ${selectedItems.length} item senilai ${formatCurrency(totalRefund)} dari transaksi ${tx.invoice_number}?\n\nStok akan dikembalikan secara otomatis.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Proses Refund',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              const result = await processRefund({
                originalTransactionId: id,
                originalInvoice: tx.invoice_number,
                items: selectedItems,
                reason: reason.trim(),
              });
              Alert.alert(
                'Refund Berhasil',
                `No. Refund: ${result.refundInvoice}\nTotal dikembalikan: ${formatCurrency(result.totalRefund)}`,
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (e: any) {
              Alert.alert('Gagal', e.message ?? 'Terjadi kesalahan');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const containerWidth = isTablet ? Math.min(width * 0.75, 600) : width;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Return / Refund</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#56B2C1" />
        </View>
      </View>
    );
  }

  if (!tx) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Return / Refund</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Transaksi tidak ditemukan</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Return / Refund</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 100, alignSelf: 'center', width: containerWidth },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>No. Transaksi</Text>
              <Text style={styles.infoValue}>{tx.invoice_number}</Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Total Transaksi</Text>
              <Text style={[styles.infoValue, { color: '#347385' }]}>{formatCurrency(tx.total)}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Pilih Item yang Dikembalikan</Text>
          <View style={styles.itemsCard}>
            {items.map((item, idx) => {
              const qty = refundQtys[idx] ?? 0;
              const isSelected = qty > 0;
              return (
                <View key={idx} style={[styles.itemRow, idx < items.length - 1 && styles.itemDivider]}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.product_name}</Text>
                    <Text style={styles.itemMeta}>
                      {formatCurrency(item.price)} × {item.quantity} = {formatCurrency(item.subtotal)}
                    </Text>
                    {isSelected && (
                      <Text style={styles.itemRefundAmount}>
                        Refund: {formatCurrency(qty * item.price)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.qtyControl}>
                    <TouchableOpacity
                      style={[styles.qtyBtn, qty === 0 && styles.qtyBtnDisabled]}
                      onPress={() => setQty(idx, qty - 1, item.quantity)}
                      disabled={qty === 0}
                    >
                      <Ionicons name="remove" size={16} color={qty === 0 ? '#D1D5DB' : '#374151'} />
                    </TouchableOpacity>
                    <Text style={[styles.qtyText, isSelected && { color: '#DC2626', fontWeight: '800' }]}>
                      {qty}
                    </Text>
                    <TouchableOpacity
                      style={[styles.qtyBtn, qty >= item.quantity && styles.qtyBtnDisabled]}
                      onPress={() => setQty(idx, qty + 1, item.quantity)}
                      disabled={qty >= item.quantity}
                    >
                      <Ionicons name="add" size={16} color={qty >= item.quantity ? '#D1D5DB' : '#374151'} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Alasan Refund</Text>
          <TextInput
            style={styles.reasonInput}
            value={reason}
            onChangeText={setReason}
            placeholder="Contoh: Barang rusak, salah pesan, dll."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {selectedItems.length > 0 && (
            <View style={styles.summaryCard}>
              <View style={styles.infoRow}>
                <Text style={styles.summaryLabel}>Item dipilih</Text>
                <Text style={styles.summaryValue}>{selectedItems.length} jenis</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.summaryLabel}>Total Refund</Text>
                <Text style={[styles.summaryValue, { color: '#DC2626', fontSize: 18 }]}>
                  {formatCurrency(totalRefund)}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.submitBtn, (selectedItems.length === 0 || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={selectedItems.length === 0 || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="return-up-back-outline" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>
                  Proses Refund {selectedItems.length > 0 ? `(${formatCurrency(totalRefund)})` : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#9CA3AF' },

  scroll: { padding: 16, gap: 12 },

  infoCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  infoDivider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 4 },
  infoLabel: { fontSize: 13, color: '#6B7280' },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#111827' },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 4 },

  itemsCard: {
    backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  itemDivider: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  itemMeta: { fontSize: 12, color: '#9CA3AF' },
  itemRefundAmount: { fontSize: 12, fontWeight: '700', color: '#DC2626', marginTop: 2 },

  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 30, height: 30, borderRadius: 8, borderWidth: 1.5,
    borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  qtyBtnDisabled: { borderColor: '#F3F4F6', backgroundColor: '#FAFAFA' },
  qtyText: { fontSize: 15, fontWeight: '700', color: '#374151', minWidth: 24, textAlign: 'center' },

  reasonInput: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#E5E7EB', padding: 14, fontSize: 14, color: '#111827',
    minHeight: 90, textAlignVertical: 'top',
  },

  summaryCard: {
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#FECACA',
  },
  summaryLabel: { fontSize: 13, color: '#6B7280' },
  summaryValue: { fontSize: 14, fontWeight: '700', color: '#111827' },

  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  submitBtn: {
    backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitBtnDisabled: { backgroundColor: '#D1D5DB' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
