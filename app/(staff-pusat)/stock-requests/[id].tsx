import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

interface RequestItem {
  product_id: string;
  product_name: string;
  quantity_requested: number;
  warehouse_stock: number;
  fulfill_qty: string;
}

interface RequestDetail {
  id: string;
  status: string;
  notes: string | null;
  review_notes: string | null;
  created_at: string;
  branch_id: string;
  branch_name: string;
  items: RequestItem[];
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
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

export default function StockRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const user = useAuthStore((s) => s.user);

  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [rejectNote, setRejectNote] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stock_requests')
        .select('id, status, notes, review_notes, created_at, branch_id, branches(name), stock_request_items(product_id, quantity, products(name))')
        .eq('id', id)
        .single();

      if (error) throw error;

      const row = data as any;
      const branchId = row.branch_id;

      const productIds: string[] = row.stock_request_items.map((i: any) => i.product_id);

      const { data: wsData } = await supabase
        .from('warehouse_stock')
        .select('product_id, stock')
        .in('product_id', productIds);

      const wsMap: Record<string, number> = {};
      for (const ws of wsData ?? []) {
        wsMap[ws.product_id] = ws.stock ?? 0;
      }

      const items: RequestItem[] = row.stock_request_items.map((i: any) => {
        const wStock = wsMap[i.product_id] ?? 0;
        const suggested = Math.min(i.quantity, wStock);
        return {
          product_id: i.product_id,
          product_name: i.products?.name ?? 'Produk Dihapus',
          quantity_requested: i.quantity,
          warehouse_stock: wStock,
          fulfill_qty: suggested > 0 ? String(suggested) : '',
        };
      });

