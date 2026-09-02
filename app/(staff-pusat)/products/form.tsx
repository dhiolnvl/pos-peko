import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Image, StyleSheet, ActivityIndicator, Alert, Modal,
  KeyboardAvoidingView, Platform, useWindowDimensions, Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useProductStore } from '@/store/productStore';
import { supabase } from '@/lib/supabase';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { BarcodePreview } from '@/components/BarcodePreview';
import { printProductLabel } from '@/lib/printerHelper';
import { ProductBarcodeScanner } from '@/components/ProductBarcodeScanner';
import { OFFProductPreview } from '@/components/OFFProductPreview';
import { NumpadInput } from '@/components/NumpadInput';
import { uploadOFFImageToStorage, type OFFProduct } from '@/lib/openFoodFacts';
import { uploadProductImage } from '@/lib/imageUpload';

type Step = 1 | 2 | 3;

interface BranchOption { id: string; name: string; }

interface UnitRow {
  id?: string;
  label: string;
  price: string;
  multiplier: string;
  is_default: boolean;
}

const fmt = (raw: string) => {
  const digits = raw.replace(/\./g, '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  return parseInt(digits, 10).toLocaleString('id-ID');
};
const parse = (s: string) => parseInt(s.replace(/\./g, ''), 10) || 0;

export default function OwnerProductFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 768;
  const scrollRef = useRef<ScrollView>(null);

  const { products, allProducts, categories, loadCategories, loadProducts, fetchProductUnits, saveProductUnits } = useProductStore();

  const isEdit = !!id;
  const existingProduct = isEdit ? (allProducts.find((p) => p.id === id) ?? products.find((p) => p.id === id)) : null;

  // Form state
  const [name, setName] = useState(existingProduct?.name ?? '');
  const [categoryId, setCategoryId] = useState(existingProduct?.category_id ?? '');
  const [price, setPrice] = useState(existingProduct?.price ? String(existingProduct.price) : '0');
  const [costPrice, setCostPrice] = useState(existingProduct?.cost_price ? existingProduct.cost_price.toLocaleString('id-ID') : '');
  const [unit, setUnit] = useState(existingProduct?.unit ?? 'pcs');
  const [barcode, setBarcode] = useState(existingProduct?.barcode ?? '');
  const [imageUrl, setImageUrl] = useState(existingProduct?.image_url ?? '');

  // Promo state
  const [promoEnabled, setPromoEnabled] = useState(!!existingProduct?.promo_price);
  const [promoPrice, setPromoPrice] = useState(existingProduct?.promo_price ? String(existingProduct.promo_price) : '');
  const [promoStart, setPromoStart] = useState<Date | null>(existingProduct?.promo_start ? new Date(existingProduct.promo_start) : null);
  const [promoEnd, setPromoEnd] = useState<Date | null>(existingProduct?.promo_end ? new Date(existingProduct.promo_end) : null);
  const [showPromoStartPicker, setShowPromoStartPicker] = useState(false);
  const [showPromoEndPicker, setShowPromoEndPicker] = useState(false);

  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());
  const [branchStock, setBranchStock] = useState<Record<string, string>>({});
  const [branchMinStock, setBranchMinStock] = useState<Record<string, string>>({});
  // Untuk step 2 numpad: stok aktif per cabang (satu per satu)
  const [activeBranchIdx, setActiveBranchIdx] = useState(0);

  const [unitRows, setUnitRows] = useState<UnitRow[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [isPrintingLabel, setIsPrintingLabel] = useState(false);
  const [printMode, setPrintMode] = useState<'barcode' | 'qr'>('barcode');

  const [step, setStep] = useState<Step>(isEdit ? 3 : 1);

  const [showScanner, setShowScanner] = useState(false);
  const [offProduct, setOffProduct] = useState<OFFProduct | null>(null);
  const [showOFFPreview, setShowOFFPreview] = useState(false);
  const [isUploadingOFFImage, setIsUploadingOFFImage] = useState(false);
  const [duplicateProduct, setDuplicateProduct] = useState<{ id: string; name: string; barcode: string } | null>(null);

  useEffect(() => {
    loadCategories();
    loadBranches();
    if (allProducts.length === 0) loadProducts({ reset: true });
    if (isEdit && id) loadUnits(id);
    if (!isEdit) {
      // Reset semua field agar tidak ada sisa data dari sesi edit sebelumnya
      setName(''); setBarcode(''); setPrice('0'); setCostPrice('');
      setImageUrl(''); setCategoryId(''); setUnit('pcs');
      setUnitRows([]); setErrors({}); setSelectedBranchIds(new Set());
      setActiveBranchIdx(0); setStep(1);
      setTimeout(() => setShowScanner(true), 300);
    }
  }, []);

  // Isi ulang form setelah data produk tersedia (load async)
  // Fetch langsung dari Supabase saat id berubah — tidak bergantung cache
  useEffect(() => {
    if (!isEdit || !id) return;
    supabase
      .from('products')
      .select('*, categories!category_id(name)')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setName(data.name ?? '');
        setCategoryId(data.category_id ?? '');
        setPrice(data.price ? String(data.price) : '0');
        setCostPrice(data.cost_price ? data.cost_price.toLocaleString('id-ID') : '');
        setUnit(data.unit ?? 'pcs');
        setBarcode(data.barcode ?? '');
        setImageUrl(data.image_url ?? '');
        setPromoEnabled(!!data.promo_price);
        setPromoPrice(data.promo_price ? String(data.promo_price) : '');
        setPromoStart(data.promo_start ? new Date(data.promo_start) : null);
        setPromoEnd(data.promo_end ? new Date(data.promo_end) : null);
      });
  }, [id]);

  const loadBranches = async () => {
    try {
      const { data } = await supabase
        .from('branches').select('id, name').eq('is_active', true).order('name', { ascending: true });
      setBranches(data ?? []);

      if (isEdit && id) {
        const { data: bp } = await supabase
          .from('branch_products').select('branch_id, stock, min_stock').eq('product_id', id);
        const ids = new Set<string>();
        const stockMap: Record<string, string> = {};
        const minStockMap: Record<string, string> = {};
        for (const row of bp ?? []) {
          ids.add(row.branch_id);
          stockMap[row.branch_id] = row.stock?.toString() ?? '0';
          minStockMap[row.branch_id] = row.min_stock?.toString() ?? '5';
        }
        setSelectedBranchIds(ids);
        setBranchStock(stockMap);
        setBranchMinStock(minStockMap);
      } else {
        const allIds = new Set<string>((data ?? []).map((b: BranchOption) => b.id));
        setSelectedBranchIds(allIds);
        const stockMap: Record<string, string> = {};
        const minStockMap: Record<string, string> = {};
        for (const b of data ?? []) { stockMap[b.id] = '0'; minStockMap[b.id] = '5'; }
        setBranchStock(stockMap);
        setBranchMinStock(minStockMap);
      }
    } catch (e) { console.error('[OwnerProductForm] loadBranches:', e); }
  };

  const loadUnits = async (productId: string) => {
    setLoadingUnits(true);
    try {
      const data = await fetchProductUnits(productId);
      setUnitRows(data.map((u) => ({
        id: u.id, label: u.label,
        price: u.price.toLocaleString('id-ID'),
        multiplier: u.multiplier.toString(),
        is_default: u.is_default,
      })));
    } catch {}
    setLoadingUnits(false);
  };

  const toggleBranch = (branchId: string) => {
    if (isEdit) return;
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) { next.delete(branchId); }
      else {
        next.add(branchId);
        if (!branchStock[branchId]) {
          setBranchStock((s) => ({ ...s, [branchId]: '0' }));
          setBranchMinStock((s) => ({ ...s, [branchId]: '5' }));
        }
      }
      return next;
    });
  };

  const toggleAllBranches = () => {
    if (isEdit) return;
    if (selectedBranchIds.size === branches.length) {
      setSelectedBranchIds(new Set());
    } else {
      const allIds = new Set(branches.map((b) => b.id));
      setSelectedBranchIds(allIds);
      const stockMap = { ...branchStock };
      const minStockMap = { ...branchMinStock };
      for (const b of branches) {
        if (!stockMap[b.id]) stockMap[b.id] = '0';
        if (!minStockMap[b.id]) minStockMap[b.id] = '5';
      }
      setBranchStock(stockMap);
      setBranchMinStock(minStockMap);
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Izin Ditolak', 'Aplikasi memerlukan akses galeri untuk memilih foto produk.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'Images' as any, allowsEditing: true, aspect: [1, 1], quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) setImageUrl(result.assets[0].uri);
    } catch { Alert.alert('Error', 'Gagal memilih gambar'); }
  };

  const addUnitRow = () => {
    setUnitRows((prev) => [...prev, { label: '', price: '0', multiplier: '1', is_default: prev.length === 0 }]);
  };

  const removeUnitRow = (index: number) => {
    setUnitRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (prev[index].is_default && next.length > 0) next[0] = { ...next[0], is_default: true };
      return next;
    });
  };

  const updateUnitRow = (index: number, field: keyof UnitRow, value: string | boolean) => {
    setUnitRows((prev) => {
      const next = [...prev];
      if (field === 'is_default') return next.map((row, i) => ({ ...row, is_default: i === index }));
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleOFFFound = (product: OFFProduct) => {
    setShowScanner(false); setOffProduct(product); setShowOFFPreview(true);
  };

  const handleOFFNotFound = (scannedBarcode: string) => {
    setShowScanner(false); setBarcode(scannedBarcode); setStep(1);
  };

  const handleExistingFound = (scannedBarcode: string): boolean => {
    const found = allProducts.find(
      (p) => p.barcode?.toLowerCase() === scannedBarcode.toLowerCase()
    );
    if (!found) return false;
    setShowScanner(false);
    setDuplicateProduct({ id: found.id, name: found.name, barcode: scannedBarcode });
    return true;
  };

  const handleOFFConfirm = async (chosenName: string) => {
    if (!offProduct) return;
    setIsUploadingOFFImage(true);
    try {
      let finalImageUrl = imageUrl;
      if (offProduct.image_url && !imageUrl) {
        const uploaded = await uploadOFFImageToStorage(offProduct.image_url, offProduct.barcode);
        finalImageUrl = uploaded ?? offProduct.image_url;
      }
      setName(chosenName || offProduct.name || name);
      setBarcode(offProduct.barcode);
      if (finalImageUrl) setImageUrl(finalImageUrl);
    } finally {
      setIsUploadingOFFImage(false); setShowOFFPreview(false); setOffProduct(null); setStep(1);
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Nama produk harus diisi';
    if (selectedBranchIds.size === 0) e.branches = 'Pilih minimal satu cabang';
    const priceNum = unitRows.length > 0
      ? parse(unitRows.find((u) => u.is_default)?.price ?? unitRows[0].price)
      : parseInt(price);
    if (priceNum <= 0) e.price = 'Harga jual harus lebih dari 0';
    unitRows.forEach((row, i) => {
      if (!row.label.trim()) e[`unit_label_${i}`] = 'Nama satuan harus diisi';
      if (parse(row.price) <= 0) e[`unit_price_${i}`] = 'Harga harus lebih dari 0';
      if (!row.multiplier || parseInt(row.multiplier) <= 0) e[`unit_multiplier_${i}`] = 'Isi harus lebih dari 0';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      setIsLoading(true);
      const priceNum = unitRows.length > 0
        ? parse(unitRows.find((u) => u.is_default)?.price ?? unitRows[0].price)
        : parseInt(price);

      const newId = isEdit ? id! : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

      let finalImageUrl = imageUrl;
      if (imageUrl && imageUrl.startsWith('file://')) {
        const uploaded = await uploadProductImage(imageUrl, newId);
        if (uploaded) finalImageUrl = uploaded;
      }

      const productData = {
        name: name.trim(),
        category_id: categoryId || null,
        price: priceNum,
        cost_price: costPrice ? parse(costPrice) : null,
        unit: unit.trim() || 'pcs',
        barcode: barcode.trim() || null,
        image_url: finalImageUrl || null,
        is_active: true,
        promo_price: promoEnabled && promoPrice ? parse(promoPrice) : null,
        promo_start: promoEnabled && promoStart ? promoStart.toISOString().slice(0, 10) : null,
        promo_end: promoEnabled && promoEnd ? promoEnd.toISOString().slice(0, 10) : null,
      };

      let productId = id;

      if (isEdit && id) {
        const now = new Date().toISOString();
        const { error } = await supabase.from('products').update({ ...productData, updated_at: now }).eq('id', id);
        if (error) throw new Error(error.message);
      } else {
        const now = new Date().toISOString();
        const { error } = await supabase.from('products').insert({ id: newId, ...productData, created_at: now, updated_at: now });
        if (error) throw new Error(error.message);
        productId = newId;
      }

      const selectedArr = Array.from(selectedBranchIds);
      const now = new Date().toISOString();
      if (selectedArr.length > 0) {
        const upsertRows = selectedArr.map((bId) => ({
          branch_id: bId, product_id: productId!,
          // stok hanya diset saat tambah produk baru, edit tidak boleh mengubah stok
          ...(isEdit ? {} : { stock: parseInt(branchStock[bId] ?? '0') || 0 }),
          min_stock: parseInt(branchMinStock[bId] ?? '5') || 5,
          is_available: true, updated_at: now,
        }));
        const { error: upsertErr } = await supabase.from('branch_products').upsert(upsertRows, { onConflict: 'branch_id,product_id' });
        if (upsertErr) throw new Error(upsertErr.message);
      }
      if (isEdit && id) {
        const { error: delErr } = await supabase.from('branch_products').delete().eq('product_id', id)
          .not('branch_id', 'in', `(${selectedArr.length > 0 ? selectedArr.join(',') : 'null'})`);
        if (delErr) console.error('delete branch_products:', delErr);
      }

      if (productId) {
        if (unitRows.length > 0) {
          await saveProductUnits(productId, unitRows.map((u) => ({
            label: u.label.trim(), price: parse(u.price),
            multiplier: parseInt(u.multiplier) || 1, is_default: u.is_default,
          })));
        } else if (isEdit) {
          await saveProductUnits(productId, []);
        }
      }

      await useProductStore.getState().loadProducts({ reset: true });

      if (isEdit) {
        Alert.alert('Berhasil', 'Produk berhasil diperbarui', [{ text: 'OK', onPress: () => router.replace('/(staff-pusat)/products' as any) }]);
      } else {
        Alert.alert('Berhasil', 'Produk berhasil ditambahkan', [
          { text: 'Tambah Lagi', onPress: resetForm },
          { text: 'Selesai', onPress: () => router.replace('/(staff-pusat)/products' as any) },
        ]);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Gagal menyimpan produk');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName(''); setBarcode(''); setPrice('0'); setCostPrice('');
    setImageUrl(''); setCategoryId(''); setUnitRows([]); setErrors({});
    setActiveBranchIdx(0); setStep(1);
    setTimeout(() => setShowScanner(true), 200);
  };

  const currentPrice = unitRows.length > 0
    ? parse(unitRows.find((u) => u.is_default)?.price ?? unitRows[0]?.price ?? '0')
    : parseInt(price) || 0;

  const handlePrintLabel = async () => {
    setIsPrintingLabel(true);
    try {
      await printProductLabel({ name: name.trim() || 'Nama Produk', barcode: barcode.trim() || null, price: currentPrice, mode: printMode });
    } catch (e: any) {
      Alert.alert('Gagal Cetak', e.message ?? 'Printer tidak terhubung');
    } finally { setIsPrintingLabel(false); }
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const allSelected = selectedBranchIds.size === branches.length && branches.length > 0;
  const selectedBranchArr = branches.filter((b) => selectedBranchIds.has(b.id));

  const STEPS = [{ n: 1, label: 'Harga' }, { n: 2, label: 'Stok' }, { n: 3, label: 'Detail' }];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <OwnerPageHeader
        title={isEdit ? 'Edit Produk' : 'Tambah Produk'}
        onBack={() => router.replace('/(staff-pusat)/products' as any)}
        onSave={step === 3 ? handleSubmit : undefined}
        saving={isLoading}
      />

      {/* Step indicator — hanya mode tambah */}
      {!isEdit && (
        <View style={styles.stepBar}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s.n}>
              <TouchableOpacity
                style={styles.stepItem}
                onPress={() => step > s.n ? setStep(s.n as Step) : undefined}
              >
                <View style={[styles.stepCircle, step === s.n && styles.stepCircleActive, step > s.n && styles.stepCircleDone]}>
                  {step > s.n
                    ? <Ionicons name="checkmark" size={14} color="#fff" />
                    : <Text style={[styles.stepNum, step === s.n && styles.stepNumActive]}>{s.n}</Text>}
                </View>
                <Text style={[styles.stepLabel, step === s.n && styles.stepLabelActive]}>{s.label}</Text>
              </TouchableOpacity>
              {i < STEPS.length - 1 && <View style={[styles.stepLine, step > s.n && styles.stepLineDone]} />}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Produk strip — tampil setelah ada data */}
      {!isEdit && (name || barcode || imageUrl) && (
        <View style={styles.productStrip}>
          {imageUrl
            ? <Image source={{ uri: imageUrl }} style={styles.stripImage} />
            : <View style={styles.stripImagePlaceholder}><Ionicons name="cube-outline" size={18} color="#A0AEC0" /></View>}
          <View style={styles.stripInfo}>
            <Text style={styles.stripName} numberOfLines={1}>{name || 'Nama belum diisi'}</Text>
            {barcode ? <Text style={styles.stripBarcode}>{barcode}</Text> : null}
          </View>
          <TouchableOpacity onPress={() => setShowScanner(true)} style={styles.stripScan}>
            <Ionicons name="scan-outline" size={18} color="#347385" />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
          isTablet && { maxWidth: 640, alignSelf: 'center', width: '100%' },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* ===== STEP 1 — Harga ===== */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Harga Jual</Text>
            {errors.price ? <Text style={styles.errorTextCenter}>{errors.price}</Text> : null}
            <NumpadInput value={price} onChange={setPrice} prefix="Rp" />
            <TouchableOpacity
              style={[styles.nextBtn, parseInt(price) <= 0 && styles.nextBtnDisabled]}
              onPress={() => {
                if (parseInt(price) <= 0) { setErrors({ price: 'Harga jual harus lebih dari 0' }); return; }
                setErrors({}); setStep(2); setActiveBranchIdx(0);
              }}
            >
              <Text style={styles.nextBtnText}>Lanjut ke Stok</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* ===== STEP 2 — Stok per cabang ===== */}
        {step === 2 && (
          <View style={styles.stepContent}>
            {selectedBranchArr.length === 0 ? (
              <>
                <Text style={styles.stepTitle}>Stok Awal</Text>
                <Text style={styles.stepSubtitle}>Tidak ada cabang aktif</Text>
                <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(3)}>
                  <Text style={styles.nextBtnText}>Lanjut ke Detail</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Tabs cabang */}
                {selectedBranchArr.length > 1 && (
                  <View style={styles.branchTabs}>
                    {selectedBranchArr.map((b, i) => (
                      <TouchableOpacity
                        key={b.id}
                        style={[styles.branchTab, activeBranchIdx === i && styles.branchTabActive]}
                        onPress={() => setActiveBranchIdx(i)}
                      >
                        <Text style={[styles.branchTabText, activeBranchIdx === i && styles.branchTabTextActive]} numberOfLines={1}>
                          {b.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {selectedBranchArr[activeBranchIdx] && (
                  <>
                    <Text style={styles.stepTitle}>
                      Stok — {selectedBranchArr[activeBranchIdx].name}
                    </Text>
                    <NumpadInput
                      value={branchStock[selectedBranchArr[activeBranchIdx].id] ?? '0'}
                      onChange={(v) => setBranchStock((s) => ({ ...s, [selectedBranchArr[activeBranchIdx].id]: v }))}
                      prefix="Qty"
                    />
                  </>
                )}

                <View style={styles.rowBtns}>
                  {activeBranchIdx > 0 ? (
                    <TouchableOpacity style={styles.backBtn} onPress={() => setActiveBranchIdx(i => i - 1)}>
                      <Ionicons name="arrow-back" size={18} color="#347385" />
                      <Text style={styles.backBtnText}>Cabang Sebelumnya</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                      <Ionicons name="arrow-back" size={18} color="#347385" />
                      <Text style={styles.backBtnText}>Kembali</Text>
                    </TouchableOpacity>
                  )}

                  {activeBranchIdx < selectedBranchArr.length - 1 ? (
                    <TouchableOpacity style={styles.nextBtn} onPress={() => setActiveBranchIdx(i => i + 1)}>
                      <Text style={styles.nextBtnText}>Cabang Berikutnya</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(3)}>
                      <Text style={styles.nextBtnText}>Lanjut ke Detail</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        )}

        {/* ===== STEP 3 — Detail lengkap ===== */}
        {step === 3 && (
          <>
            {/* Ringkasan harga & stok — hanya mode tambah */}
            {!isEdit && (
              <View style={styles.summaryRow}>
                <TouchableOpacity style={styles.summaryItem} onPress={() => setStep(1)}>
                  <Text style={styles.summaryLabel}>Harga Jual</Text>
                  <Text style={styles.summaryValue}>Rp {parseInt(price).toLocaleString('id-ID')}</Text>
                  <Text style={styles.summaryEdit}>Ubah</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.summaryItem} onPress={() => { setActiveBranchIdx(0); setStep(2); }}>
                  <Text style={styles.summaryLabel}>Stok Cabang</Text>
                  <Text style={styles.summaryValue}>{selectedBranchArr.length} cabang</Text>
                  <Text style={styles.summaryEdit}>Ubah</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Scan banner — hanya mode tambah */}
            {!isEdit && (
              <TouchableOpacity style={styles.scanBanner} onPress={() => setShowScanner(true)} disabled={isLoading}>
                <View style={styles.scanBannerIcon}>
                  <Ionicons name="scan-outline" size={20} color="#347385" />
                </View>
                <View style={styles.scanBannerText}>
                  <Text style={styles.scanBannerTitle}>Scan Barcode Produk</Text>
                  <Text style={styles.scanBannerSub}>Isi form otomatis dari Master Produk</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#A0AEC0" />
              </TouchableOpacity>
            )}

            {/* Foto Produk */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Foto Produk</Text>
              <TouchableOpacity
                style={[styles.imagePicker, isTablet && { width: 200, height: 200, aspectRatio: undefined, alignSelf: 'flex-start' }]}
                onPress={pickImage}
              >
                {imageUrl
                  ? <Image source={{ uri: imageUrl }} style={styles.pickedImage} />
                  : <View style={styles.imagePlaceholder}>
                      <Ionicons name="camera" size={32} color="#A0AEC0" />
                      <Text style={styles.imagePlaceholderText}>Tap untuk pilih foto</Text>
                    </View>}
              </TouchableOpacity>
            </View>

            {/* Informasi Dasar */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Informasi Dasar</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Nama Produk <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={[styles.input, errors.name && styles.inputError]}
                  placeholder="Contoh: Royal Canin"
                  value={name} onChangeText={setName} editable={!isLoading}
                />
                {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Kategori</Text>
                <TouchableOpacity style={styles.picker} onPress={() => setShowCategoryPicker(!showCategoryPicker)} disabled={isLoading}>
                  <View style={styles.pickerContent}>
                    {selectedCategory
                      ? <Text style={styles.pickerText}>{selectedCategory.name}</Text>
                      : <Text style={styles.pickerPlaceholder}>Pilih kategori</Text>}
                  </View>
                  <Ionicons name="chevron-down" size={20} color="#A0AEC0" />
                </TouchableOpacity>
                {showCategoryPicker && (
                  <View style={styles.pickerOptions}>
                    <TouchableOpacity style={styles.pickerOption} onPress={() => { setCategoryId(''); setShowCategoryPicker(false); }}>
                      <Text style={styles.pickerOptionText}>Tanpa Kategori</Text>
                    </TouchableOpacity>
                    {categories.map((cat) => (
                      <TouchableOpacity key={cat.id} style={styles.pickerOption} onPress={() => { setCategoryId(cat.id); setShowCategoryPicker(false); }}>
                        <Text style={styles.pickerOptionText}>{cat.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Barcode</Text>
                <View style={styles.barcodeRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Scan atau ketik manual"
                    value={barcode} onChangeText={setBarcode} editable={!isLoading}
                  />
                  {(barcode.trim() || name.trim()) && (
                    <TouchableOpacity style={styles.labelPreviewBtn} onPress={() => setShowLabelModal(true)} disabled={isLoading}>
                      <Ionicons name="barcode-outline" size={20} color="#347385" />
                      <Text style={styles.labelPreviewBtnText}>Label</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {/* Cabang */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Tersedia di Cabang <Text style={styles.required}>*</Text></Text>
                {!isEdit && (
                  <TouchableOpacity onPress={toggleAllBranches} style={styles.selectAllBtn}>
                    <Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={16} color="#347385" />
                    <Text style={styles.selectAllText}>Semua</Text>
                  </TouchableOpacity>
                )}
              </View>
              {errors.branches && <Text style={[styles.errorText, { marginBottom: 8 }]}>{errors.branches}</Text>}
              {branches.map((b) => {
                const checked = selectedBranchIds.has(b.id);
                return (
                  <View key={b.id} style={styles.branchRow}>
                    <TouchableOpacity
                      style={[styles.branchCheckRow, isEdit && { opacity: 0.5 }]}
                      onPress={() => toggleBranch(b.id)}
                      disabled={isLoading || isEdit}
                      activeOpacity={isEdit ? 1 : 0.7}
                    >
                      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={checked ? '#347385' : '#CBD5E0'} />
                      <Text style={[styles.branchName, checked && styles.branchNameChecked]}>{b.name}</Text>
                      {isEdit && <Text style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 4 }}>(tidak dapat diubah)</Text>}
                    </TouchableOpacity>
                    {checked && (
                      <View style={styles.branchStockRow}>
                        {!isEdit && (
                          <View style={styles.branchStockField}>
                            <Text style={styles.branchStockLabel}>Stok Awal</Text>
                            <TextInput
                              style={styles.branchStockInput}
                              value={branchStock[b.id] ?? '0'}
                              onChangeText={(v) => setBranchStock((s) => ({ ...s, [b.id]: v.replace(/[^0-9]/g, '') }))}
                              onFocus={() => { if ((branchStock[b.id] ?? '0') === '0') setBranchStock(s => ({ ...s, [b.id]: '' })); }}
                              onBlur={() => { if (!branchStock[b.id]) setBranchStock(s => ({ ...s, [b.id]: '0' })); }}
                              keyboardType="numeric" editable={!isLoading}
                            />
                          </View>
                        )}
                        <View style={styles.branchStockField}>
                          <Text style={styles.branchStockLabel}>Min. Stok</Text>
                          <TextInput
                            style={styles.branchStockInput}
                            value={branchMinStock[b.id] ?? '5'}
                            onChangeText={(v) => setBranchMinStock((s) => ({ ...s, [b.id]: v.replace(/[^0-9]/g, '') }))}
                            keyboardType="numeric" editable={!isLoading}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Satuan & Harga */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Satuan & Harga</Text>
                <TouchableOpacity style={styles.addUnitBtn} onPress={addUnitRow} disabled={isLoading}>
                  <Ionicons name="add" size={16} color="#56B2C1" />
                  <Text style={styles.addUnitBtnText}>Tambah Satuan</Text>
                </TouchableOpacity>
              </View>

              {unitRows.length === 0 ? (
                <View style={styles.row}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Harga Jual <Text style={styles.required}>*</Text></Text>
                    <View style={[styles.priceInput, errors.price && styles.inputError]}>
                      <Text style={styles.currency}>Rp</Text>
                      <TextInput
                        style={styles.priceInputField}
                        placeholder="0"
                        value={parseInt(price) > 0 ? parseInt(price).toLocaleString('id-ID') : ''}
                        onChangeText={(v) => setPrice(v ? String(parse(v)) : '0')}
                        onFocus={() => { if (price === '0') setPrice(''); }}
                        onBlur={() => { if (!price) setPrice('0'); }}
                        keyboardType="numeric" editable={!isLoading}
                      />
                    </View>
                    {errors.price && <Text style={styles.errorText}>{errors.price}</Text>}
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Harga Beli</Text>
                    <View style={[styles.priceInput, errors.costPrice && styles.inputError]}>
                      <Text style={styles.currency}>Rp</Text>
                      <TextInput
                        style={styles.priceInputField}
                        placeholder="0"
                        value={costPrice}
                        onChangeText={(v) => setCostPrice(fmt(v))}
                        keyboardType="numeric" editable={!isLoading}
                      />
                    </View>
                    {errors.costPrice && <Text style={styles.errorText}>{errors.costPrice}</Text>}
                  </View>
                </View>
              ) : (
                loadingUnits ? <ActivityIndicator color="#347385" style={{ marginVertical: 16 }} /> :
                <>
                  {unitRows.map((row, index) => (
                    <View key={index} style={styles.unitCard}>
                      <View style={styles.unitCardHeader}>
                        <TouchableOpacity
                          style={[styles.defaultBadge, row.is_default && styles.defaultBadgeActive]}
                          onPress={() => updateUnitRow(index, 'is_default', true)}
                        >
                          <Ionicons name={row.is_default ? 'radio-button-on' : 'radio-button-off'} size={14} color={row.is_default ? '#56B2C1' : '#A0AEC0'} />
                          <Text style={[styles.defaultBadgeText, row.is_default && styles.defaultBadgeTextActive]}>Default</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeUnitRow(index)} style={styles.removeUnitBtn}>
                          <Ionicons name="trash-outline" size={16} color="#E53E3E" />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.row}>
                        <View style={[styles.field, { flex: 2 }]}>
                          <Text style={styles.label}>Nama Satuan <Text style={styles.required}>*</Text></Text>
                          <TextInput
                            style={[styles.input, errors[`unit_label_${index}`] && styles.inputError]}
                            placeholder="Pcs / Dus / Rentengan"
                            value={row.label} onChangeText={(v) => updateUnitRow(index, 'label', v)} editable={!isLoading}
                          />
                          {errors[`unit_label_${index}`] && <Text style={styles.errorText}>{errors[`unit_label_${index}`]}</Text>}
                        </View>
                        <View style={[styles.field, { flex: 1 }]}>
                          <Text style={styles.label}>Isi <Text style={styles.required}>*</Text></Text>
                          <TextInput
                            style={[styles.input, errors[`unit_multiplier_${index}`] && styles.inputError]}
                            placeholder="1"
                            value={row.multiplier}
                            onChangeText={(v) => updateUnitRow(index, 'multiplier', v.replace(/[^0-9]/g, ''))}
                            keyboardType="numeric" editable={!isLoading}
                          />
                          {errors[`unit_multiplier_${index}`] && <Text style={styles.errorText}>{errors[`unit_multiplier_${index}`]}</Text>}
                        </View>
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>Harga Jual <Text style={styles.required}>*</Text></Text>
                        <View style={[styles.priceInput, errors[`unit_price_${index}`] && styles.inputError]}>
                          <Text style={styles.currency}>Rp</Text>
                          <TextInput
                            style={styles.priceInputField}
                            placeholder="0"
                            value={row.price}
                            onChangeText={(v) => updateUnitRow(index, 'price', fmt(v))}
                            keyboardType="numeric" editable={!isLoading}
                          />
                        </View>
                        {errors[`unit_price_${index}`] && <Text style={styles.errorText}>{errors[`unit_price_${index}`]}</Text>}
                      </View>
                    </View>
                  ))}
                  <View style={styles.field}>
                    <Text style={styles.label}>Harga Beli</Text>
                    <View style={styles.priceInput}>
                      <Text style={styles.currency}>Rp</Text>
                      <TextInput style={styles.priceInputField} placeholder="0" value={costPrice} onChangeText={(v) => setCostPrice(fmt(v))} keyboardType="numeric" editable={!isLoading} />
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* Satuan Terkecil */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Satuan</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Satuan Terkecil</Text>
                <TextInput style={styles.input} placeholder="pcs" value={unit} onChangeText={setUnit} editable={!isLoading} />
                {unitRows.length > 0 && (
                  <Text style={styles.hint}>Stok dihitung dalam satuan terkecil ({unit || 'pcs'}). Beli 1 Dus (isi 24) = kurangi stok 24.</Text>
                )}
              </View>
            </View>

            {/* Harga Promo */}
            <View style={styles.section}>
              <View style={styles.promoHeader}>
                <Text style={styles.sectionTitle}>Harga Promo</Text>
                <Switch
                  value={promoEnabled}
                  onValueChange={(v) => {
                    setPromoEnabled(v);
                    if (!v) { setPromoPrice(''); setPromoStart(null); setPromoEnd(null); }
                  }}
                  trackColor={{ false: '#E5E7EB', true: '#347385' }}
                  thumbColor="#fff"
                />
              </View>
              {promoEnabled && (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Harga Promo</Text>
                    <NumpadInput
                      value={promoPrice}
                      onChange={setPromoPrice}
                      placeholder="0"
                      prefix="Rp"
                    />
                  </View>
                  <View style={[styles.field, { flexDirection: isTablet ? 'row' : 'column', gap: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Mulai</Text>
                      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPromoStartPicker(true)}>
                        <Ionicons name="calendar-outline" size={16} color="#347385" />
                        <Text style={styles.dateBtnText}>
                          {promoStart ? promoStart.toLocaleDateString('id-ID') : 'Pilih tanggal'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Selesai</Text>
                      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPromoEndPicker(true)}>
                        <Ionicons name="calendar-outline" size={16} color="#347385" />
                        <Text style={styles.dateBtnText}>
                          {promoEnd ? promoEnd.toLocaleDateString('id-ID') : 'Pilih tanggal'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {promoStart && promoEnd && parse(promoPrice) > 0 && (
                    <Text style={styles.hint}>
                      Promo aktif: Rp {parse(promoPrice).toLocaleString('id-ID')} berlaku {promoStart.toLocaleDateString('id-ID')} - {promoEnd.toLocaleDateString('id-ID')}
                    </Text>
                  )}
                </>
              )}
            </View>

            {showPromoStartPicker && (
              <DateTimePicker
                value={promoStart ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_e, date) => {
                  setShowPromoStartPicker(false);
                  if (date) setPromoStart(date);
                }}
              />
            )}
            {showPromoEndPicker && (
              <DateTimePicker
                value={promoEnd ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={promoStart ?? undefined}
                onChange={(_e, date) => {
                  setShowPromoEndPicker(false);
                  if (date) setPromoEnd(date);
                }}
              />
            )}
          </>
        )}
      </ScrollView>

      {/* Barcode Scanner */}
      <ProductBarcodeScanner
        visible={showScanner} onClose={() => setShowScanner(false)}
        onFound={handleOFFFound} onNotFound={handleOFFNotFound}
        onExistingFound={handleExistingFound}
      />

      {/* Modal produk sudah ada */}
      <Modal
        visible={!!duplicateProduct}
        transparent
        animationType="fade"
        onRequestClose={() => setDuplicateProduct(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.duplicateModal}>
            <View style={styles.duplicateIcon}>
              <Ionicons name="information-circle" size={32} color="#347385" />
            </View>
            <Text style={styles.duplicateTitle}>Produk Sudah Ada</Text>
            <Text style={styles.duplicateName} numberOfLines={2}>{duplicateProduct?.name}</Text>
            <Text style={styles.duplicateBarcode}>{duplicateProduct?.barcode}</Text>
            <Text style={styles.duplicateSub}>Produk dengan barcode ini sudah terdaftar. Mau edit produk yang ada?</Text>
            <TouchableOpacity
              style={styles.duplicateBtnPrimary}
              onPress={() => {
                const dupId = duplicateProduct!.id;
                setDuplicateProduct(null);
                router.back();
                setTimeout(() => router.push(`/(staff-pusat)/products/form?id=${dupId}`), 50);
              }}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.duplicateBtnPrimaryText}>Edit Produk Ini</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.duplicateBtnSecondary}
              onPress={() => { setDuplicateProduct(null); setShowScanner(true); }}
            >
              <Ionicons name="scan-outline" size={18} color="#347385" />
              <Text style={styles.duplicateBtnSecondaryText}>Scan Produk Lain</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* OFF Product Preview */}
      <Modal visible={showOFFPreview} animationType="slide" onRequestClose={() => { setShowOFFPreview(false); setOffProduct(null); }}>
        <View style={{ flex: 1 }}>
          <View style={[styles.offPreviewHeader, { paddingTop: insets.top + 16 }]}>
            <Text style={styles.offPreviewTitle}>Data dari Master Produk</Text>
            <TouchableOpacity onPress={() => { setShowOFFPreview(false); setOffProduct(null); }}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>
          {offProduct && (
            <OFFProductPreview
              product={offProduct} isUploading={isUploadingOFFImage}
              onConfirm={handleOFFConfirm}
              onEdit={() => { if (offProduct) setBarcode(offProduct.barcode); setShowOFFPreview(false); setOffProduct(null); setStep(1); }}
            />
          )}
        </View>
      </Modal>

      {/* Label Preview Modal */}
      <Modal visible={showLabelModal} transparent animationType="fade" onRequestClose={() => setShowLabelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.labelModal}>
            <View style={styles.labelModalHeader}>
              <Text style={styles.labelModalTitle}>Preview Label</Text>
              <TouchableOpacity onPress={() => setShowLabelModal(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View style={styles.modeToggle}>
              <TouchableOpacity style={[styles.modeBtn, printMode === 'barcode' && styles.modeBtnActive]} onPress={() => setPrintMode('barcode')}>
                <Ionicons name="barcode-outline" size={15} color={printMode === 'barcode' ? '#fff' : '#6B7280'} />
                <Text style={[styles.modeBtnText, printMode === 'barcode' && styles.modeBtnTextActive]}>Barcode</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modeBtn, printMode === 'qr' && styles.modeBtnActive]} onPress={() => setPrintMode('qr')}>
                <Ionicons name="qr-code-outline" size={15} color={printMode === 'qr' ? '#fff' : '#6B7280'} />
                <Text style={[styles.modeBtnText, printMode === 'qr' && styles.modeBtnTextActive]}>QR Code</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.labelCard}>
              {barcode.trim()
                ? printMode === 'qr'
                  ? <View style={styles.qrPreviewBox}><Ionicons name="qr-code-outline" size={72} color="#111827" /><Text style={styles.qrPreviewText}>{barcode.trim()}</Text></View>
                  : <BarcodePreview value={barcode.trim()} height={56} showText />
                : <View style={styles.noBarcodeBox}><Ionicons name="barcode-outline" size={32} color="#D1D5DB" /><Text style={styles.noBarcodeText}>Belum ada barcode</Text></View>}
              <Text style={styles.labelProductName} numberOfLines={2}>{name.trim() || '—'}</Text>
              {currentPrice > 0 && <Text style={styles.labelProductPrice}>Rp {currentPrice.toLocaleString('id-ID')}</Text>}
            </View>
            <TouchableOpacity style={[styles.printBtn, isPrintingLabel && styles.printBtnDisabled]} onPress={handlePrintLabel} disabled={isPrintingLabel}>
              {isPrintingLabel ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="print-outline" size={18} color="#fff" /><Text style={styles.printBtnText}>Cetak Label</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  scrollContent: { flexGrow: 1 },

  stepBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: 24,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  stepCircleActive: { backgroundColor: '#347385' },
  stepCircleDone: { backgroundColor: '#56B2C1' },
  stepNum: { fontSize: 13, fontWeight: '700', color: '#A0AEC0' },
  stepNumActive: { color: '#fff' },
  stepLabel: { fontSize: 11, fontWeight: '600', color: '#A0AEC0' },
  stepLabelActive: { color: '#347385' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#E2E8F0', marginHorizontal: 8, marginBottom: 14 },
  stepLineDone: { backgroundColor: '#56B2C1' },

  productStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#EEF8FA', borderBottomWidth: 1, borderBottomColor: '#B2E0EA',
  },
  stripImage: { width: 32, height: 32, borderRadius: 6 },
  stripImagePlaceholder: { width: 32, height: 32, borderRadius: 6, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  stripInfo: { flex: 1 },
  stripName: { fontSize: 13, fontWeight: '700', color: '#1A202C' },
  stripBarcode: { fontSize: 11, color: '#718096' },
  stripScan: { padding: 6 },

  stepContent: { padding: 16, gap: 14 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: '#1A202C', textAlign: 'center', marginBottom: 4 },
  stepSubtitle: { fontSize: 14, color: '#718096', textAlign: 'center' },

  branchTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  branchTab: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  branchTabActive: { backgroundColor: '#347385', borderColor: '#347385' },
  branchTabText: { fontSize: 13, fontWeight: '600', color: '#718096' },
  branchTabTextActive: { color: '#fff' },

  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#347385', borderRadius: 14, paddingVertical: 16, flex: 1 },
  nextBtnDisabled: { backgroundColor: '#A0AEC0' },
  nextBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#347385', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16 },
  backBtnText: { color: '#347385', fontSize: 13, fontWeight: '600' },
  rowBtns: { flexDirection: 'row', gap: 10 },

  summaryRow: { flexDirection: 'row', gap: 10, marginHorizontal: 0, marginTop: 12, paddingHorizontal: 16 },
  summaryItem: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: '#E2E8F0' },
  summaryLabel: { fontSize: 11, color: '#718096', fontWeight: '600', textTransform: 'uppercase' },
  summaryValue: { fontSize: 15, fontWeight: '800', color: '#1A202C' },
  summaryEdit: { fontSize: 11, color: '#347385', fontWeight: '600' },

  section: { backgroundColor: '#fff', marginTop: 12, padding: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A202C' },

  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#2D3748', marginBottom: 8 },
  required: { color: '#E53E3E' },
  hint: { fontSize: 11, color: '#A0AEC0', marginTop: 4 },
  promoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#fff' },
  dateBtnText: { fontSize: 14, color: '#1A202C' },

  input: { height: 48, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 12, fontSize: 15, color: '#1A202C', backgroundColor: '#fff' },
  inputError: { borderColor: '#E53E3E' },
  errorText: { fontSize: 12, color: '#E53E3E', marginTop: 4 },
  errorTextCenter: { fontSize: 12, color: '#E53E3E', textAlign: 'center' },

  row: { flexDirection: 'row', gap: 12 },

  priceInput: { flexDirection: 'row', alignItems: 'center', height: 48, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#fff' },
  priceInputField: { flex: 1, fontSize: 15, color: '#1A202C' },
  currency: { fontSize: 15, fontWeight: '600', color: '#4A5568', marginRight: 6 },

  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#fff' },
  pickerContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerText: { fontSize: 15, color: '#1A202C' },
  pickerPlaceholder: { fontSize: 15, color: '#A0AEC0' },
  pickerOptions: { marginTop: 8, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden' },
  pickerOption: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  pickerOptionText: { fontSize: 15, color: '#1A202C' },

  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  selectAllText: { fontSize: 13, fontWeight: '600', color: '#347385' },
  branchRow: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, marginBottom: 8, overflow: 'hidden' },
  branchCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  branchName: { fontSize: 14, color: '#6B7280', flex: 1, fontWeight: '500' },
  branchNameChecked: { color: '#1A202C', fontWeight: '700' },
  branchStockRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingBottom: 12 },
  branchStockField: { flex: 1 },
  branchStockLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginBottom: 4 },
  branchStockInput: { height: 38, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6, paddingHorizontal: 10, fontSize: 14, color: '#1A202C', backgroundColor: '#F9FAFB' },

  imagePicker: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7FAFC' },
  imagePlaceholderText: { fontSize: 13, color: '#A0AEC0', marginTop: 8 },
  pickedImage: { width: '100%', height: '100%', resizeMode: 'cover' },

  barcodeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  labelPreviewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 48, borderRadius: 8, borderWidth: 1, borderColor: '#347385', backgroundColor: '#EEF8FA' },
  labelPreviewBtnText: { fontSize: 13, fontWeight: '600', color: '#347385' },

  addUnitBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#56B2C1' },
  addUnitBtnText: { fontSize: 13, fontWeight: '600', color: '#56B2C1' },
  unitCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, marginBottom: 12, backgroundColor: '#F7FAFC' },
  unitCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  defaultBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: '#CBD5E0' },
  defaultBadgeActive: { borderColor: '#56B2C1', backgroundColor: '#EBF8FF' },
  defaultBadgeText: { fontSize: 12, fontWeight: '600', color: '#A0AEC0' },
  defaultBadgeTextActive: { color: '#56B2C1' },
  removeUnitBtn: { padding: 4 },

  scanBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#EEF8FA', marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#B2E0EA' },
  scanBannerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#B2E0EA' },
  scanBannerText: { flex: 1 },
  scanBannerTitle: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  scanBannerSub: { fontSize: 12, color: '#718096', marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  labelModal: { backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 360, padding: 20, gap: 12 },
  labelModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelModalTitle: { fontSize: 16, fontWeight: '700', color: '#1A202C' },
  labelCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16, alignItems: 'center', gap: 8, backgroundColor: '#FAFAFA' },
  noBarcodeBox: { alignItems: 'center', paddingVertical: 12, gap: 6 },
  noBarcodeText: { fontSize: 12, color: '#9CA3AF' },
  qrPreviewBox: { alignItems: 'center', paddingVertical: 8, gap: 6 },
  qrPreviewText: { fontSize: 11, color: '#374151', fontWeight: '600', letterSpacing: 0.5 },
  labelProductName: { fontSize: 15, fontWeight: '700', color: '#1A202C', textAlign: 'center' },
  labelProductPrice: { fontSize: 18, fontWeight: '800', color: '#347385' },
  modeToggle: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 10, padding: 3, gap: 3 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 8 },
  modeBtnActive: { backgroundColor: '#347385' },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  modeBtnTextActive: { color: '#fff' },
  printBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#347385', borderRadius: 10, paddingVertical: 13 },
  printBtnDisabled: { opacity: 0.6 },
  printBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  offPreviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#fff' },
  offPreviewTitle: { fontSize: 16, fontWeight: '700', color: '#1A202C' },

  duplicateModal: {
    backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 360,
    padding: 24, alignItems: 'center', gap: 8,
  },
  duplicateIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#EEF8FA', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  duplicateTitle: { fontSize: 18, fontWeight: '800', color: '#1A202C' },
  duplicateName: { fontSize: 15, fontWeight: '600', color: '#347385', textAlign: 'center' },
  duplicateBarcode: { fontSize: 12, color: '#A0AEC0', fontFamily: 'monospace' },
  duplicateSub: { fontSize: 13, color: '#718096', textAlign: 'center', lineHeight: 19, marginTop: 4 },
  duplicateBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#347385', borderRadius: 12, paddingVertical: 13,
    width: '100%', marginTop: 8,
  },
  duplicateBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  duplicateBtnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#347385', borderRadius: 12, paddingVertical: 11,
    width: '100%',
  },
  duplicateBtnSecondaryText: { color: '#347385', fontWeight: '600', fontSize: 14 },
});
