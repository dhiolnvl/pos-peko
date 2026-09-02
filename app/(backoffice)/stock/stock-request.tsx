import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useProductStore } from '@/store/productStore';
import { TabletCenteredView } from '@/components/TabletCenteredView';

interface RequestItem {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  review_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  transfer_id: string | null;
  item_count: number;
  total_qty: number;
}

interface ProductLine {
  product_id: string;
  product_name: string;
  quantity: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    pending: { label: 'Menunggu', color: '#D97706', bg: '#FFFBEB' },
    approved: { label: 'Disetujui', color: '#16A34A', bg: '#F0FDF4' },
    rejected: { label: 'Ditolak', color: '#DC2626', bg: '#FEF2F2' },
  }[status] ?? { label: status, color: '#9CA3AF', bg: '#F3F4F6' };

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function RequestCard({ item, isTablet }: { item: RequestItem; isTablet: boolean }) {
  return (
    <View style={[styles.card, isTablet && styles.cardTablet]}>
      <View style={styles.cardTop}>
        <View style={styles.iconWrap}>
          <Ionicons name="send" size={20} color="#347385" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Permintaan Stok</Text>
          <Text style={styles.cardDate}>{fmtDate(item.created_at)}</Text>
        </View>
        <StatusBadge status={item.status} />
      </View>

      <View style={styles.cardStats}>
        <View style={styles.statItem}>
          <Ionicons name="list-outline" size={14} color="#6B7280" />
          <Text style={styles.statText}>{item.item_count} jenis produk</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="cube-outline" size={14} color="#6B7280" />
          <Text style={styles.statText}>{item.total_qty} total unit</Text>
        </View>
      </View>

      {item.notes ? (
        <Text style={styles.notesText} numberOfLines={2}>{item.notes}</Text>
      ) : null}

      {item.review_notes ? (
        <View style={styles.reviewNotesWrap}>
          <Ionicons name="chatbubble-outline" size={13} color="#6B7280" />
          <Text style={styles.reviewNotesText} numberOfLines={3}>{item.review_notes}</Text>
        </View>
      ) : null}

      {item.status === 'approved' && item.transfer_id ? (
        <View style={styles.shippedRow}>
          <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
          <Text style={styles.shippedText}>Stok sudah dikirim</Text>
        </View>
      ) : null}
    </View>
  );
}

