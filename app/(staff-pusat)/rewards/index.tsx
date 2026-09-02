import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Modal, TextInput, Alert, ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useBackFromDashboard } from '@/hooks/useBackFromDashboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { supabase } from '@/lib/supabase';
import {
  type RewardItem, type RewardProduct,
  getAllRewardItems, createRewardItem, updateRewardItem,
  toggleRewardItem, deleteRewardItem,
} from '@/lib/rewardQueries';

interface ProductOption { id: string; name: string; }
interface DraftProduct { product_id: string; product_name: string; qty: number; }

// ─── Product Picker Modal ─────────────────────────────────────────────────────

function ProductPickerModal({
  visible, onSelect, onClose,
}: {
  visible: boolean;
  onSelect: (p: ProductOption) => void;
  onClose: () => void;
}) {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    supabase
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .then(({ data }) => setProducts(data ?? []))
      .catch(() => {});
  }, [visible]);

  const filtered = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : products;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={pStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={pStyles.box} activeOpacity={1}>
          <Text style={pStyles.title}>Pilih Produk</Text>
          <TextInput
            style={pStyles.search}
            placeholder="Cari produk..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          <FlatList
            data={filtered}
            keyExtractor={(i) => i.id}
            style={{ maxHeight: 320 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={pStyles.item} onPress={() => { onSelect(item); onClose(); }}>
                <Text style={pStyles.itemText}>{item.name}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={pStyles.empty}>Tidak ada produk</Text>}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const pStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  box: { backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '88%', maxWidth: 400, gap: 12 },
  title: { fontSize: 16, fontWeight: '800', color: '#111827' },
  search: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827',
  },
  item: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  itemText: { fontSize: 14, color: '#111827' },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 24, fontSize: 13 },
});

// ─── Form Modal ───────────────────────────────────────────────────────────────