      setDetail({
        id: row.id,
        status: row.status,
        notes: row.notes,
        review_notes: row.review_notes,
        created_at: row.created_at,
        branch_id: branchId,
        branch_name: row.branches?.name ?? '-',
        items,
      });
    } catch (e: any) {
      Alert.alert('Gagal', e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateFulfillQty = (productId: string, value: string) => {
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              it.product_id === productId
                ? { ...it, fulfill_qty: value.replace(/[^0-9]/g, '') }
                : it
            ),
          }
        : prev
    );
  };

  const handleApprove = () => {
    if (!detail) return;
    const validItems = detail.items.filter((it) => parseInt(it.fulfill_qty || '0', 10) > 0);
    if (validItems.length === 0) {
      Alert.alert('Perhatian', 'Masukkan jumlah yang akan dikirim minimal untuk satu produk.');
      return;
    }
    const partialItems = detail.items.filter(
      (it) => parseInt(it.fulfill_qty || '0', 10) < it.quantity_requested
    );
    const msg =
      partialItems.length > 0
        ? `${partialItems.length} produk dikirim kurang dari yang diminta. Lanjutkan?`
        : `Setujui dan kirim semua produk ke ${detail.branch_name}?`;

    Alert.alert('Konfirmasi Pengiriman', msg, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Kirim', onPress: () => doApprove(validItems) },
    ]);
  };

  const doApprove = async (validItems: RequestItem[]) => {
    if (!detail || !user?.id) return;
    setSubmitting(true);
    try {
      const { data: whData, error: whErr } = await supabase
        .from('warehouse')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single();
      if (whErr) throw whErr;
      const warehouseId = whData.id;

      const now = new Date().toISOString();

      const { data: transfer, error: tErr } = await supabase
        .from('stock_transfers')
        .insert({
          warehouse_id: warehouseId,
          branch_id: detail.branch_id,
          status: 'sent',
          notes: `Dari permintaan stok cabang ${detail.branch_name}`,
          sent_at: now,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (tErr) throw tErr;
      const transferId = transfer.id;

      const transferItems = validItems.map((it) => ({
        transfer_id: transferId,
        product_id: it.product_id,
        quantity: parseInt(it.fulfill_qty, 10),
        cost_price: null,
      }));
      const { error: tiErr } = await supabase.from('stock_transfer_items').insert(transferItems);
      if (tiErr) throw tiErr;

      for (const it of validItems) {
        const qty = parseInt(it.fulfill_qty, 10);
        const { error: wsErr } = await supabase.rpc('decrement_warehouse_stock', {
          p_warehouse_id: warehouseId,
          p_product_id: it.product_id,
          p_qty: qty,
        });
        if (wsErr) throw wsErr;
      }

      const movements = validItems.flatMap((it) => {
        const qty = parseInt(it.fulfill_qty, 10);
        return [
          {
            product_id: it.product_id,
            type: 'transfer_out',
            quantity: qty,
            reference_id: transferId,
            reason: `Transfer ke ${detail.branch_name}`,
            created_by: user.id,
            branch_id: null,
          },
        ];
      });
      await supabase.from('stock_movements').insert(movements);

      await supabase
        .from('stock_requests')
        .update({
          status: 'approved',
          transfer_id: transferId,
          reviewed_by: user.id,
          reviewed_at: now,
        })
        .eq('id', detail.id);

      Alert.alert('Berhasil', 'Permintaan disetujui dan stok berhasil dikirim.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Gagal', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!detail || !user?.id) return;
    if (!rejectNote.trim()) {
      Alert.alert('Wajib', 'Masukkan alasan penolakan.');
      return;
    }
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('stock_requests')
        .update({
          status: 'rejected',
          review_notes: rejectNote.trim(),
          reviewed_by: user.id,
          reviewed_at: now,
        })
        .eq('id', detail.id);
      if (error) throw error;
      Alert.alert('Ditolak', 'Permintaan stok telah ditolak.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Gagal', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#347385" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Detail Permintaan</Text>
        </View>
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color="#347385" />
        </View>
      </View>
    );
  }

  if (!detail) return null;

  const isPending = detail.status === 'pending';
  const totalRequested = detail.items.reduce((s, it) => s + it.quantity_requested, 0);
  const totalFulfill = detail.items.reduce((s, it) => s + parseInt(it.fulfill_qty || '0', 10), 0);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#347385" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Detail Permintaan</Text>
            <Text style={styles.headerSub}>{detail.branch_name}</Text>
          </View>
          <StatusBadge status={detail.status} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 32 },
            isTablet && styles.contentTablet,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={14} color="#6B7280" />
              <Text style={styles.infoText}>{fmtDate(detail.created_at)}</Text>
            </View>
            {detail.notes ? (
              <View style={styles.infoRow}>
                <Ionicons name="chatbubble-outline" size={14} color="#6B7280" />
                <Text style={styles.infoText}>{detail.notes}</Text>
              </View>
            ) : null}
            {detail.review_notes ? (
              <View style={[styles.infoRow, { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 8 }]}>
                <Ionicons name="close-circle-outline" size={14} color="#DC2626" />
                <Text style={[styles.infoText, { color: '#DC2626' }]}>Alasan tolak: {detail.review_notes}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>
            Daftar Produk{isPending ? ' & Jumlah yang Akan Dikirim' : ''}
          </Text>

          {detail.items.map((it) => {
            const fulfillNum = parseInt(it.fulfill_qty || '0', 10);
            const isShort = fulfillNum < it.quantity_requested;
            const isOver = fulfillNum > it.warehouse_stock;
            const noStock = it.warehouse_stock === 0;

            return (
              <View key={it.product_id} style={styles.itemCard}>
                <View style={styles.itemTop}>
                  <Text style={styles.itemName} numberOfLines={2}>{it.product_name}</Text>
                  {noStock && (
                    <View style={styles.outChip}>
                      <Text style={styles.outChipText}>Stok Habis</Text>
                    </View>
                  )}
                </View>

                <View style={styles.itemStats}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Diminta</Text>
                    <Text style={styles.statValue}>{it.quantity_requested}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Stok Gudang</Text>
                    <Text style={[styles.statValue, { color: noStock ? '#DC2626' : it.warehouse_stock < it.quantity_requested ? '#D97706' : '#16A34A' }]}>
                      {it.warehouse_stock}
                    </Text>
                  </View>
                  {isPending && (
                    <>
                      <View style={styles.statDivider} />
                      <View style={[styles.statBox, { flex: 1.2 }]}>
                        <Text style={styles.statLabel}>Dikirim</Text>
                        <TextInput
                          style={[
                            styles.fulfillInput,
                            isOver && styles.fulfillInputError,
                          ]}
                          value={it.fulfill_qty}
                          onChangeText={(v) => updateFulfillQty(it.product_id, v)}
                          keyboardType="numeric"
                          returnKeyType="done"
                          placeholder="0"
                          placeholderTextColor="#A0AEC0"
                          editable={!noStock}
                        />
                      </View>
                    </>
                  )}
                </View>

                {isPending && isOver && (
                  <Text style={styles.warnText}>Melebihi stok gudang ({it.warehouse_stock})</Text>
                )}
                {isPending && isShort && fulfillNum > 0 && !isOver && (
                  <View style={styles.shortRow}>
                    <Ionicons name="warning-outline" size={13} color="#D97706" />
                    <Text style={styles.shortText}>
                      Kurang {it.quantity_requested - fulfillNum} dari yang diminta — cabang perlu minta lagi nanti
                    </Text>
                  </View>
                )}
              </View>
            );
          })}

          {isPending && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total diminta</Text>
                <Text style={styles.summaryValue}>{totalRequested} unit</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total akan dikirim</Text>
                <Text style={[styles.summaryValue, { color: totalFulfill < totalRequested ? '#D97706' : '#16A34A' }]}>
                  {totalFulfill} unit
                </Text>
              </View>
              {totalFulfill < totalRequested && (
                <Text style={styles.summaryNote}>
                  {totalRequested - totalFulfill} unit tidak dapat dipenuhi sekarang karena stok gudang tidak mencukupi.
                </Text>
              )}
            </View>
          )}

          {isPending && (
            <>
              {showRejectInput ? (
                <View style={styles.rejectSection}>
                  <Text style={styles.sectionLabel}>Alasan Penolakan</Text>
                  <TextInput
                    style={styles.rejectInput}
                    placeholder="Tuliskan alasan penolakan..."
                    placeholderTextColor="#A0AEC0"
                    value={rejectNote}
                    onChangeText={setRejectNote}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    autoFocus
                  />
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.btnCancel}
                      onPress={() => { setShowRejectInput(false); setRejectNote(''); }}
                      disabled={submitting}
                    >
                      <Text style={styles.btnCancelText}>Batal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnReject, submitting && { opacity: 0.6 }]}
                      onPress={handleReject}
                      disabled={submitting}
                    >
                      {submitting
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.btnRejectText}>Konfirmasi Tolak</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.btnRejectOutline}
                    onPress={() => setShowRejectInput(true)}
                    disabled={submitting}
                  >
                    <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
                    <Text style={styles.btnRejectOutlineText}>Tolak</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnApprove, submitting && { opacity: 0.6 }]}
                    onPress={handleApprove}
                    disabled={submitting}
                  >
                    {submitting
                      ? <ActivityIndicator size="small" color="#fff" />
                      : (
                        <>
                          <Ionicons name="send" size={16} color="#fff" />
                          <Text style={styles.btnApproveText}>Setujui & Kirim</Text>
                        </>
                      )}
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5F4F7',
    gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },

  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  content: { padding: 16, gap: 12 },
  contentTablet: { maxWidth: 700, alignSelf: 'center', width: '100%' },

  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  infoText: { fontSize: 13, color: '#6B7280', flex: 1, lineHeight: 18 },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 4 },

  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  itemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  outChip: { backgroundColor: '#FEF2F2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  outChipText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },

  itemStats: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#111827' },
  statDivider: { width: 1, height: 36, backgroundColor: '#F3F4F6', marginHorizontal: 4 },

  fulfillInput: {
    borderWidth: 1.5,
    borderColor: '#347385',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    minWidth: 64,
    backgroundColor: '#F0FBFD',
  },
  fulfillInputError: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },

  warnText: { fontSize: 12, color: '#DC2626', fontWeight: '500' },
  shortRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  shortText: { fontSize: 12, color: '#D97706', flex: 1, lineHeight: 17 },

  summaryCard: {
    backgroundColor: '#F0FBFD',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A9DFE9',
    gap: 8,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: '#374151', fontWeight: '500' },
  summaryValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
  summaryNote: {
    fontSize: 12, color: '#D97706', lineHeight: 17,
    borderTopWidth: 1, borderTopColor: '#D1EFF5', paddingTop: 8, marginTop: 2,
  },

  rejectSection: { gap: 10 },
  rejectInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 90,
  },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  btnCancelText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  btnReject: {
    flex: 1.5, paddingVertical: 13, borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center', justifyContent: 'center',
  },
  btnRejectText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  btnRejectOutline: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#DC2626', backgroundColor: '#FEF2F2',
  },
  btnRejectOutlineText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  btnApprove: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: 10,
    backgroundColor: '#347385',
  },
  btnApproveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
