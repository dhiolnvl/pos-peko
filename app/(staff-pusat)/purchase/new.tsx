/**
 * New Purchase Order Screen — Staff Pusat
 * Menggunakan warehouse_id dari gudang pertama aktif (bukan branch_id)
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  Vibration,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useProductStore, type Product } from '@/store/productStore';
import { supabase } from '@/lib/supabase';
import { useSupplierStore, type Supplier } from '@/store/supplierStore';
import { SupplierPickerSheet } from '@/components/SupplierPickerSheet';
import {
  getWarehouses,
  createPurchaseOrder,
  receivePurchaseOrder,
} from '@/lib/warehouseQueries';
import type { Warehouse } from '@/types';

interface POItem {
  productId: string | null;
  productName: string;
  quantity: number;
  costPrice: number;
}

const fmtCurrency = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

export default function StaffNewPurchaseScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { syncFromSupabase } = useProductStore();
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const { loadSuppliers } = useSupplierStore();

  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [loadingWarehouse, setLoadingWarehouse] = useState(true);

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierPickerVisible, setSupplierPickerVisible] = useState(false);

  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<POItem[]>([]);
  const [saving, setSaving] = useState(false);

  const [showProductModal, setShowProductModal] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [scanMode, setScanMode] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  const [permission, requestPermission] = useCameraPermissions();
  const scanBlocked = useRef(false);

  const scrollRef = useRef<ScrollView>(null);
  const notesRef = useRef<View>(null);

  useEffect(() => {
    loadSuppliers();
    getWarehouses()
      .then(ws => setWarehouse(ws[0] ?? null))
      .catch(err => Alert.alert('Gagal memuat gudang', err.message))
      .finally(() => setLoadingWarehouse(false));

    // Fetch semua produk aktif langsung dari DB (tanpa pagination)
    (async () => {
      try {
        const { data } = await supabase
          .from('products')
          .select('id, name, barcode, price, cost_price, unit, image_url, is_active')
          .eq('is_active', true)
          .order('name', { ascending: true })
          .limit(2000);
        setAllProducts(data ?? []);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!showProductModal) {
      setScanMode(false);
      setSelectedProductIds(new Set());
    }
  }, [showProductModal]);

  const activeProducts = allProducts;

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return activeProducts;
    const q = productSearch.toLowerCase();
    return activeProducts.filter(
      p => p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q)
    );
  }, [activeProducts, productSearch]);

  const totalAmount = items.reduce((s, i) => s + i.quantity * i.costPrice, 0);
  const totalItems = items.reduce((s, i) => s + i.quantity, 0);

  const toggleProductSelect = useCallback((product: Product) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(product.id)) next.delete(product.id);
      else next.add(product.id);
      return next;
    });
  }, []);

  const confirmProductSelection = useCallback(() => {
    const toAdd = activeProducts.filter(p => selectedProductIds.has(p.id));
    setItems(prev => {
      const existingIds = new Set(prev.map(i => i.productId));
      const newItems = toAdd
        .filter(p => !existingIds.has(p.id))
        .map(p => ({
          productId: p.id,
          productName: p.name,
          quantity: 1,
          costPrice: p.cost_price ?? 0,
        }));
      return [...prev, ...newItems];
    });
    setShowProductModal(false);
    setProductSearch('');
    setScanMode(false);
    setSelectedProductIds(new Set());
  }, [activeProducts, selectedProductIds]);

  const addProduct = useCallback(
    (product: Product) => {
      setShowProductModal(false);
      setProductSearch('');
      setScanMode(false);
      setSelectedProductIds(new Set());
      setItems(prev => [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          costPrice: product.cost_price ?? 0,
        },
      ]);
    },
    []
  );

  const handleBarcodeScan = useCallback(
    ({ data }: { data: string }) => {
      if (scanBlocked.current) return;
      scanBlocked.current = true;
      Vibration.vibrate(80);
      const found = activeProducts.find(p => p.barcode === data);
      if (found) {
        addProduct(found);
      } else {
        Alert.alert('Produk tidak ditemukan', `Barcode: ${data}`, [
          { text: 'OK', onPress: () => { scanBlocked.current = false; } },
        ]);
      }
    },
    [activeProducts, addProduct]
  );

  const addManual = () => {
    setShowProductModal(false);
    setProductSearch('');
    setItems(prev => [
      ...prev,
      { productId: null, productName: productSearch || 'Produk Baru', quantity: 1, costPrice: 0 },
    ]);
  };

  const updateItem = (idx: number, field: keyof POItem, value: any) => {
    setItems(prev => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const validate = (): boolean => {
    if (!warehouse) {
      Alert.alert('Perhatian', 'Gudang tidak ditemukan');
      return false;
    }
    if (!selectedSupplier) {
      Alert.alert('Perhatian', 'Pilih supplier terlebih dahulu');
      return false;
    }
    if (items.length === 0) {
      Alert.alert('Perhatian', 'Tambahkan minimal 1 produk');
      return false;
    }
    for (const item of items) {
      if (!item.productName.trim()) {
        Alert.alert('Perhatian', 'Nama produk tidak boleh kosong');
        return false;
      }
      if (item.quantity <= 0) {
        Alert.alert('Perhatian', 'Jumlah harus lebih dari 0');
        return false;
      }
    }
    return true;
  };

  const buildPayload = () => ({
    warehouseId: warehouse!.id,
    supplierName: selectedSupplier!.name,
    supplierPhone: selectedSupplier!.phone || undefined,
    notes: notes.trim() || undefined,
    items: items.map(i => ({
      productId: i.productId ?? '',
      productName: i.productName,
      quantity: i.quantity,
      costPrice: i.costPrice,
    })),
  });

  const handleSaveDraft = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await createPurchaseOrder(buildPayload());
      Alert.alert('Berhasil', 'PO disimpan sebagai draft', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Gagal', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReceive = () => {
    if (!validate()) return;
    Alert.alert(
      'Tandai Diterima',
      'Stok semua produk dalam PO ini akan langsung diperbarui di gudang. Lanjutkan?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Diterima',
          onPress: async () => {
            setSaving(true);
            try {
              const poId = await createPurchaseOrder(buildPayload());
              await receivePurchaseOrder(poId);
              syncFromSupabase().catch(() => {});
              Alert.alert('Berhasil', 'Pembelian dicatat dan stok gudang telah diperbarui', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (err: any) {
              Alert.alert('Gagal', err.message);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (loadingWarehouse) {
    return (
      <View style={[styles.container, styles.loadingWrap]}>
        <ActivityIndicator size="large" color="#347385" />
        <Text style={styles.loadingText}>Memuat data gudang...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A202C" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Catat Pembelian</Text>
          {warehouse ? (
            <Text style={styles.headerSubtitle}>{warehouse.name}</Text>
          ) : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            isTablet && styles.scrollContentTablet,
          ]}
        >
          <View style={[styles.inner, isTablet && styles.innerTablet]}>
            {/* Supplier */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Supplier</Text>

              <TouchableOpacity
                style={[
                  styles.supplierSelector,
                  selectedSupplier && styles.supplierSelectorSelected,
                ]}
                onPress={() => setSupplierPickerVisible(true)}
                activeOpacity={0.8}
              >
                {selectedSupplier ? (
                  <View style={styles.supplierSelectedContent}>
                    <View style={styles.supplierAvatar}>
                      <Text style={styles.supplierAvatarText}>
                        {selectedSupplier.name.substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.supplierSelectedName}>{selectedSupplier.name}</Text>
                      {selectedSupplier.phone ? (
                        <Text style={styles.supplierSelectedPhone}>{selectedSupplier.phone}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-down" size={18} color="#347385" />
                  </View>
                ) : (
                  <View style={styles.supplierPlaceholder}>
                    <Ionicons name="people-outline" size={20} color="#9CA3AF" />
                    <Text style={styles.supplierPlaceholderText}>Pilih atau tambah supplier...</Text>
                    <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
                  </View>
                )}
              </TouchableOpacity>

              {selectedSupplier ? (
                <TouchableOpacity
                  style={styles.clearSupplierBtn}
                  onPress={() => setSelectedSupplier(null)}
                >
                  <Ionicons name="close-circle-outline" size={14} color="#EF4444" />
                  <Text style={styles.clearSupplierText}>Hapus pilihan</Text>
                </TouchableOpacity>
              ) : null}

              {/* Notes */}
              <View ref={notesRef}>
                <TextInput
                  style={[styles.input, { minHeight: 60, marginTop: 8 }]}
                  placeholder="Catatan (opsional)"
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
            </View>

            {/* Items */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Daftar Produk</Text>
                <TouchableOpacity
                  style={styles.addItemBtn}
                  onPress={() => setShowProductModal(true)}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.addItemBtnText}>Tambah</Text>
                </TouchableOpacity>
              </View>

              {items.length === 0 ? (
                <View style={styles.emptyItems}>
                  <Ionicons name="cube-outline" size={36} color="#CBD5E0" />
                  <Text style={styles.emptyItemsText}>Belum ada produk</Text>
                </View>
              ) : (
                items.map((item, idx) => (
                  <View key={idx} style={styles.itemCard}>
                    <View style={styles.itemCardHeader}>
                      <TextInput
                        style={styles.itemNameInput}
                        value={item.productName}
                        onChangeText={v => updateItem(idx, 'productName', v)}
                        placeholder="Nama produk"
                        placeholderTextColor="#A0AEC0"
                      />
                      <TouchableOpacity onPress={() => removeItem(idx)} style={styles.removeBtn}>
                        <Ionicons name="close-circle" size={20} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.itemFields}>
                      <View style={styles.itemField}>
                        <Text style={styles.itemFieldLabel}>Jumlah</Text>
                        <TextInput
                          style={styles.itemFieldInput}
                          value={item.quantity.toString()}
                          onChangeText={v => updateItem(idx, 'quantity', parseInt(v) || 0)}
                          keyboardType="number-pad"
                          placeholder="0"
                          placeholderTextColor="#A0AEC0"
                        />
                      </View>
                      <View style={styles.itemField}>
                        <Text style={styles.itemFieldLabel}>Harga Beli</Text>
                        <TextInput
                          style={styles.itemFieldInput}
                          value={item.costPrice ? item.costPrice.toString() : ''}
                          onChangeText={v => updateItem(idx, 'costPrice', parseInt(v) || 0)}
                          keyboardType="number-pad"
                          placeholder="0"
                          placeholderTextColor="#A0AEC0"
                        />
                      </View>
                      <View style={styles.itemField}>
                        <Text style={styles.itemFieldLabel}>Subtotal</Text>
                        <Text style={styles.itemSubtotal}>
                          {fmtCurrency(item.quantity * item.costPrice)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Total */}
            {items.length > 0 ? (
              <View style={styles.totalCard}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Item</Text>
                  <Text style={styles.totalValue}>{totalItems}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabelBig}>Total Pembelian</Text>
                  <Text style={styles.totalValueBig}>{fmtCurrency(totalAmount)}</Text>
                </View>
              </View>
            ) : null}

            {/* Actions */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.draftBtn, saving && styles.btnDisabled]}
                onPress={handleSaveDraft}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#347385" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={18} color="#347385" />
                    <Text style={styles.draftBtnText}>Simpan Draft</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.receiveBtn, saving && styles.btnDisabled]}
                onPress={handleReceive}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.receiveBtnText}>Tandai Diterima</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Product Picker Modal */}
      <Modal
        visible={showProductModal}
        animationType="slide"
        onRequestClose={() => setShowProductModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
            <Text style={styles.modalTitle}>Pilih Produk</Text>
            <View style={styles.modalHeaderActions}>
              <TouchableOpacity
                style={[styles.scanToggleBtn, scanMode && styles.scanToggleBtnActive]}
                onPress={async () => {
                  if (!scanMode) {
                    if (!permission?.granted) {
                      const result = await requestPermission();
                      if (!result.granted) {
                        Alert.alert('Izin Ditolak', 'Izinkan akses kamera untuk scan barcode.');
                        return;
                      }
                    }
                    scanBlocked.current = false;
                  }
                  setScanMode(v => !v);
                }}
              >
                <Ionicons
                  name={scanMode ? 'close' : 'barcode-outline'}
                  size={20}
                  color={scanMode ? '#fff' : '#347385'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowProductModal(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={24} color="#1A202C" />
              </TouchableOpacity>
            </View>
          </View>

          {scanMode ? (
            <View style={styles.scanContainer}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'qr'],
                }}
                onBarcodeScanned={handleBarcodeScan}
              />
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={styles.vfTop} />
                <View style={styles.vfMiddle}>
                  <View style={styles.vfSide} />
                  <View style={styles.vfBox}>
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                    <View style={styles.scanLine} />
                  </View>
                  <View style={styles.vfSide} />
                </View>
                <View style={styles.vfBottom} />
              </View>
              <View style={styles.scanHintWrap} pointerEvents="none">
                <Text style={styles.scanHintText}>Arahkan ke barcode produk</Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.modalSearch}>
                <Ionicons name="search" size={18} color="#A0AEC0" />
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Cari produk..."
                  value={productSearch}
                  onChangeText={setProductSearch}
                  autoFocus
                  placeholderTextColor="#A0AEC0"
                />
                {productSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setProductSearch('')}>
                    <Ionicons name="close-circle" size={18} color="#A0AEC0" />
                  </TouchableOpacity>
                )}
              </View>

              {selectedProductIds.size > 0 && (
                <View style={styles.selectionBar}>
                  <Text style={styles.selectionBarText}>
                    {selectedProductIds.size} produk dipilih
                  </Text>
                  <TouchableOpacity onPress={() => setSelectedProductIds(new Set())}>
                    <Text style={styles.selectionBarClear}>Batal pilih</Text>
                  </TouchableOpacity>
                </View>
              )}

              <FlatList
                data={filteredProducts}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.modalList}
                renderItem={({ item }) => {
                  const alreadyAdded = items.some(i => i.productId === item.id);
                  const isSelected = selectedProductIds.has(item.id);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.modalProductRow,
                        isSelected && styles.modalProductRowSelected,
                        alreadyAdded && styles.modalProductRowAdded,
                      ]}
                      onPress={() => !alreadyAdded && toggleProductSelect(item)}
                      activeOpacity={alreadyAdded ? 1 : 0.7}
                    >
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                        {alreadyAdded && !isSelected && <Ionicons name="checkmark" size={14} color="#9CA3AF" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalProductName}>{item.name}</Text>
                        <Text style={styles.modalProductMeta}>
                          Stok: {item.stock} · Harga Beli: Rp {(item.cost_price ?? 0).toLocaleString('id-ID')}
                        </Text>
                        {alreadyAdded && (
                          <Text style={styles.alreadyAddedText}>Sudah ditambahkan</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListFooterComponent={
                  productSearch.trim() ? (
                    <TouchableOpacity style={styles.manualAddBtn} onPress={addManual}>
                      <Ionicons name="create-outline" size={18} color="#347385" />
                      <Text style={styles.manualAddText}>
                        Tambah "{productSearch}" secara manual
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
              />

              <View style={[styles.confirmBar, { paddingBottom: insets.bottom + 12 }]}>
                <TouchableOpacity
                  style={[
                    styles.confirmBtn,
                    selectedProductIds.size === 0 && styles.confirmBtnDisabled,
                  ]}
                  onPress={confirmProductSelection}
                  disabled={selectedProductIds.size === 0}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.confirmBtnText}>
                    {selectedProductIds.size === 0
                      ? 'Pilih produk terlebih dahulu'
                      : `Tambahkan ${selectedProductIds.size} Produk`}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Supplier Picker Sheet */}
      <SupplierPickerSheet
        visible={supplierPickerVisible}
        onClose={() => setSupplierPickerVisible(false)}
        onSelect={s => setSelectedSupplier(s)}
        selectedId={selectedSupplier?.id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  loadingWrap: { justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#718096' },

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

  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  scrollContentTablet: {
    alignItems: 'center',
  },
  inner: {
    padding: 16,
    gap: 14,
    width: '100%',
  },
  innerTablet: {
    maxWidth: 680,
  },

  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1A202C' },

  supplierSelector: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    overflow: 'hidden',
  },
  supplierSelectorSelected: { borderColor: '#347385', backgroundColor: '#EEF8FA' },
  supplierPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  supplierPlaceholderText: { flex: 1, fontSize: 14, color: '#9CA3AF' },
  supplierSelectedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  supplierAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  supplierAvatarText: { fontSize: 13, fontWeight: '800', color: '#347385' },
  supplierSelectedName: { fontSize: 14, fontWeight: '700', color: '#1A4F5C' },
  supplierSelectedPhone: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  clearSupplierBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  clearSupplierText: { fontSize: 12, color: '#EF4444' },

  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A202C',
  },

  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#347385',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addItemBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  emptyItems: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyItemsText: { fontSize: 14, color: '#A0AEC0' },

  itemCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  itemCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemNameInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1A202C',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 4,
  },
  removeBtn: { padding: 4 },
  itemFields: { flexDirection: 'row', gap: 8 },
  itemField: { flex: 1, gap: 4 },
  itemFieldLabel: { fontSize: 11, color: '#718096', fontWeight: '500' },
  itemFieldInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    color: '#1A202C',
    textAlign: 'right',
  },
  itemSubtotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#347385',
    textAlign: 'right',
    paddingVertical: 8,
  },

  totalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 14, color: '#718096' },
  totalValue: { fontSize: 14, fontWeight: '600', color: '#1A202C' },
  totalLabelBig: { fontSize: 16, fontWeight: '700', color: '#1A202C' },
  totalValueBig: { fontSize: 20, fontWeight: 'bold', color: '#347385' },

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
  receiveBtn: { backgroundColor: '#22C55E' },
  receiveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  // Product modal
  modalContainer: { flex: 1, backgroundColor: '#F7FAFC' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A202C', flex: 1 },
  modalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#347385',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EEF8FA',
  },
  scanToggleBtnActive: { backgroundColor: '#347385', borderColor: '#347385' },
  modalCloseBtn: { padding: 2 },

  scanContainer: { flex: 1, backgroundColor: '#000' },
  vfTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  vfMiddle: { flexDirection: 'row', height: 220 },
  vfSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  vfBox: { width: 220, height: 220 },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#fff', borderWidth: 0 },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  scanLine: {
    position: 'absolute',
    top: '50%',
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: '#347385',
    shadowColor: '#347385',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  vfBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  scanHintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '60%',
    alignItems: 'center',
  },
  scanHintText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },

  modalSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalSearchInput: { flex: 1, height: 44, fontSize: 14, color: '#1A202C' },
  modalList: { padding: 16, gap: 8 },
  modalProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  modalProductName: { fontSize: 14, fontWeight: '600', color: '#1A202C' },
  modalProductMeta: { fontSize: 12, color: '#718096', marginTop: 2 },
  modalProductRowSelected: {
    borderColor: '#347385',
    backgroundColor: '#EEF8FA',
  },
  modalProductRowAdded: {
    opacity: 0.5,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#347385', borderColor: '#347385',
  },
  alreadyAddedText: { fontSize: 11, color: '#9CA3AF', marginTop: 2, fontStyle: 'italic' },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF8FA',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#D4EFF4',
  },
  selectionBarText: { fontSize: 13, fontWeight: '700', color: '#347385' },
  selectionBarClear: { fontSize: 13, color: '#EF4444', fontWeight: '600' },
  confirmBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#347385',
    paddingVertical: 14, borderRadius: 12,
  },
  confirmBtnDisabled: { backgroundColor: '#A0AEC0' },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  manualAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF8FA',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#347385',
  },
  manualAddText: { fontSize: 14, color: '#347385', fontWeight: '600' },
});