function RewardFormModal({
  visible, initial, onSave, onClose,
}: {
  visible: boolean;
  initial: RewardItem | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [pointsRequired, setPointsRequired] = useState('');
  const [products, setProducts] = useState<DraftProduct[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [pickerTargetIdx, setPickerTargetIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(initial?.name ?? '');
    setPointsRequired(initial ? initial.points_required.toString() : '');
    setProducts(
      initial?.products?.map((p) => ({
        product_id: p.product_id ?? '',
        product_name: p.product_name,
        qty: p.qty,
      })) ?? []
    );
  }, [visible, initial]);

  const openPickerForIndex = (idx: number) => {
    setPickerTargetIdx(idx);
    setShowProductPicker(true);
  };

  const handleProductSelected = (p: ProductOption) => {
    if (pickerTargetIdx === null) return;
    setProducts((prev) => {
      const next = [...prev];
      next[pickerTargetIdx] = { ...next[pickerTargetIdx], product_id: p.id, product_name: p.name };
      return next;
    });
  };

  const addProductRow = () => {
    setProducts((prev) => [...prev, { product_id: '', product_name: '', qty: 1 }]);
  };

  const removeProductRow = (idx: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQty = (idx: number, val: string) => {
    const q = parseInt(val, 10);
    setProducts((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], qty: isNaN(q) ? 1 : Math.max(1, q) };
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('', 'Masukkan nama reward'); return; }
    const pts = parseInt(pointsRequired, 10);
    if (!pts || pts <= 0) { Alert.alert('', 'Masukkan jumlah poin yang valid'); return; }
    if (products.length === 0) { Alert.alert('', 'Tambahkan minimal 1 produk'); return; }
    const invalid = products.find((p) => !p.product_id);
    if (invalid) { Alert.alert('', 'Pilih produk untuk setiap baris'); return; }

    setSaving(true);
    try {
      if (initial) {
        await updateRewardItem(initial.id, { name, points_required: pts, products });
      } else {
        await createRewardItem({ name, points_required: pts, products });
      }
      onSave();
      onClose();
    } catch (e: any) {
      Alert.alert('Gagal', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={fStyles.overlay}>
        <View style={fStyles.box}>
          <Text style={fStyles.title}>{initial ? 'Edit Reward' : 'Tambah Reward'}</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={fStyles.label}>Nama Reward</Text>
            <TextInput
              style={fStyles.input}
              placeholder="contoh: Paket Hemat 100 Poin"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
            />

            <Text style={fStyles.label}>Poin yang Dibutuhkan</Text>
            <TextInput
              style={fStyles.input}
              placeholder="contoh: 100"
              placeholderTextColor="#9CA3AF"
              value={pointsRequired}
              onChangeText={setPointsRequired}
              keyboardType="number-pad"
            />

            <View style={fStyles.productsHeader}>
              <Text style={fStyles.label}>Produk yang Didapat</Text>
              <TouchableOpacity style={fStyles.addProductBtn} onPress={addProductRow}>
                <Ionicons name="add" size={14} color="#347385" />
                <Text style={fStyles.addProductText}>Tambah Produk</Text>
              </TouchableOpacity>
            </View>

            {products.length === 0 && (
              <Text style={fStyles.noProduct}>Belum ada produk — tap "Tambah Produk"</Text>
            )}

            {products.map((p, idx) => (
              <View key={idx} style={fStyles.productRow}>
                <TouchableOpacity
                  style={fStyles.productPickBtn}
                  onPress={() => openPickerForIndex(idx)}
                >
                  <Text style={[fStyles.productPickText, !p.product_name && { color: '#9CA3AF' }]} numberOfLines={1}>
                    {p.product_name || 'Pilih produk...'}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color="#6B7280" />
                </TouchableOpacity>
                <TextInput
                  style={fStyles.qtyInput}
                  value={p.qty.toString()}
                  onChangeText={(v) => updateQty(idx, v)}
                  keyboardType="number-pad"
                  placeholder="Qty"
                  placeholderTextColor="#9CA3AF"
                />
                <TouchableOpacity onPress={() => removeProductRow(idx)} style={fStyles.removeBtn}>
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <View style={fStyles.actions}>
            <TouchableOpacity style={fStyles.cancelBtn} onPress={onClose}>
              <Text style={fStyles.cancelText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={fStyles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={fStyles.saveText}>Simpan</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ProductPickerModal
        visible={showProductPicker}
        onSelect={handleProductSelected}
        onClose={() => setShowProductPicker(false)}
      />
    </Modal>
  );
}

const fStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  box: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    width: '90%', maxWidth: 420, maxHeight: '85%', gap: 10,
  },
  title: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 4, marginTop: 8 },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827',
  },
  productsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  addProductBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addProductText: { fontSize: 12, fontWeight: '700', color: '#347385' },
  noProduct: { fontSize: 12, color: '#9CA3AF', paddingVertical: 8 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  productPickBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 9,
  },
  productPickText: { fontSize: 13, color: '#111827', flex: 1 },
  qtyInput: {
    width: 52, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 9, fontSize: 13, color: '#111827', textAlign: 'center',
  },
  removeBtn: { padding: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  saveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#347385', alignItems: 'center' },
  saveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const goBack = useBackFromDashboard();

  const [items, setItems] = useState<RewardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RewardItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await getAllRewardItems()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleToggle = (item: RewardItem) => {
    const label = item.is_active ? 'Nonaktifkan' : 'Aktifkan';
    Alert.alert(label, `${label} reward "${item.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      { text: label, onPress: async () => { await toggleRewardItem(item.id, !item.is_active); load(); } },
    ]);
  };

  const handleDelete = (item: RewardItem) => {
    Alert.alert('Hapus', `Hapus reward "${item.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: async () => { await deleteRewardItem(item.id); load(); } },
    ]);
  };

  const numColumns = isTablet ? 2 : 1;

  return (
    <View style={styles.container}>
      <OwnerPageHeader
        title="Reward Poin"
        onBack={goBack}
        onAdd={() => { setEditing(null); setShowForm(true); }}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#56B2C1" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          numColumns={numColumns}
          key={numColumns}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          columnWrapperStyle={isTablet ? { gap: 12 } : undefined}
          ListHeaderComponent={
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color="#347385" />
              <Text style={styles.infoText}>
                Setiap reward bisa berisi beberapa produk sekaligus dengan kuantiti berbeda.
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="gift-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>Belum ada reward</Text>
              <Text style={styles.emptySubText}>Tap tombol + untuk menambah reward</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, isTablet && styles.cardTablet, !item.is_active && styles.cardInactive]}
              onPress={() => { setEditing(item); setShowForm(true); }}
              activeOpacity={0.7}
            >
              <View style={styles.cardTop}>
                <View style={styles.giftIcon}>
                  <Ionicons name="gift-outline" size={20} color="#347385" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rewardName} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.pointsRow}>
                    <Ionicons name="star" size={12} color="#D97706" />
                    <Text style={styles.pointsText}>{item.points_required.toLocaleString('id-ID')} poin</Text>
                  </View>
                </View>
                {!item.is_active && (
                  <View style={styles.inactiveBadge}>
                    <Text style={styles.inactiveBadgeText}>Nonaktif</Text>
                  </View>
                )}
              </View>

              {/* Daftar produk */}
              <View style={styles.productList}>
                {(item.products ?? []).map((p, idx) => (
                  <View key={idx} style={styles.productItem}>
                    <Ionicons name="checkmark-circle-outline" size={13} color="#347385" />
                    <Text style={styles.productItemText} numberOfLines={1}>
                      {p.product_name} <Text style={styles.productItemQty}>x{p.qty}</Text>
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, item.is_active ? styles.actionBtnWarn : styles.actionBtnSuccess]}
                  onPress={() => handleToggle(item)}
                >
                  <Text style={styles.actionBtnText}>{item.is_active ? 'Nonaktifkan' : 'Aktifkan'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtnDanger} onPress={() => handleDelete(item)}>
                  <Ionicons name="trash-outline" size={14} color="#DC2626" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <RewardFormModal
        visible={showForm}
        initial={editing}
        onSave={load}
        onClose={() => setShowForm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  emptySubText: { fontSize: 13, color: '#9CA3AF' },

  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#EEF8FA', borderRadius: 10, padding: 12, marginBottom: 4,
  },
  infoText: { flex: 1, fontSize: 12, color: '#347385', lineHeight: 18 },

  list: { padding: 16, gap: 10 },

  card: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardTablet: { flex: 1 },
  cardInactive: { opacity: 0.55 },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  giftIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  rewardName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  pointsText: { fontSize: 13, fontWeight: '700', color: '#D97706' },
  inactiveBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  inactiveBadgeText: { fontSize: 10, fontWeight: '700', color: '#DC2626' },

  productList: { gap: 4, paddingLeft: 4 },
  productItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  productItemText: { fontSize: 12, color: '#374151', flex: 1 },
  productItemQty: { fontWeight: '700', color: '#347385' },

  cardActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  actionBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 8,
    alignItems: 'center', borderWidth: 1.5,
  },
  actionBtnWarn: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  actionBtnSuccess: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  actionBtnDanger: {
    width: 34, height: 34, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2',
  },
});
