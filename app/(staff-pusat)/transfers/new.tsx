/**
 * Buat Distribusi Stok Baru
 * Role: staff_pusat
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  useWindowDimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import {
  getWarehouses,
  getWarehouseStock,
  createStockTransfer,
  sendStockTransfer,
  type WarehouseStockRow,
} from '@/lib/warehouseQueries';
import type { Warehouse, Branch } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransferItem {
  product_id: string;
  product_name: string;
  unit: string;
  qty_available: number;
  quantity: number;
  cost_price: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtStock(n: number, unit: string) {
  return `${n.toLocaleString('id-ID')} ${unit}`;
}

// ─── Branch Picker Modal ──────────────────────────────────────────────────────

interface BranchPickerProps {
  visible: boolean;
  branches: Branch[];
  selectedId: string | null;
  onSelect: (branch: Branch) => void;
  onClose: () => void;
  insets: { top: number };
}

function BranchPickerModal({ visible, branches, selectedId, onSelect, onClose, insets }: BranchPickerProps) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return branches;
    const q = search.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(q));
  }, [branches, search]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={bpStyles.overlay}>
        <View style={[bpStyles.sheet, { paddingTop: insets.top + 8 }]}>
          <View style={bpStyles.header}>
            <Text style={bpStyles.title}>Pilih Cabang Tujuan</Text>
            <TouchableOpacity onPress={onClose} style={bpStyles.closeBtn}>
              <Ionicons name="close" size={22} color="#1A202C" />
            </TouchableOpacity>
          </View>
          <View style={bpStyles.searchWrap}>
            <Ionicons name="search" size={16} color="#A0AEC0" />
            <TextInput
              style={bpStyles.searchInput}
              placeholder="Cari cabang..."
              value={search}
              onChangeText={setSearch}
              autoFocus
              placeholderTextColor="#A0AEC0"
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
            renderItem={({ item }) => {
              const isSelected = item.id === selectedId;
              return (
                <TouchableOpacity
                  style={[bpStyles.row, isSelected && bpStyles.rowSelected]}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                    setSearch('');
                  }}
                  activeOpacity={0.75}
                >
                  <View style={bpStyles.rowIcon}>
                    <Ionicons name="business-outline" size={18} color={isSelected ? '#347385' : '#718096'} />
                  </View>
                  <Text style={[bpStyles.rowName, isSelected && bpStyles.rowNameSelected]}>
                    {item.name}
                  </Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={20} color="#347385" />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={bpStyles.empty}>
                <Text style={bpStyles.emptyText}>Tidak ada cabang ditemukan</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const bpStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1A202C' },
  closeBtn: { padding: 4 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F9FAFB',
  },
  searchInput: { flex: 1, height: 40, fontSize: 14, color: '#1A202C' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rowSelected: { borderColor: '#347385', backgroundColor: '#EEF8FA' },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1A202C' },
  rowNameSelected: { color: '#347385' },
  empty: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 13, color: '#A0AEC0' },
});

// ─── Product Picker Modal ─────────────────────────────────────────────────────

interface ProductPickerProps {
  visible: boolean;
  stock: WarehouseStockRow[];
  addedIds: Set<string>;
  onSelect: (row: WarehouseStockRow) => void;
  onClose: () => void;
  insets: { top: number };
}

function ProductPickerModal({ visible, stock, addedIds, onSelect, onClose, insets }: ProductPickerProps) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const available = stock.filter((r) => r.stock > 0);
    if (!search) return available;
    const q = search.toLowerCase();
    return available.filter(
      (r) => r.product_name.toLowerCase().includes(q) || r.category_name.toLowerCase().includes(q)
    );
  }, [stock, search]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={ppStyles.overlay}>
        <View style={[ppStyles.sheet, { paddingTop: insets.top + 8 }]}>
          <View style={ppStyles.header}>
            <Text style={ppStyles.title}>Pilih Produk dari Stok Gudang</Text>
            <TouchableOpacity onPress={onClose} style={ppStyles.closeBtn}>
              <Ionicons name="close" size={22} color="#1A202C" />
            </TouchableOpacity>
          </View>
          <View style={ppStyles.searchWrap}>
            <Ionicons name="search" size={16} color="#A0AEC0" />
            <TextInput
              style={ppStyles.searchInput}
              placeholder="Cari produk..."
              value={search}
              onChangeText={setSearch}
              autoFocus
              placeholderTextColor="#A0AEC0"
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.product_id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
            renderItem={({ item }) => {
              const alreadyAdded = addedIds.has(item.product_id);
              return (
                <TouchableOpacity
                  style={[ppStyles.row, alreadyAdded && ppStyles.rowAdded]}
                  onPress={() => {
                    if (!alreadyAdded) {
                      onSelect(item);
                      onClose();
                      setSearch('');
                    }
                  }}
                  activeOpacity={alreadyAdded ? 1 : 0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={ppStyles.productName} numberOfLines={1}>
                      {item.product_name}
                    </Text>
                    <Text style={ppStyles.productMeta}>
                      {item.category_name} · Stok: {fmtStock(item.stock, item.unit)}
                    </Text>
                  </View>
                  {alreadyAdded ? (
                    <View style={ppStyles.addedChip}>
                      <Text style={ppStyles.addedChipText}>Ditambah</Text>
                    </View>
                  ) : (
                    <Ionicons name="add-circle" size={22} color="#347385" />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={ppStyles.empty}>
                <Ionicons name="cube-outline" size={36} color="#CBD5E0" />
                <Text style={ppStyles.emptyText}>Tidak ada produk tersedia</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const ppStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1A202C' },
  closeBtn: { padding: 4 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F9FAFB',
  },
  searchInput: { flex: 1, height: 40, fontSize: 14, color: '#1A202C' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rowAdded: { opacity: 0.5 },
  productName: { fontSize: 14, fontWeight: '600', color: '#1A202C' },
  productMeta: { fontSize: 12, color: '#718096', marginTop: 2 },
  addedChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#DCFCE7',
    borderRadius: 20,
  },
  addedChipText: { fontSize: 11, fontWeight: '600', color: '#15803D' },
  empty: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, color: '#A0AEC0' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NewTransferScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const scrollRef = useRef<ScrollView>(null);
  const notesRef = useRef<View>(null);

  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouseStock, setWarehouseStock] = useState<WarehouseStockRow[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);

  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [items, setItems] = useState<TransferItem[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [branchPickerVisible, setBranchPickerVisible] = useState(false);
  const [productPickerVisible, setProductPickerVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [warehouses, branchData] = await Promise.all([
          getWarehouses(),
          supabase.from('branches').select('*').eq('is_active', true).order('name'),
        ]);
        if (warehouses.length === 0) {
          Alert.alert('Perhatian', 'Tidak ada gudang aktif');
          router.back();
          return;
        }
        const wh = warehouses[0];
        setWarehouse(wh);
        setBranches((branchData.data ?? []) as Branch[]);

        const stock = await getWarehouseStock(wh.id);
        setWarehouseStock(stock);
      } catch (err: any) {
        Alert.alert('Gagal', err.message ?? 'Gagal memuat data awal');
        router.back();
      } finally {
        setLoadingInit(false);
      }
    })();
  }, []);

  const addedIds = useMemo(() => new Set(items.map((i) => i.product_id)), [items]);

  const handleSelectProduct = (row: WarehouseStockRow) => {
    setItems((prev) => [
      ...prev,
      {
        product_id: row.product_id,
        product_name: row.product_name,
        unit: row.unit,
        qty_available: row.stock,
        quantity: 1,
        cost_price: row.cost_price,
      },
    ]);
  };

  const updateQty = (idx: number, raw: string) => {
    const parsed = parseInt(raw, 10);
    const val = isNaN(parsed) ? 0 : parsed;
    const max = items[idx].qty_available;
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, quantity: Math.min(val, max) } : item))
    );
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const validate = (): boolean => {
    if (!selectedBranch) {
      Alert.alert('Perhatian', 'Pilih cabang tujuan terlebih dahulu');
      return false;
    }
    if (items.length === 0) {
      Alert.alert('Perhatian', 'Tambahkan minimal 1 produk');
      return false;
    }
    for (const item of items) {
      if (item.quantity <= 0) {
        Alert.alert('Perhatian', `Jumlah ${item.product_name} harus lebih dari 0`);
        return false;
      }
      if (item.quantity > item.qty_available) {
        Alert.alert(
          'Perhatian',
          `Jumlah ${item.product_name} melebihi stok gudang (${fmtStock(item.qty_available, item.unit)})`
        );
        return false;
      }
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!validate() || !warehouse || !selectedBranch) return;
    try {
      setSubmitting(true);
      await createStockTransfer({
        warehouseId: warehouse.id,
        branchId: selectedBranch.id,
        notes: notes.trim() || undefined,
        items: items.map((i) => ({
          productId: i.product_id,
          quantity: i.quantity,
          costPrice: i.cost_price,
        })),
      });
      Alert.alert('Berhasil', 'Distribusi disimpan sebagai draft', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Gagal', err.message ?? 'Gagal menyimpan draft');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendNow = async () => {
    if (!validate() || !warehouse || !selectedBranch) return;
    Alert.alert(
      'Kirim Sekarang',
      `Stok akan langsung dikurangi dari gudang dan ditambah ke ${selectedBranch.name}. Lanjutkan?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Kirim',
          onPress: async () => {
            try {
              setSubmitting(true);
              const transferId = await createStockTransfer({
                warehouseId: warehouse.id,
                branchId: selectedBranch.id,
                notes: notes.trim() || undefined,
                items: items.map((i) => ({
                  productId: i.product_id,
                  quantity: i.quantity,
                  costPrice: i.cost_price,
                })),
              });
              await sendStockTransfer(transferId);
              Alert.alert('Berhasil', 'Distribusi berhasil dikirim ke cabang', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (err: any) {
              Alert.alert('Gagal', err.message ?? 'Gagal mengirim distribusi');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  if (loadingInit) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A202C" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Distribusi Baru</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color="#347385" />
          <Text style={styles.loadingText}>Memuat data...</Text>
        </View>
      </View>
    );
  }

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Distribusi Baru</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scrollContent,
            isTablet && styles.scrollContentTablet,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {/* Branch Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cabang Tujuan</Text>
            <TouchableOpacity
              style={[styles.selectorBtn, selectedBranch && styles.selectorBtnSelected]}
              onPress={() => setBranchPickerVisible(true)}
              activeOpacity={0.8}
            >
              {selectedBranch ? (
                <View style={styles.selectorContent}>
                  <View style={styles.selectorIcon}>
                    <Ionicons name="business" size={18} color="#347385" />
                  </View>
                  <Text style={styles.selectorSelectedText} numberOfLines={1}>
                    {selectedBranch.name}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#347385" />
                </View>
              ) : (
                <View style={styles.selectorContent}>
                  <Ionicons name="business-outline" size={18} color="#9CA3AF" />
                  <Text style={styles.selectorPlaceholder}>Pilih cabang tujuan...</Text>
                  <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                </View>
              )}
            </TouchableOpacity>
            {selectedBranch && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setSelectedBranch(null)}
              >
                <Ionicons name="close-circle-outline" size={14} color="#EF4444" />
                <Text style={styles.clearBtnText}>Hapus pilihan</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Products */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Daftar Produk</Text>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => setProductPickerVisible(true)}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Tambah</Text>
              </TouchableOpacity>
            </View>

            {items.length === 0 ? (
              <View style={styles.emptyItems}>
                <Ionicons name="cube-outline" size={36} color="#CBD5E0" />
                <Text style={styles.emptyItemsText}>Belum ada produk dipilih</Text>
              </View>
            ) : (
              items.map((item, idx) => (
                <View key={item.product_id} style={styles.itemCard}>
                  <View style={styles.itemCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.product_name}
                      </Text>
                      <Text style={styles.itemAvail}>
                        Stok tersedia: {fmtStock(item.qty_available, item.unit)}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeItem(idx)} style={styles.removeBtn}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.itemQtyRow}>
                    <Text style={styles.itemQtyLabel}>Jumlah ({item.unit})</Text>
                    <View style={styles.qtyControls}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() =>
                          updateQty(idx, String(Math.max(0, item.quantity - 1)))
                        }
                      >
                        <Ionicons name="remove" size={16} color="#347385" />
                      </TouchableOpacity>
                      <TextInput
                        style={styles.qtyInput}
                        value={item.quantity === 0 ? '' : item.quantity.toString()}
                        onChangeText={(v) => updateQty(idx, v)}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#A0AEC0"
                        textAlign="center"
                      />
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() =>
                          updateQty(idx, String(Math.min(item.qty_available, item.quantity + 1)))
                        }
                      >
                        <Ionicons name="add" size={16} color="#347385" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {item.quantity > item.qty_available && (
                    <Text style={styles.qtyError}>
                      Melebihi stok tersedia ({item.qty_available} {item.unit})
                    </Text>
                  )}
                </View>
              ))
            )}

            {items.length > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {items.length} jenis produk · {totalQty} total unit
                </Text>
              </View>
            )}
          </View>

          {/* Notes */}
          <View ref={notesRef} style={styles.section}>
            <Text style={styles.sectionTitle}>Catatan (Opsional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Tambahkan catatan untuk cabang..."
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
              placeholderTextColor="#A0AEC0"
              onFocus={() => {
                notesRef.current?.measureLayout(
                  scrollRef.current as any,
                  (_x, y) => {
                    scrollRef.current?.scrollTo({ y: y - 16, animated: true });
                  },
                  () => {}
                );
              }}
            />
          </View>

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.draftBtn, submitting && styles.btnDisabled]}
              onPress={handleSaveDraft}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#347385" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#347385" />
                  <Text style={styles.draftBtnText}>Simpan Draft</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.sendBtn, submitting && styles.btnDisabled]}
              onPress={handleSendNow}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.sendBtnText}>Kirim Sekarang</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Branch Picker */}
      <BranchPickerModal
        visible={branchPickerVisible}
        branches={branches}
        selectedId={selectedBranch?.id ?? null}
        onSelect={setSelectedBranch}
        onClose={() => setBranchPickerVisible(false)}
        insets={insets}
      />

      {/* Product Picker */}
      <ProductPickerModal
        visible={productPickerVisible}
        stock={warehouseStock}
        addedIds={addedIds}
        onSelect={handleSelectProduct}
        onClose={() => setProductPickerVisible(false)}
        insets={insets}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1A202C',
    textAlign: 'center',
  },

  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 48,
    flexGrow: 1,
  },
  scrollContentTablet: {
    maxWidth: 680,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },

  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Selector
  selectorBtn: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    overflow: 'hidden',
  },
  selectorBtnSelected: { borderColor: '#347385', backgroundColor: '#EEF8FA' },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectorSelectedText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#347385' },
  selectorPlaceholder: { flex: 1, fontSize: 14, color: '#9CA3AF' },
  selectorIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  clearBtnText: { fontSize: 12, color: '#EF4444' },

  // Add button
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#347385',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Empty items
  emptyItems: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  emptyItemsText: { fontSize: 13, color: '#A0AEC0' },

  // Item card
  itemCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    backgroundColor: '#FAFAFA',
  },
  itemCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#1A202C' },
  itemAvail: { fontSize: 12, color: '#718096', marginTop: 2 },
  removeBtn: { padding: 2 },
  itemQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemQtyLabel: { fontSize: 13, color: '#4A5568', fontWeight: '500' },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EEF8FA',
  },
  qtyInput: {
    width: 56,
    height: 36,
    fontSize: 15,
    fontWeight: '700',
    color: '#1A202C',
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
  },
  qtyError: { fontSize: 11, color: '#EF4444', fontWeight: '500' },
  summaryRow: {
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'flex-end',
  },
  summaryLabel: { fontSize: 12, color: '#347385', fontWeight: '600' },

  // Notes
  notesInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A202C',
  },

  // Actions
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  draftBtn: { backgroundColor: '#EEF8FA', borderWidth: 1, borderColor: '#347385' },
  draftBtnText: { color: '#347385', fontSize: 14, fontWeight: '700' },
  sendBtn: { backgroundColor: '#347385' },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  // Center
  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#718096' },
});