function ProductLineRow({
  line,
  index,
  onChange,
  onRemove,
  products,
  isTablet,
}: {
  line: ProductLine;
  index: number;
  onChange: (index: number, field: keyof ProductLine, value: string) => void;
  onRemove: (index: number) => void;
  products: { id: string; name: string }[];
  isTablet: boolean;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const selectedProduct = products.find((p) => p.id === line.product_id);

  return (
    <View style={[styles.productLine, isTablet && styles.productLineTablet]}>
      <View style={styles.productLineHeader}>
        <Text style={styles.productLineLabel}>Produk {index + 1}</Text>
        {index > 0 && (
          <TouchableOpacity onPress={() => onRemove(index)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.productPickerBtn}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.8}
      >
        <Text style={[styles.productPickerText, !selectedProduct && { color: '#A0AEC0' }]}>
          {selectedProduct ? selectedProduct.name : 'Pilih produk...'}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#6B7280" />
      </TouchableOpacity>

      <TextInput
        style={styles.qtyInput}
        placeholder="Jumlah yang diminta"
        placeholderTextColor="#A0AEC0"
        value={line.quantity}
        onChangeText={(v) => onChange(index, 'quantity', v.replace(/[^0-9]/g, ''))}
        keyboardType="numeric"
      />

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowPicker(false)}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Pilih Produk</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {products.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.pickerOption}
                  onPress={() => { onChange(index, 'product_id', p.id); onChange(index, 'product_name', p.name); setShowPicker(false); }}
                >
                  <Text style={[styles.pickerOptionText, line.product_id === p.id && { color: '#347385', fontWeight: '700' }]}>
                    {p.name}
                  </Text>
                  {line.product_id === p.id && <Ionicons name="checkmark" size={16} color="#347385" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function StockRequestScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { currentBranch, user } = useAuthStore();
  const { products, syncFromSupabase } = useProductStore();

  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lines, setLines] = useState<ProductLine[]>([{ product_id: '', product_name: '', quantity: '' }]);
  const [formNotes, setFormNotes] = useState('');

  const scrollRef = useRef<ScrollView>(null);
  const notesRef = useRef<View>(null);

  const productList = products.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name }));

  const loadData = useCallback(async () => {
    if (!currentBranch?.id) return;
    try {
      const query = supabase
        .from('stock_requests')
        .select('id, status, notes, review_notes, created_at, reviewed_at, transfer_id, stock_request_items(product_id, quantity, products(name))')
        .eq('branch_id', currentBranch.id)
        .order('created_at', { ascending: false });

      if (activeTab === 'pending') {
        query.eq('status', 'pending');
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped: RequestItem[] = (data ?? []).map((r: any) => ({
        id: r.id,
        status: r.status,
        notes: r.notes,
        review_notes: r.review_notes,
        created_at: r.created_at,
        reviewed_at: r.reviewed_at,
        transfer_id: r.transfer_id,
        item_count: r.stock_request_items?.length ?? 0,
        total_qty: r.stock_request_items?.reduce((sum: number, i: any) => sum + (i.quantity ?? 0), 0) ?? 0,
      }));

      setRequests(mapped);
    } catch (e: any) {
      Alert.alert('Gagal memuat data', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentBranch?.id, activeTab]);

  useFocusEffect(useCallback(() => {
    loadData();
    if (products.length === 0) syncFromSupabase().catch(() => {});
  }, [loadData]));

  const handleLineChange = (index: number, field: keyof ProductLine, value: string) => {
    setLines((prev) => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const handleAddLine = () => {
    setLines((prev) => [...prev, { product_id: '', product_name: '', quantity: '' }]);
  };

  const handleRemoveLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setLines([{ product_id: '', product_name: '', quantity: '' }]);
    setFormNotes('');
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
      const { data: requestData, error: requestError } = await supabase
        .from('stock_requests')
        .insert({
          branch_id: currentBranch.id,
          status: 'pending',
          notes: formNotes.trim() || null,
          created_by: user?.id ?? null,
        })
        .select('id')
        .single();

      if (requestError) throw requestError;

      const items = validLines.map((l) => ({
        request_id: requestData.id,
        product_id: l.product_id,
        quantity: parseInt(l.quantity, 10),
      }));

      const { error: itemsError } = await supabase.from('stock_request_items').insert(items);
      if (itemsError) throw itemsError;

      Alert.alert('Berhasil', 'Permintaan stok berhasil dikirim.');
      setShowForm(false);
      resetForm();
      loadData();
    } catch (e: any) {
      Alert.alert('Gagal', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#347385" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Permintaan Stok</Text>
          <Text style={styles.headerSub}>Kirim permintaan ke staf pusat</Text>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/(backoffice)/stock/stock-request-form' as any)} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.newBtnText}>Buat Permintaan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        {(['all', 'pending'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => { setActiveTab(tab); setLoading(true); }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'all' ? 'Semua' : 'Menunggu'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TabletCenteredView maxWidth={800} style={{ flex: 1, paddingHorizontal: 16 }}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#347385" />
            <Text style={styles.loadingText}>Memuat data...</Text>
          </View>
        ) : requests.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="send-outline" size={56} color="#CBD5E0" />
            <Text style={styles.emptyTitle}>Belum ada permintaan</Text>
            <Text style={styles.emptyText}>Tekan "Buat Permintaan" untuk mulai</Text>
          </View>
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <RequestCard item={item} isTablet={isTablet} />}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); loadData(); }}
                colors={['#347385']}
                tintColor="#347385"
              />
            }
          />
        )}
      </TabletCenteredView>

      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => { setShowForm(false); resetForm(); }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, isTablet && styles.modalBoxTablet]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Buat Permintaan Stok</Text>
                <TouchableOpacity onPress={() => { setShowForm(false); resetForm(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView
                ref={scrollRef}
                contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sectionLabel}>Produk yang diminta</Text>

                {lines.map((line, index) => (
                  <ProductLineRow
                    key={index}
                    line={line}
                    index={index}
                    onChange={handleLineChange}
                    onRemove={handleRemoveLine}
                    products={productList}
                    isTablet={isTablet}
                  />
                ))}

                <TouchableOpacity style={styles.addLineBtn} onPress={handleAddLine} activeOpacity={0.8}>
                  <Ionicons name="add-circle-outline" size={18} color="#347385" />
                  <Text style={styles.addLineBtnText}>Tambah Produk</Text>
                </TouchableOpacity>

                <View ref={notesRef} style={styles.notesField}>
                  <Text style={styles.sectionLabel}>Catatan (opsional)</Text>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Tuliskan catatan untuk staf pusat..."
                    placeholderTextColor="#A0AEC0"
                    value={formNotes}
                    onChangeText={setFormNotes}
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
                  style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
                  onPress={handleSubmit}
                  activeOpacity={0.85}
                  disabled={submitting}
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
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#347385',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  newBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5F4F7',
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#347385' },
  tabText: { fontSize: 13, fontWeight: '500', color: '#9CA3AF' },
  tabTextActive: { color: '#347385', fontWeight: '700' },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: '#9CA3AF' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 32 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#D4EFF4',
    shadowColor: '#347385',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTablet: { marginHorizontal: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  cardDate: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardStats: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, color: '#6B7280' },
  notesText: { fontSize: 12, color: '#9CA3AF', marginBottom: 8, fontStyle: 'italic' },
  reviewNotesWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reviewNotesText: { flex: 1, fontSize: 12, color: '#4B5563', lineHeight: 18 },
  shippedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  shippedText: { fontSize: 12, fontWeight: '600', color: '#16A34A' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalBoxTablet: { maxWidth: 560 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5F4F7',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 10 },

  productLine: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  productLineTablet: {},
  productLineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  productLineLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  productPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  productPickerText: { fontSize: 14, color: '#111827', flex: 1 },
  qtyInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },

  addLineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#347385',
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  addLineBtnText: { fontSize: 13, fontWeight: '600', color: '#347385' },

  notesField: { marginBottom: 20 },
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

  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    padding: 16,
  },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerOptionText: { fontSize: 14, color: '#374151', flex: 1 },
});
