/**
 * Detail Transfer Masuk — Staff Cabang
 * Input qty diterima per produk saat konfirmasi
 */

import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, useWindowDimensions,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { TabletCenteredView } from '@/components/TabletCenteredView';

interface TransferItem {
  id: string;
  product_id: string;
  quantity: number;
  quantity_received: number | null;
  product_name: string;
  product_unit: string | null;
}

interface TransferHeader {
  id: string;
  status: string;
  notes: string | null;
  sent_at: string | null;
  received_at: string | null;
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
    <View style={[st.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[st.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

export default function IncomingTransferDetailScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { id } = useLocalSearchParams<{ id: string }>();

  const [header, setHeader] = useState<TransferHeader | null>(null);
  const [items, setItems] = useState<TransferItem[]>([]);
  const [receivedQtys, setReceivedQtys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('stock_transfers')
        .select(`
          id, status, notes, sent_at, received_at,
          stock_transfer_items (
            id, product_id, quantity, quantity_received,
            products ( name, unit )
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      setHeader({
        id: data.id, status: data.status, notes: data.notes,
        sent_at: data.sent_at, received_at: data.received_at,
      });

      const mapped: TransferItem[] = (data.stock_transfer_items ?? []).map((i: any) => ({
        id: i.id,
        product_id: i.product_id,
        quantity: i.quantity,
        quantity_received: i.quantity_received,
        product_name: i.products?.name ?? '-',
        product_unit: i.products?.unit ?? null,
      }));
      setItems(mapped);

      // Init qty diterima = qty dikirim (default sama)
      const init: Record<string, string> = {};
      mapped.forEach((i) => { init[i.product_id] = String(i.quantity); });
      setReceivedQtys(init);
    } catch (e: any) {
      Alert.alert('Gagal memuat detail', e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const totalDikirim = items.reduce((s, i) => s + i.quantity, 0);
  const totalDiterima = items.reduce((s, i) => s + (parseInt(receivedQtys[i.product_id] ?? '0') || 0), 0);
  const totalSelisih = totalDikirim - totalDiterima;

  const handleConfirm = async () => {
    if (!header) return;

    // Validasi tidak ada qty diterima > qty dikirim
    const invalid = items.find((i) => {
      const qty = parseInt(receivedQtys[i.product_id] ?? '0') || 0;
      return qty > i.quantity;
    });
    if (invalid) {
      Alert.alert('Periksa Kembali', `Qty diterima produk "${invalid.product_name}" melebihi qty yang dikirim (${invalid.quantity}).`);
      return;
    }

    const selisihItems = items.filter((i) => {
      const qty = parseInt(receivedQtys[i.product_id] ?? '0') || 0;
      return qty < i.quantity;
    });

    const confirmMsg = selisihItems.length > 0
      ? `Total diterima: ${totalDiterima} unit\nSelisih: ${totalSelisih} unit hilang saat pengiriman\n\nSelisih akan dicatat sebagai kehilangan. Lanjutkan?`
      : `Semua ${totalDikirim} unit diterima lengkap. Konfirmasi?`;

    Alert.alert('Konfirmasi Terima Barang', confirmMsg, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Konfirmasi',
        onPress: async () => {
          setConfirming(true);
          try {
            const receivedItems = items.map((i) => ({
              product_id: i.product_id,
              quantity_received: parseInt(receivedQtys[i.product_id] ?? '0') || 0,
            }));

            const { error } = await supabase.rpc('receive_stock_transfer', {
              p_transfer_id: header.id,
              p_received_items: receivedItems,
            });
            if (error) throw error;

            const successMsg = selisihItems.length > 0
              ? `Stok cabang bertambah ${totalDiterima} unit.\n${totalSelisih} unit dicatat sebagai hilang saat pengiriman.`
              : `Stok cabang bertambah ${totalDiterima} unit.`;

            Alert.alert('Berhasil', successMsg, [
              { text: 'OK', onPress: () => router.back() },
            ]);
          } catch (e: any) {
            Alert.alert('Gagal', e.message);
          } finally {
            setConfirming(false);
          }
        },
      },
    ]);
  };

  const isReceived = header?.status === 'received';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={st.container}>
        {/* Header */}
        <View style={[st.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#347385" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.headerTitle}>Detail Kiriman</Text>
            <Text style={st.headerSub}>Dari gudang pusat</Text>
          </View>
        </View>

        {loading ? (
          <View style={st.loadingWrap}>
            <ActivityIndicator size="large" color="#347385" />
            <Text style={st.loadingText}>Memuat detail...</Text>
          </View>
        ) : (
          <TabletCenteredView maxWidth={800} style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Info Card */}
              <View style={st.infoCard}>
                <View style={st.infoRow}>
                  <Text style={st.infoLabel}>Status</Text>
                  {header ? <StatusBadge status={header.status} /> : null}
                </View>
                {header?.sent_at ? (
                  <View style={st.infoRow}>
                    <Text style={st.infoLabel}>Tanggal Kirim</Text>
                    <Text style={st.infoValue}>{fmtDate(header.sent_at)}</Text>
                  </View>
                ) : null}
                {header?.received_at ? (
                  <View style={st.infoRow}>
                    <Text style={st.infoLabel}>Tanggal Terima</Text>
                    <Text style={st.infoValue}>{fmtDate(header.received_at)}</Text>
                  </View>
                ) : null}
                {header?.notes ? (
                  <View style={st.infoRow}>
                    <Text style={st.infoLabel}>Catatan</Text>
                    <Text style={[st.infoValue, { flex: 1, textAlign: 'right' }]}>{header.notes}</Text>
                  </View>
                ) : null}
                <View style={[st.infoRow, st.infoRowBorder]}>
                  <Text style={st.infoLabel}>Total Dikirim</Text>
                  <Text style={st.infoValueBold}>{totalDikirim} unit</Text>
                </View>
                {isReceived && (
                  <View style={st.infoRow}>
                    <Text style={st.infoLabel}>Total Diterima</Text>
                    <Text style={[st.infoValueBold, { color: '#22C55E' }]}>{items.reduce((s, i) => s + (i.quantity_received ?? i.quantity), 0)} unit</Text>
                  </View>
                )}
              </View>

              {/* Hint saat belum diterima */}
              {!isReceived && (
                <View style={st.hintCard}>
                  <Ionicons name="information-circle-outline" size={16} color="#347385" />
                  <Text style={st.hintText}>
                    Periksa dan hitung barang yang diterima. Ubah qty jika ada yang tidak sesuai.
                  </Text>
                </View>
              )}

              {/* Daftar Produk */}
              <Text style={st.sectionTitle}>Daftar Produk</Text>
              {items.map((item, index) => {
                const qtyStr = receivedQtys[item.product_id] ?? String(item.quantity);
                const qtyInt = parseInt(qtyStr) || 0;
                const selisih = item.quantity - qtyInt;
                const adaSelisih = selisih > 0 && !isReceived;
                const receivedFinal = isReceived ? (item.quantity_received ?? item.quantity) : null;
                const selisihFinal = isReceived ? item.quantity - (item.quantity_received ?? item.quantity) : 0;

                return (
                  <View key={item.id} style={[st.itemCard, isTablet && st.itemCardTablet]}>
                    <View style={st.itemTop}>
                      <View style={st.itemIndex}>
                        <Text style={st.itemIndexText}>{index + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={st.itemName}>{item.product_name}</Text>
                        {item.product_unit ? <Text style={st.itemUnit}>{item.product_unit}</Text> : null}
                      </View>
                    </View>

                    <View style={st.itemBottom}>
                      {/* Qty dikirim */}
                      <View style={st.qtyCol}>
                        <Text style={st.qtyLabel}>Dikirim</Text>
                        <Text style={st.qtyValue}>{item.quantity}</Text>
                      </View>

                      <Ionicons name="arrow-forward" size={16} color="#9CA3AF" />

                      {/* Qty diterima — editable jika belum konfirmasi */}
                      <View style={st.qtyCol}>
                        <Text style={st.qtyLabel}>Diterima</Text>
                        {isReceived ? (
                          <Text style={[st.qtyValue, { color: selisihFinal > 0 ? '#F59E0B' : '#22C55E' }]}>
                            {receivedFinal}
                          </Text>
                        ) : (
                          <TextInput
                            style={[st.qtyInput, adaSelisih && st.qtyInputWarning]}
                            value={qtyStr}
                            onChangeText={(v) => {
                              const clean = v.replace(/[^0-9]/g, '');
                              setReceivedQtys((prev) => ({ ...prev, [item.product_id]: clean }));
                            }}
                            keyboardType="number-pad"
                            selectTextOnFocus
                          />
                        )}
                      </View>

                      {/* Selisih */}
                      {(adaSelisih || (isReceived && selisihFinal > 0)) && (
                        <View style={st.selisihBadge}>
                          <Ionicons name="warning-outline" size={12} color="#D97706" />
                          <Text style={st.selisihText}>
                            -{isReceived ? selisihFinal : selisih} hilang
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* Summary selisih saat input */}
              {!isReceived && totalSelisih > 0 && (
                <View style={st.selisihSummary}>
                  <Ionicons name="warning-outline" size={16} color="#D97706" />
                  <Text style={st.selisihSummaryText}>
                    {totalSelisih} unit akan dicatat sebagai hilang saat pengiriman
                  </Text>
                </View>
              )}

              {/* Tombol konfirmasi */}
              {!isReceived && (
                <TouchableOpacity
                  style={[st.confirmBtn, confirming && { opacity: 0.6 }]}
                  onPress={handleConfirm}
                  disabled={confirming}
                  activeOpacity={0.8}
                >
                  {confirming ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={st.confirmBtnText}>Konfirmasi Terima Barang</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </ScrollView>
          </TabletCenteredView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#E5F4F7', gap: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: '#9CA3AF' },

  infoCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#D4EFF4', gap: 10,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoRowBorder: { borderTopWidth: 1, borderTopColor: '#E5F4F7', paddingTop: 10, marginTop: 4 },
  infoLabel: { fontSize: 13, color: '#6B7280' },
  infoValue: { fontSize: 13, color: '#111827', fontWeight: '500' },
  infoValueBold: { fontSize: 14, color: '#111827', fontWeight: '700' },

  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  hintCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#EEF8FA', borderRadius: 10, padding: 12,
    marginBottom: 12, borderWidth: 1, borderColor: '#A9DFE9',
  },
  hintText: { flex: 1, fontSize: 12, color: '#347385', lineHeight: 18 },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#6B7280',
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  itemCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: '#E5F4F7', gap: 10,
  },
  itemCardTablet: { marginHorizontal: 4 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemIndex: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  itemIndexText: { fontSize: 12, fontWeight: '700', color: '#347385' },
  itemName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemUnit: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  itemBottom: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyCol: { alignItems: 'center', minWidth: 60 },
  qtyLabel: { fontSize: 11, color: '#9CA3AF', marginBottom: 4 },
  qtyValue: { fontSize: 18, fontWeight: '700', color: '#111827' },
  qtyInput: {
    fontSize: 18, fontWeight: '700', color: '#347385',
    borderWidth: 2, borderColor: '#A9DFE9', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    minWidth: 60, textAlign: 'center',
  },
  qtyInputWarning: { borderColor: '#F59E0B', color: '#D97706' },

  selisihBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFFBEB', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#FDE68A', marginLeft: 'auto',
  },
  selisihText: { fontSize: 11, fontWeight: '700', color: '#D97706' },

  selisihSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12,
    marginTop: 4, marginBottom: 12,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  selisihSummaryText: { fontSize: 13, color: '#D97706', fontWeight: '600', flex: 1 },

  confirmBtn: {
    backgroundColor: '#347385', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 8,
  },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
