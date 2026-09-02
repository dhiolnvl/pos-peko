import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProductStore } from '@/store/productStore';
import { useAuth } from '@/hooks/useAuth';
import { NumpadInput } from '@/components/NumpadInput';

type Step = 1 | 2 | 3;

const fmt = (raw: string) => {
  const digits = raw.replace(/\./g, '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  return parseInt(digits, 10).toLocaleString('id-ID');
};
const parse = (s: string) => parseInt(s.replace(/\./g, ''), 10) || 0;

export default function CashierProductFormScreen() {
  const { barcode: initialBarcode } = useLocalSearchParams<{ barcode?: string }>();
  const { currentBranch } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 768;
  const scrollRef = useRef<ScrollView>(null);
  const notesRef = useRef<View>(null);

  const { categories, loadCategories, addProduct } = useProductStore();

  const [step, setStep] = useState<Step>(1);
  const [price, setPrice] = useState('0');
  const [stock, setStock] = useState('0');
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState(initialBarcode ?? '');
  const [unit, setUnit] = useState('pcs');
  const [minStock, setMinStock] = useState('5');
  const [categoryId, setCategoryId] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => { loadCategories(); }, []);

  const selectedCategory = categories.find((c) => c.id === categoryId);

  const STEPS = [{ n: 1, label: 'Harga' }, { n: 2, label: 'Stok' }, { n: 3, label: 'Detail' }];

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Nama produk harus diisi';
    if (parseInt(price) <= 0) e.price = 'Harga harus lebih dari 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!currentBranch) {
      Alert.alert('Error', 'Cabang tidak ditemukan');
      return;
    }
    try {
      setIsLoading(true);
      await addProduct({
        name: name.trim(),
        category_id: categoryId || null,
        price: parseInt(price),
        cost_price: null,
        stock: parseInt(stock) || 0,
        min_stock: parseInt(minStock) || 5,
        unit: unit.trim() || 'pcs',
        barcode: barcode.trim() || null,
        image_url: null,
      });
      Alert.alert('Berhasil', 'Produk berhasil ditambahkan', [
        { text: 'Tambah Lagi', onPress: resetForm },
        { text: 'Selesai', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Gagal menyimpan produk');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName(''); setBarcode(''); setPrice('0'); setStock('0');
    setUnit('pcs'); setMinStock('5'); setCategoryId(''); setErrors({});
    setStep(1);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tambah Produk</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Step indicator */}
      <View style={styles.stepBar}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s.n}>
            <TouchableOpacity
              style={styles.stepItem}
              onPress={() => { if (step > s.n) setStep(s.n as Step); }}
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

      {/* Barcode strip */}
      {barcode ? (
        <View style={styles.barcodeStrip}>
          <Ionicons name="barcode-outline" size={16} color="#347385" />
          <Text style={styles.barcodeStripText}>{barcode}</Text>
        </View>
      ) : null}

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
                if (parseInt(price) <= 0) { setErrors({ price: 'Harga harus lebih dari 0' }); return; }
                setErrors({}); setStep(2);
              }}
            >
              <Text style={styles.nextBtnText}>Lanjut ke Stok</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* ===== STEP 2 — Stok ===== */}
        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Stok Awal</Text>
            <NumpadInput value={stock} onChange={setStock} prefix="Qty" />
            <View style={styles.rowBtns}>
              <TouchableOpacity style={styles.backStepBtn} onPress={() => setStep(1)}>
                <Ionicons name="arrow-back" size={18} color="#347385" />
                <Text style={styles.backStepBtnText}>Kembali</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nextBtn} onPress={() => { setErrors({}); setStep(3); }}>
                <Text style={styles.nextBtnText}>Lanjut ke Detail</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ===== STEP 3 — Detail ===== */}
        {step === 3 && (
          <>
            {/* Ringkasan */}
            <View style={styles.summaryRow}>
              <TouchableOpacity style={styles.summaryItem} onPress={() => setStep(1)}>
                <Text style={styles.summaryLabel}>Harga Jual</Text>
                <Text style={styles.summaryValue}>Rp {parseInt(price).toLocaleString('id-ID')}</Text>
                <Text style={styles.summaryEdit}>Ubah</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.summaryItem} onPress={() => setStep(2)}>
                <Text style={styles.summaryLabel}>Stok Awal</Text>
                <Text style={styles.summaryValue}>{parseInt(stock) || 0}</Text>
                <Text style={styles.summaryEdit}>Ubah</Text>
              </TouchableOpacity>
            </View>

            {/* Informasi Produk */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Informasi Produk</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Nama Produk <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={[styles.input, errors.name && styles.inputError]}
                  placeholder="Contoh: Aqua 600ml"
                  value={name}
                  onChangeText={setName}
                  editable={!isLoading}
                  autoFocus
                />
                {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Barcode</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Scan atau ketik manual"
                  value={barcode}
                  onChangeText={setBarcode}
                  editable={!isLoading}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Kategori</Text>
                <TouchableOpacity
                  style={styles.picker}
                  onPress={() => setShowCategoryPicker(!showCategoryPicker)}
                  disabled={isLoading}
                >
                  {selectedCategory
                    ? <Text style={styles.pickerText}>{selectedCategory.name}</Text>
                    : <Text style={styles.pickerPlaceholder}>Pilih kategori</Text>}
                  <Ionicons name="chevron-down" size={18} color="#A0AEC0" />
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

              <View style={styles.row}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.label}>Satuan</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="pcs"
                    value={unit}
                    onChangeText={setUnit}
                    editable={!isLoading}
                  />
                </View>
                <View ref={notesRef} style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.label}>Min. Stok</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="5"
                    value={minStock}
                    onChangeText={(v) => setMinStock(v.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                    editable={!isLoading}
                    onFocus={() => {
                      notesRef.current?.measureLayout(
                        scrollRef.current as any,
                        (_x, y) => scrollRef.current?.scrollTo({ y: y - 16, animated: true }),
                        () => {},
                      );
                    }}
                  />
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Footer step 3 */}
      {step === 3 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
          <TouchableOpacity style={styles.backStepBtn} onPress={() => setStep(2)}>
            <Ionicons name="arrow-back" size={18} color="#347385" />
            <Text style={styles.backStepBtnText}>Kembali</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, isLoading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Ionicons name="checkmark-circle-outline" size={18} color="#fff" /><Text style={styles.saveBtnText}>Simpan Produk</Text></>}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1A202C' },

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

  barcodeStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#EEF8FA', borderBottomWidth: 1, borderBottomColor: '#B2E0EA',
  },
  barcodeStripText: { fontSize: 13, fontWeight: '600', color: '#347385', fontFamily: 'monospace' },

  scrollContent: { flexGrow: 1 },

  stepContent: { padding: 16, gap: 14 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: '#1A202C', textAlign: 'center', marginBottom: 4 },

  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#347385', borderRadius: 14, paddingVertical: 16, flex: 1 },
  nextBtnDisabled: { backgroundColor: '#A0AEC0' },
  nextBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  backStepBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#347385', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16 },
  backStepBtnText: { color: '#347385', fontSize: 13, fontWeight: '600' },
  rowBtns: { flexDirection: 'row', gap: 10 },

  summaryRow: { flexDirection: 'row', gap: 10, margin: 12 },
  summaryItem: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: '#E2E8F0' },
  summaryLabel: { fontSize: 11, color: '#718096', fontWeight: '600', textTransform: 'uppercase' },
  summaryValue: { fontSize: 15, fontWeight: '800', color: '#1A202C' },
  summaryEdit: { fontSize: 11, color: '#347385', fontWeight: '600' },

  section: { backgroundColor: '#fff', marginTop: 0, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A202C', marginBottom: 16 },

  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#2D3748', marginBottom: 8 },
  required: { color: '#E53E3E' },
  row: { flexDirection: 'row', gap: 12 },

  input: { height: 48, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 12, fontSize: 15, color: '#1A202C', backgroundColor: '#fff' },
  inputError: { borderColor: '#E53E3E' },
  errorText: { fontSize: 12, color: '#E53E3E', marginTop: 4 },
  errorTextCenter: { fontSize: 12, color: '#E53E3E', textAlign: 'center' },

  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#fff' },
  pickerText: { fontSize: 15, color: '#1A202C' },
  pickerPlaceholder: { fontSize: 15, color: '#A0AEC0' },
  pickerOptions: { marginTop: 4, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden' },
  pickerOption: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  pickerOptionText: { fontSize: 15, color: '#1A202C' },

  footer: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#347385', borderRadius: 12, paddingVertical: 14 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
