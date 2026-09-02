import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

interface BranchProduct {
  product_id: string;
  name: string;
  stock: number;
  min_stock: number;
  status: 'aman' | 'menipis' | 'habis';
}

interface RequestLine {
  product_id: string;
  product_name: string;
  stock: number;
  min_stock: number;
  status: 'aman' | 'menipis' | 'habis';
  quantity: string;
}

function stockStatus(stock: number, min_stock: number): 'aman' | 'menipis' | 'habis' {
  if (stock <= 0) return 'habis';
  if (stock <= min_stock) return 'menipis';
  return 'aman';
}

function StockChip({ status }: { status: 'aman' | 'menipis' | 'habis' }) {
  const cfg = {
    aman: { label: 'Aman', color: '#16A34A', bg: '#F0FDF4' },
    menipis: { label: 'Menipis', color: '#D97706', bg: '#FFFBEB' },
    habis: { label: 'Habis', color: '#DC2626', bg: '#FEF2F2' },
  }[status];
  return (
    <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.chipText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

export default function StockRequestFormScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { currentBranch, user } = useAuthStore();

  const [branchProducts, setBranchProducts] = useState<BranchProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [lines, setLines] = useState<RequestLine[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showPicker, setShowPicker] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'semua' | 'menipis' | 'habis'>('semua');

  const scrollRef = useRef<ScrollView>(null);
  const notesRef = useRef<View>(null);

  useEffect(() => {
    loadBranchProducts();
  }, []);

  const loadBranchProducts = async () => {
    if (!currentBranch?.id) return;
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from('branch_products')
        .select('product_id, stock, min_stock, is_available, products!product_id(id, name, is_active)')
        .eq('branch_id', currentBranch.id)
        .eq('is_available', true);

      if (error) throw error;

      const mapped: BranchProduct[] = (data ?? [])
        .filter((bp: any) => bp.products?.is_active)
        .map((bp: any) => ({
          product_id: bp.product_id,
          name: bp.products.name,
          stock: bp.stock ?? 0,
          min_stock: bp.min_stock ?? 0,
          status: stockStatus(bp.stock ?? 0, bp.min_stock ?? 0),
        }))
        .sort((a: BranchProduct, b: BranchProduct) => {
          const order = { habis: 0, menipis: 1, aman: 2 };
          return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
        });

      setBranchProducts(mapped);
    } catch (e: any) {
      Alert.alert('Gagal memuat produk', e.message);
    } finally {
      setLoadingProducts(false);
    }
  };

  const filteredProducts = branchProducts.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'semua' || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const openPicker = (index: number) => {
    setEditingIndex(index);
    setSearch('');
    setFilterStatus('semua');
    setShowPicker(true);
  };

  const selectProduct = (product: BranchProduct) => {
    const alreadyUsed = lines.some(
      (l, i) => l.product_id === product.product_id && i !== editingIndex
    );
    if (alreadyUsed) {
      Alert.alert('Duplikat', 'Produk ini sudah ada dalam daftar.');
      return;
    }

    if (editingIndex !== null) {
      if (editingIndex === lines.length) {
        setLines((prev) => [
          ...prev,
          {
            product_id: product.product_id,
            product_name: product.name,
            stock: product.stock,
            min_stock: product.min_stock,
            status: product.status,
            quantity: '',
          },
        ]);
      } else {
        setLines((prev) =>
          prev.map((l, i) =>
            i === editingIndex
              ? {
                  product_id: product.product_id,
                  product_name: product.name,
                  stock: product.stock,
                  min_stock: product.min_stock,
                  status: product.status,
                  quantity: l.quantity,
                }
              : l
          )
        );
      }
    }
    setShowPicker(false);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const validLines = lines.filter((l) => l.product_id && l.quantity && parseInt(l.quantity, 10) > 0);
    if (validLines.length === 0) {
      Alert.alert('Perhatian', 'Pilih minimal satu produk dan isi jumlahnya.');
      return;
    }
    if (!currentBranch?.id) return;

    setSubmitting(true);
    try {
      const { data: req, error: reqErr } = await supabase
        .from('stock_requests')
        .insert({
          branch_id: currentBranch.id,
          status: 'pending',
          notes: notes.trim() || null,
          created_by: user?.id ?? null,
        })
        .select('id')
        .single();

      if (reqErr) throw reqErr;

      const items = validLines.map((l) => ({
        request_id: req.id,
        product_id: l.product_id,
        quantity: parseInt(l.quantity, 10),
      }));

      const { error: itemsErr } = await supabase.from('stock_request_items').insert(items);
      if (itemsErr) throw itemsErr;

      Alert.alert('Berhasil', 'Permintaan stok berhasil dikirim.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Gagal', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (showPicker) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setShowPicker(false)}
          >
            <Ionicons name="chevron-back" size={22} color="#347385" />
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>Pilih Produk</Text>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari produk..."
              placeholderTextColor="#A0AEC0"
              value={search}
              onChangeText={setSearch}
              autoFocus
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={{ height: 48, justifyContent: 'center' }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
          >
            {(['semua', 'menipis', 'habis'] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, filterStatus === f && styles.filterChipActive]}
                onPress={() => setFilterStatus(f)}
              >
                <Text style={[styles.filterChipText, filterStatus === f && styles.filterChipTextActive]}>
                  {f === 'semua' ? 'Semua' : f === 'menipis' ? 'Menipis' : 'Habis'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <FlatList
          data={filteredProducts}
          keyExtractor={(p) => p.product_id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20, paddingTop: 8 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const alreadyAdded = lines.some((l, i) => l.product_id === item.product_id && i !== editingIndex);
            return (
              <TouchableOpacity
                style={[styles.productItem, alreadyAdded && { opacity: 0.4 }]}
                onPress={() => !alreadyAdded && selectProduct(item)}
                activeOpacity={alreadyAdded ? 1 : 0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.productItemName}>{item.name}</Text>
                  <Text style={styles.productItemStock}>
                    Stok saat ini: <Text style={{ fontWeight: '700', color: item.stock <= 0 ? '#DC2626' : item.stock <= item.min_stock ? '#D97706' : '#374151' }}>{item.stock}</Text>
                    {item.min_stock > 0 ? `  (min. ${item.min_stock})` : ''}
                  </Text>
                </View>
                <StockChip status={item.status} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="search-outline" size={40} color="#CBD5E0" />
              <Text style={styles.emptyText}>Produk tidak ditemukan</Text>
            </View>
          }
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container]}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#347385" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Buat Permintaan Stok</Text>
            <Text style={styles.headerSub}>Kirim permintaan ke staf pusat</Text>
          </View>
        </View>

        {loadingProducts ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#347385" />
            <Text style={styles.loadingText}>Memuat data produk...</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: insets.bottom + 32,
              maxWidth: isTablet ? 700 : undefined,
              alignSelf: isTablet ? 'center' : undefined,
              width: isTablet ? 700 : undefined,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionLabel}>Produk yang diminta</Text>

            {lines.length === 0 && (
              <View style={styles.emptyLines}>
                <Ionicons name="cube-outline" size={32} color="#CBD5E0" />
                <Text style={styles.emptyLinesText}>Belum ada produk dipilih</Text>
              </View>
            )}

            {lines.map((line, index) => (
              <View key={index} style={styles.lineCard}>
                <View style={styles.lineTop}>
                  <TouchableOpacity
                    style={styles.productPickerBtn}
                    onPress={() => openPicker(index)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      {line.product_id ? (
                        <>
                          <Text style={styles.lineProductName}>{line.product_name}</Text>
                          <Text style={styles.lineProductStock}>
                            Stok:{' '}
                            <Text style={{ fontWeight: '700', color: line.stock <= 0 ? '#DC2626' : line.stock <= line.min_stock ? '#D97706' : '#374151' }}>
                              {line.stock}
                            </Text>
                            {line.min_stock > 0 ? `  (min. ${line.min_stock})` : ''}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.pickerPlaceholder}>Pilih produk...</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {line.product_id && <StockChip status={line.status} />}
                      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeLine(index)}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>

                <View style={styles.qtyRow}>
                  <Text style={styles.qtyLabel}>Jumlah diminta</Text>
                  <TextInput
                    style={styles.qtyInput}
                    placeholder="0"
                    placeholderTextColor="#A0AEC0"
                    value={line.quantity}
                    onChangeText={(v) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === index ? { ...l, quantity: v.replace(/[^0-9]/g, '') } : l))
                      )
                    }
                    keyboardType="numeric"
                    returnKeyType="done"
                  />
                </View>
              </View>
            ))}

            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => openPicker(lines.length)}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={18} color="#347385" />
              <Text style={styles.addBtnText}>Tambah Produk</Text>
            </TouchableOpacity>

            <View ref={notesRef} style={styles.notesSection}>
              <Text style={styles.sectionLabel}>Catatan (opsional)</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Tuliskan catatan untuk staf pusat..."
                placeholderTextColor="#A0AEC0"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                onFocus={() => {
                  notesRef.current?.measureLayout(
                    scrollRef.current as any,
                    (_x, y) => { scrollRef.current?.scrollTo({ y: y - 16, animated: true }); },
                    () => {}
                  );
                }}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, (submitting || lines.length === 0) && { opacity: 0.6 }]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={submitting || lines.length === 0}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>Kirim Permintaan</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5F4F7',
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: '#9CA3AF' },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10 },

  emptyLines: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    marginBottom: 12,
  },
  emptyLinesText: { fontSize: 13, color: '#9CA3AF' },

  lineCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 10,
    overflow: 'hidden',
  },
  lineTop: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  productPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  lineProductName: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  lineProductStock: { fontSize: 12, color: '#6B7280' },
  pickerPlaceholder: { fontSize: 14, color: '#A0AEC0' },
  removeBtn: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#F3F4F6',
  },

  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FAFAFA',
  },
  qtyLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  qtyInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    minWidth: 100,
    textAlign: 'center',
  },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#347385',
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  addBtnText: { fontSize: 13, fontWeight: '600', color: '#347385' },

  notesSection: { marginBottom: 20 },
  notesInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    minHeight: 90,
  },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#347385',
    paddingVertical: 14,
    borderRadius: 12,
  },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '700' },

  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5F4F7',
    gap: 8,
  },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },

  searchRow: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },

  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: '#EEF8FA', borderColor: '#347385' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  filterChipTextActive: { color: '#347385' },

  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  productItemName: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 3 },
  productItemStock: { fontSize: 12, color: '#6B7280' },

  emptyWrap: { alignItems: 'center', gap: 8, paddingTop: 60 },
  emptyText: { fontSize: 13, color: '#9CA3AF' },
});
