import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/constants/config';
import { printProductLabel, isPrinterConnected } from '@/lib/printerHelper';

interface Product {
  id: string;
  name: string;
  barcode: string | null;
  price: number;
  unit: string | null;
}

export default function PrintLabelsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<string, number>>({});
  const [printing, setPrinting] = useState(false);
  const [mode, setMode] = useState<'barcode' | 'qr'>('barcode');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('products')
          .select('id, name, barcode, price, unit')
          .eq('is_active', true)
          .order('name', { ascending: true })
          .limit(2000);
        setProducts(data ?? []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.barcode?.toLowerCase().includes(q) ?? false)
    );
  }, [products, search]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setQty((q) => { const n = { ...q }; delete n[id]; return n; });
      } else {
        next.add(id);
        setQty((q) => ({ ...q, [id]: 1 }));
      }
      return next;
    });
  };

  const selectAll = () => {
    const ids = filtered.map((p) => p.id);
    setSelected(new Set(ids));
    setQty((q) => {
      const n = { ...q };
      ids.forEach((id) => { if (!n[id]) n[id] = 1; });
      return n;
    });
  };

  const clearAll = () => {
    setSelected(new Set());
    setQty({});
  };

  const handlePrint = async () => {
    if (!isPrinterConnected()) {
      Alert.alert('Printer Tidak Terhubung', 'Hubungkan printer thermal terlebih dahulu di Pengaturan Printer.');
      return;
    }
    if (selected.size === 0) {
      Alert.alert('Pilih Produk', 'Pilih minimal 1 produk untuk dicetak labelnya.');
      return;
    }

    const toPrint = products.filter((p) => selected.has(p.id));
    const totalLabels = toPrint.reduce((s, p) => s + (qty[p.id] ?? 1), 0);

    Alert.alert(
      'Cetak Label',
      `Cetak ${totalLabels} label untuk ${toPrint.length} produk?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Cetak',
          onPress: async () => {
            setPrinting(true);
            try {
              for (const p of toPrint) {
                const count = qty[p.id] ?? 1;
                for (let i = 0; i < count; i++) {
                  await printProductLabel({ name: p.name, barcode: p.barcode, price: p.price, mode });
                }
              }
              Alert.alert('Selesai', `${totalLabels} label berhasil dicetak.`);
            } catch (e: any) {
              Alert.alert('Gagal', e.message);
            } finally {
              setPrinting(false);
            }
          },
        },
      ]
    );
  };

  const numColumns = isTablet ? 2 : 1;

  const renderItem = ({ item }: { item: Product }) => {
    const isSelected = selected.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.card, isTablet && styles.cardTablet, isSelected && styles.cardSelected]}
        onPress={() => toggleSelect(item.id)}
        activeOpacity={0.75}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.productMeta}>
            {item.barcode ?? 'Tanpa barcode'} · {formatCurrency(item.price)}
          </Text>
        </View>
        {isSelected && (
          <View style={styles.qtyWrap}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setQty((q) => ({ ...q, [item.id]: Math.max(1, (q[item.id] ?? 1) - 1) }))}
            >
              <Ionicons name="remove" size={14} color="#347385" />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{qty[item.id] ?? 1}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setQty((q) => ({ ...q, [item.id]: (q[item.id] ?? 1) + 1 }))}
            >
              <Ionicons name="add" size={14} color="#347385" />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const totalLabels = [...selected].reduce((s, id) => s + (qty[id] ?? 1), 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cetak Label Produk</Text>
        <TouchableOpacity
          style={[styles.printBtn, (printing || selected.size === 0) && { opacity: 0.5 }]}
          onPress={handlePrint}
          disabled={printing || selected.size === 0}
        >
          {printing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="print-outline" size={18} color="#fff" />}
          <Text style={styles.printBtnText}>
            {selected.size > 0 ? `Cetak (${totalLabels})` : 'Cetak'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mode + search + actions */}
      <View style={styles.toolbar}>
        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'barcode' && styles.modeBtnActive]}
            onPress={() => setMode('barcode')}
          >
            <Ionicons name="barcode-outline" size={15} color={mode === 'barcode' ? '#fff' : '#6B7280'} />
            <Text style={[styles.modeBtnText, mode === 'barcode' && { color: '#fff' }]}>Barcode</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'qr' && styles.modeBtnActive]}
            onPress={() => setMode('qr')}
          >
            <Ionicons name="qr-code-outline" size={15} color={mode === 'qr' ? '#fff' : '#6B7280'} />
            <Text style={[styles.modeBtnText, mode === 'qr' && { color: '#fff' }]}>QR Code</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama / barcode..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Select all / clear */}
        <View style={styles.actionRow}>
          <Text style={styles.countText}>
            {selected.size} dipilih · {filtered.length} produk
          </Text>
          <TouchableOpacity onPress={selectAll} style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Pilih Semua</Text>
          </TouchableOpacity>
          {selected.size > 0 && (
            <TouchableOpacity onPress={clearAll} style={[styles.actionBtn, { borderColor: '#EF4444' }]}>
              <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Hapus Pilihan</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#347385" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          key={numColumns}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          columnWrapperStyle={isTablet ? { gap: 10 } : undefined}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827' },
  printBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#347385', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  printBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  toolbar: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10,
    gap: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  modeBtnActive: { backgroundColor: '#347385', borderColor: '#347385' },
  modeBtnText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1,
    borderColor: '#E5E7EB', paddingHorizontal: 12, height: 40,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countText: { flex: 1, fontSize: 12, color: '#6B7280' },
  actionBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: '#347385',
  },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: '#347385' },

  list: { padding: 12, gap: 8 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  cardTablet: { flex: 1 },
  cardSelected: { borderColor: '#347385', backgroundColor: '#EEF8FA' },

  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: '#D1D5DB',
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxActive: { backgroundColor: '#347385', borderColor: '#347385' },

  productName: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 2 },
  productMeta: { fontSize: 11, color: '#9CA3AF' },

  qtyWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#A9DFE9',
  },
  qtyText: { fontSize: 14, fontWeight: '700', color: '#347385', minWidth: 20, textAlign: 'center' },
});
