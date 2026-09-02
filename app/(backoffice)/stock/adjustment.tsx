/**
 * Stock Adjustment Screen
 * Create stock addition or reduction with reason
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProductStore, type Product } from '@/store/productStore';
import { useStockStore } from '@/store/stockStore';
import { TabletCenteredView } from '@/components/TabletCenteredView';

type AdjustmentType = 'reduction';

const REDUCTION_SUBTYPES = [
  { key: 'rusak', label: 'Rusak / Cacat', icon: 'alert-circle' },
  { key: 'hilang', label: 'Hilang / Susut', icon: 'help-circle' },
  { key: 'kadaluarsa', label: 'Kadaluarsa', icon: 'time' },
];

export default function AdjustmentScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { products, syncFromSupabase } = useProductStore();
  const { createAdjustment, isLoading } = useStockStore();

  // Step: 'product' | 'type' | 'confirm'
  const [step, setStep] = useState<'product' | 'form' | 'confirm'>('product');

  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const adjType: AdjustmentType = 'reduction';
  const [subType, setSubType] = useState('rusak');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  const activeProducts = useMemo(
    () => products.filter((p) => p.is_active === 1),
    [products]
  );

  const filteredProducts = useMemo(() => {
    if (!productSearch) return activeProducts;
    const q = productSearch.toLowerCase();
    return activeProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
    );
  }, [activeProducts, productSearch]);

  const subtypes = REDUCTION_SUBTYPES;

  const qty = parseInt(quantity) || 0;
  const qtyAfter = selectedProduct ? Math.max(0, selectedProduct.stock - qty) : 0;

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setStep('form');
    setSubType('rusak');
    setQuantity('');
    setReason('');
  };

  const handleSubmit = async () => {
    if (!selectedProduct) return;
    if (!qty || qty <= 0) {
      Alert.alert('Perhatian', 'Masukkan jumlah yang valid (lebih dari 0)');
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Perhatian', 'Alasan harus diisi');
      return;
    }

    try {
      await createAdjustment({
        productId: selectedProduct.id,
        type: adjType,
        subType,
        quantity: qty,
        reason: reason.trim(),
      });

      syncFromSupabase().catch(() => {});

      Alert.alert(
        'Berhasil',
        `Penyesuaian stok ${selectedProduct.name} berhasil disimpan.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert('Gagal', err.message || 'Terjadi kesalahan');
    }
  };

  // ── STEP 1: Pilih Produk ──────────────────────────────────
  if (step === 'product') {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A202C" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Penyesuaian Stok</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#A0AEC0" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari produk atau scan barcode..."
            value={productSearch}
            onChangeText={setProductSearch}
            placeholderTextColor="#A0AEC0"
            autoFocus
          />
          {productSearch.length > 0 && (
            <TouchableOpacity onPress={() => setProductSearch('')}>
              <Ionicons name="close-circle" size={18} color="#A0AEC0" />
            </TouchableOpacity>
          )}
        </View>

        <TabletCenteredView maxWidth={800}>
          <FlatList
            data={filteredProducts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.productRow}
              onPress={() => handleSelectProduct(item)}
            >
              <View style={styles.productAvatar}>
                <Text style={styles.productAvatarText}>
                  {item.name.substring(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.productName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.productMeta}>
                  Stok: {item.stock} {item.unit || 'pcs'}
                  {item.barcode ? ` · ${item.barcode}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E0" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="cube-outline" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>Produk tidak ditemukan</Text>
            </View>
          }
        />
        </TabletCenteredView>
      </View>
    );
  }

  // ── STEP 2: Form Penyesuaian ──────────────────────────────
  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => setStep('product')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Penyesuaian Stok</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[styles.formContent, isTablet && { maxWidth: 680, alignSelf: 'center', width: '100%' }]}>
        {/* Product Card */}
        <View style={styles.selectedProductCard}>
          <View style={styles.productAvatar}>
            <Text style={styles.productAvatarText}>
              {selectedProduct!.name.substring(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.productName}>{selectedProduct!.name}</Text>
            <Text style={styles.productMeta}>
              Stok saat ini: <Text style={{ fontWeight: '700', color: '#1A202C' }}>{selectedProduct!.stock}</Text>{' '}
              {selectedProduct!.unit || 'pcs'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setStep('product')}>
            <Text style={styles.changeBtn}>Ganti</Text>
          </TouchableOpacity>
        </View>


        {/* Sub-type */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Kategori</Text>
          <View style={styles.subtypeGrid}>
            {subtypes.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.subtypeChip, subType === s.key && styles.subtypeChipActive]}
                onPress={() => setSubType(s.key)}
              >
                <Ionicons
                  name={s.icon as any}
                  size={16}
                  color={subType === s.key ? '#fff' : '#4A5568'}
                />
                <Text
                  style={[
                    styles.subtypeText,
                    subType === s.key && styles.subtypeTextActive,
                  ]}
                >
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Quantity */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Jumlah ({selectedProduct!.unit || 'pcs'})</Text>
          <TextInput
            style={styles.qtyInput}
            keyboardType="number-pad"
            value={quantity}
            onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ''))}
            placeholder="0"
            placeholderTextColor="#CBD5E0"
          />
        </View>

        {/* Alasan */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Alasan <Text style={{ color: '#EF4444' }}>*</Text></Text>
          <TextInput
            style={styles.reasonInput}
            value={reason}
            onChangeText={setReason}
            placeholder="Tuliskan alasan penyesuaian..."
            placeholderTextColor="#A0AEC0"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Preview */}
        {qty > 0 && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Preview Perubahan Stok</Text>
            <View style={styles.previewRow}>
              <View style={styles.previewItem}>
                <Text style={styles.previewLabel}>Sebelum</Text>
                <Text style={styles.previewValue}>{selectedProduct!.stock}</Text>
              </View>
              <Ionicons
                name={adjType === 'addition' ? 'arrow-forward' : 'arrow-forward'}
                size={24}
                color="#718096"
              />
              <View style={styles.previewItem}>
                <Text style={styles.previewLabel}>Sesudah</Text>
                <Text style={[styles.previewValue, styles.previewRed]}>
                  {qtyAfter}
                </Text>
              </View>
              <View style={styles.previewItem}>
                <Text style={styles.previewLabel}>Selisih</Text>
                <Text
                  style={[styles.previewDiff, styles.previewRed]}
                >
                  -{qty}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (!qty || !reason.trim() || isLoading) && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!qty || !reason.trim() || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.submitBtnText}>Simpan Penyesuaian</Text>
            </>
          )}
        </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#1A202C', textAlign: 'center' },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, height: 44, fontSize: 14, color: '#1A202C' },

  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  productAvatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productAvatarText: { fontSize: 14, fontWeight: 'bold', color: '#347385' },
  productName: { fontSize: 14, fontWeight: '600', color: '#1A202C' },
  productMeta: { fontSize: 12, color: '#718096', marginTop: 2 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#A0AEC0' },

  formContent: { padding: 16, gap: 12, paddingBottom: 40 },

  selectedProductCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  changeBtn: { fontSize: 13, color: '#347385', fontWeight: '600' },

  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#4A5568' },

  subtypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subtypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subtypeChipActive: { backgroundColor: '#347385', borderColor: '#347385' },
  subtypeText: { fontSize: 13, color: '#4A5568' },
  subtypeTextActive: { color: '#fff', fontWeight: '600' },

  qtyInput: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1A202C',
    textAlign: 'center',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#347385',
  },

  reasonInput: {
    fontSize: 14,
    color: '#1A202C',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    minHeight: 80,
  },

  previewCard: {
    backgroundColor: '#EEF8FA',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  previewTitle: { fontSize: 13, fontWeight: '600', color: '#4338CA', textAlign: 'center' },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  previewItem: { alignItems: 'center', gap: 4 },
  previewLabel: { fontSize: 12, color: '#6B7280' },
  previewValue: { fontSize: 28, fontWeight: 'bold', color: '#1A202C' },
  previewDiff: { fontSize: 20, fontWeight: 'bold' },
  previewGreen: { color: '#22C55E' },
  previewRed: { color: '#EF4444' },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#347385',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
