import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, useWindowDimensions, ActivityIndicator, Vibration,
  Platform, ScrollView, Keyboard, Animated,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useStockStore, type StockOpnameItem } from '@/store/stockStore';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

interface LiveItem {
  product_id: string;
  product_name: string;
  product_unit: string | null;
  system_stock: number;
  physical_qty: number;
}

const PRIMARY = '#145a6c';

export default function OpnameScannerScreen() {
  const { opname_id } = useLocalSearchParams<{ opname_id?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { updateOpnameItem } = useStockStore();
  const { currentBranch } = useAuthStore();

  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [liveItem, setLiveItem] = useState<LiveItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<StockOpnameItem[]>([]);

  const scanBlocked = useRef(false);
  const liveItemRef = useRef<LiveItem | null>(null);
  const showManualRef = useRef(false);
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, []);

  useEffect(() => { liveItemRef.current = liveItem; }, [liveItem]);
  useEffect(() => { showManualRef.current = showManual; }, [showManual]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === 'ios' ? e.duration ?? 250 : 200,
        useNativeDriver: false,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? e.duration ?? 250 : 200,
        useNativeDriver: false,
      }).start();
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const diff = liveItem ? liveItem.physical_qty - liveItem.system_stock : 0;
  const isDiscrepancy = diff !== 0;

  const lookupProduct = useCallback(async (barcode: string) => {
    const branchId = currentBranch?.id;
    try {
      // Produk bersifat global — stok diambil dari branch_products
      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, unit')
        .eq('is_active', true)
        .eq('barcode', barcode)
        .limit(1);
      if (error || !products?.length) return null;
      const product = products[0];

      let stock = 0;
      if (branchId) {
        const { data: bp } = await supabase
          .from('branch_products')
          .select('stock')
          .eq('product_id', product.id)
          .eq('branch_id', branchId)
          .maybeSingle();
        stock = bp?.stock ?? 0;
      }

      return { ...product, stock };
    } catch {
      return null;
    }
  }, [currentBranch]);

  const handleBarcodeScan = useCallback(async ({ data }: { data: string }) => {
    if (scanBlocked.current) return;
    scanBlocked.current = true;
    Vibration.vibrate(80);

    const product = await lookupProduct(data);
    if (!product) {
      Alert.alert('Produk tidak ditemukan', `Barcode: ${data}`, [
        { text: 'OK', onPress: () => { scanBlocked.current = false; } },
      ]);
      return;
    }

    // Prioritas: liveItem aktif (belum disimpan) > DB > stok sistem
    const currentLive = liveItemRef.current;
    let physicalQty: number;

    if (currentLive && currentLive.product_id === product.id) {
      // Produk sama sedang aktif di form, pertahankan input user
      physicalQty = currentLive.physical_qty;
    } else {
      physicalQty = product.stock ?? 0;
      if (opname_id) {
        const { data: existing } = await supabase
          .from('stock_opname_items')
          .select('physical_stock')
          .eq('opname_id', opname_id)
          .eq('product_id', product.id)
          .maybeSingle();
        if (existing) physicalQty = existing.physical_stock;
      }
    }

    setLiveItem({
      product_id: product.id,
      product_name: product.name,
      product_unit: product.unit ?? null,
      system_stock: product.stock ?? 0,
      physical_qty: physicalQty,
    });
    if (!showManualRef.current) {
      setQuery('');
      setSearchResults([]);
    }

    setTimeout(() => { scanBlocked.current = false; }, 1500);
  }, [lookupProduct, opname_id]);

  const handleSave = async () => {
    if (!liveItem || !opname_id) return;
    try {
      setSaving(true);
      await updateOpnameItem(opname_id, liveItem.product_id, liveItem.physical_qty);
      setSavedCount((c) => c + 1);
      setLiveItem(null);
    } catch (err: any) {
      Alert.alert('Gagal', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (text.trim().length < 2 || !opname_id) { setSearchResults([]); return; }
    try {
      setSearching(true);
      const q = text.trim();
      const branchId = currentBranch?.id;

      // Join branch_products untuk stok per cabang — produk sudah global
      let dbQuery = supabase
        .from('branch_products')
        .select('stock, product_id, products!inner(id, name, unit)')
        .eq('branch_id', branchId ?? '')
        .ilike('products.name', `%${q}%`)
        .limit(10);
      const { data: bpRows, error: prodError } = await dbQuery;
      if (prodError) throw prodError;
      if (!bpRows?.length) { setSearchResults([]); return; }

      const products = bpRows.map((row: any) => ({
        id: row.products.id,
        name: row.products.name,
        unit: row.products.unit,
        stock: row.stock ?? 0,
      }));

      const productIds = products.map((p: any) => p.id);
      const { data: existingItems } = await supabase
        .from('stock_opname_items')
        .select('product_id, id, physical_stock, system_stock, difference, notes, created_at')
        .eq('opname_id', opname_id)
        .in('product_id', productIds);
      const existingMap = Object.fromEntries((existingItems ?? []).map((i: any) => [i.product_id, i]));

      setSearchResults(products.map((p: any) => {
        const ex = existingMap[p.id];
        return {
          id: ex?.id ?? `tmp-${p.id}`,
          opname_id: opname_id!,
          product_id: p.id,
          product_name: p.name,
          product_unit: p.unit ?? null,
          system_stock: ex?.system_stock ?? p.stock ?? 0,
          physical_stock: ex?.physical_stock ?? p.stock ?? 0,
          difference: ex?.difference ?? 0,
          notes: ex?.notes ?? null,
          created_at: ex?.created_at ?? new Date().toISOString(),
        };
      }));
    } catch (err: any) {
      console.error('[Scanner] search failed:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [opname_id, currentBranch]);

  const handleSelectFromManual = (item: StockOpnameItem) => {
    setLiveItem({
      product_id: item.product_id,
      product_name: item.product_name ?? item.product_id,
      product_unit: item.product_unit ?? null,
      system_stock: item.system_stock,
      physical_qty: item.physical_stock,
    });
    setShowManual(false);
    setQuery('');
    setSearchResults([]);
  };

  const handleFinish = async () => {
    if (liveItem && opname_id) {
      try { await updateOpnameItem(opname_id, liveItem.product_id, liveItem.physical_qty); } catch { /* lanjut */ }
    }
    router.replace(opname_id
      ? `/(backoffice)/stock/opname/${opname_id}` as any
      : '/(backoffice)/stock/opname' as any
    );
  };

  if (!permission) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, backgroundColor: '#f8f9fb' }]}>
        <Ionicons name="camera-outline" size={56} color="#bfc8cb" />
        <Text style={styles.permTitle}>Izin Kamera Diperlukan</Text>
        <Text style={styles.permDesc}>Izinkan akses kamera untuk scan barcode produk.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Izinkan Kamera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={styles.permCancel}>
          <Text style={styles.permCancelText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Kamera full screen */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'qr'],
        }}
        onBarcodeScanned={handleBarcodeScan}
      />

      {/* Viewfinder overlay — di tengah layar */}
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

      {/* Header melayang di atas */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>SCAN PRODUK</Text>

        <View style={styles.headerRight}>
          {savedCount > 0 && (
            <View style={styles.savedBadge}>
              <Ionicons name="checkmark" size={11} color="#fff" />
              <Text style={styles.savedBadgeText}>{savedCount}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.headerIconBtn, torchOn && styles.headerIconBtnActive]}
            onPress={() => setTorchOn((v) => !v)}
          >
            <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Hint di bawah viewfinder */}
      <View style={styles.hintWrap} pointerEvents="none">
        <Text style={styles.hintText}>
          {liveItem ? 'Scan lagi untuk ganti produk' : 'Arahkan ke barcode produk'}
        </Text>
      </View>

      {/* Panel overlay bawah */}
      <Animated.View style={[styles.kavWrapper, { bottom: keyboardOffset }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        scrollEnabled={showManual}
        contentContainerStyle={[
          styles.bottomOverlay,
          { paddingBottom: showManual ? 8 : insets.bottom + 12 },
          isTablet && styles.bottomOverlayTablet,
        ]}
      >

        {/* Card produk */}
        {liveItem && !showManual ? (
          <View style={styles.itemCard}>
            {/* Info produk */}
            <View style={styles.itemHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{liveItem.product_name}</Text>
                {liveItem.product_unit && (
                  <Text style={styles.itemUnit}>Satuan: {liveItem.product_unit}</Text>
                )}
              </View>
              <View style={[styles.diffBadge, { backgroundColor: isDiscrepancy ? '#ffdad6' : '#d0f3ff' }]}>
                <Text style={[styles.diffBadgeText, { color: isDiscrepancy ? '#ba1a1a' : PRIMARY }]}>
                  {isDiscrepancy ? (diff > 0 ? `+${diff}` : `${diff}`) : 'OK'}
                </Text>
              </View>
            </View>

            {/* Qty row */}
            <View style={styles.qtyRow}>
              <View style={styles.sysBox}>
                <Text style={styles.sysLabel}>SISTEM</Text>
                <Text style={styles.sysVal}>{liveItem.system_stock}</Text>
              </View>
              <View style={styles.qtyControls}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setLiveItem((v) => v && { ...v, physical_qty: Math.max(0, v.physical_qty - 1) })}
                >
                  <Ionicons name="remove" size={22} color={PRIMARY} />
                </TouchableOpacity>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="number-pad"
                  value={String(liveItem.physical_qty)}
                  onChangeText={(v) => {
                    const n = parseInt(v, 10);
                    if (!isNaN(n)) setLiveItem((prev) => prev && { ...prev, physical_qty: n });
                  }}
                />
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setLiveItem((v) => v && { ...v, physical_qty: v.physical_qty + 1 })}
                >
                  <Ionicons name="add" size={22} color={PRIMARY} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Aksi */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.saveBtnText}>SIMPAN</Text>
                    </>
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.doneBtn} onPress={handleFinish}>
                <Text style={styles.doneBtnText}>SELESAI</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : !showManual ? (
          /* Tombol aksi saat belum ada produk */
          <View style={styles.idleRow}>
            <TouchableOpacity
              style={styles.manualBtn}
              onPress={() => setShowManual(true)}
            >
              <Ionicons name="search" size={15} color={PRIMARY} />
              <Text style={styles.manualBtnText}>Cari Manual</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exitBtn} onPress={handleFinish}>
              <Ionicons name="flag-outline" size={15} color="rgba(255,255,255,0.85)" />
              <Text style={styles.exitBtnText}>Selesai</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Tombol di bawah card */}
        {liveItem && !showManual && (
          <TouchableOpacity
            style={styles.manualBtnSecondary}
            onPress={() => setShowManual(true)}
          >
            <Ionicons name="search" size={14} color="rgba(255,255,255,0.75)" />
            <Text style={styles.manualBtnSecondaryText}>Cari Manual</Text>
          </TouchableOpacity>
        )}
        {showManual && (
          <TouchableOpacity
            style={styles.manualBtnSecondary}
            onPress={() => { setShowManual(false); setQuery(''); setSearchResults([]); Keyboard.dismiss(); }}
          >
            <Ionicons name="arrow-back" size={14} color="rgba(255,255,255,0.75)" />
            <Text style={styles.manualBtnSecondaryText}>Kembali</Text>
          </TouchableOpacity>
        )}

        {/* Search manual panel */}
        {showManual && (
          <View style={styles.searchPanel}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={15} color="#70787c" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Ketik nama produk..."
                placeholderTextColor="#70787c"
                value={query}
                onChangeText={handleSearch}
                autoFocus
              />
              {searching
                ? <ActivityIndicator size="small" color={PRIMARY} style={{ marginRight: 6 }} />
                : query.length > 0 && (
                  <TouchableOpacity onPress={() => { setQuery(''); setSearchResults([]); }}>
                    <Ionicons name="close-circle" size={16} color="#70787c" style={{ marginRight: 6 }} />
                  </TouchableOpacity>
                )
              }
            </View>
            {searchResults.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.resultItem}
                onPress={() => handleSelectFromManual(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.resultName} numberOfLines={1}>{item.product_name}</Text>
                <Text style={styles.resultStock}>{item.system_stock}</Text>
              </TouchableOpacity>
            ))}
            {query.length >= 2 && !searching && searchResults.length === 0 && (
              <Text style={styles.noResult}>Produk tidak ditemukan</Text>
            )}
          </View>
        )}
      </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { justifyContent: 'center', alignItems: 'center', gap: 14, padding: 32 },
  kavWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 },

  // Header melayang
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 10,
  },
  headerIconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerIconBtnActive: { backgroundColor: '#f59e0b' },
  headerTitle: {
    flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700',
    color: '#fff', letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  savedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#22c55e', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
  },
  savedBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Viewfinder
  vfTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  vfMiddle: { flexDirection: 'row', height: 210 },
  vfSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  vfBox: { width: 210, height: 210 },
  corner: { position: 'absolute', width: 22, height: 22, borderColor: '#fff', borderWidth: 0 },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  scanLine: {
    position: 'absolute', top: '50%', left: 6, right: 6, height: 2,
    backgroundColor: PRIMARY,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6,
  },
  vfBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },

  // Hint teks
  hintWrap: {
    position: 'absolute', left: 0, right: 0,
    // tepat di bawah viewfinder: top 50% + setengah vfBox = 50% + 105
    top: '55%',
    alignItems: 'center',
    zIndex: 10,
  },
  hintText: {
    fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
  },

  bottomOverlay: {
    paddingHorizontal: 12, paddingTop: 8,
  },
  bottomOverlayTablet: { paddingHorizontal: 80 },

  // Card produk
  itemCard: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 12,
  },
  itemHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, gap: 8,
  },
  itemName: { fontSize: 14, fontWeight: '700', color: '#191c1d' },
  itemUnit: { fontSize: 10, color: '#70787c', marginTop: 1 },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  diffBadgeText: { fontSize: 11, fontWeight: '700' },

  qtyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingBottom: 8,
  },
  sysBox: {
    alignItems: 'center', backgroundColor: '#f2f4f5',
    borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8, minWidth: 52,
  },
  sysLabel: { fontSize: 9, fontWeight: '700', color: '#70787c', letterSpacing: 0.5 },
  sysVal: { fontSize: 16, fontWeight: '700', color: '#191c1d', marginTop: 1 },
  qtyControls: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 48, height: 48, borderRadius: 8, borderWidth: 2, borderColor: PRIMARY,
    justifyContent: 'center', alignItems: 'center',
  },
  qtyInput: {
    flex: 1, height: 48, textAlign: 'center', fontSize: 20, fontWeight: '700',
    borderWidth: 2, borderColor: '#bfc8cb', borderRadius: 8,
    backgroundColor: '#f8f9fb', color: '#191c1d',
    paddingVertical: 0,
  },

  actionRow: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  saveBtn: {
    flex: 2, height: 40, backgroundColor: PRIMARY, borderRadius: 8,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  doneBtn: {
    flex: 1, height: 40, borderWidth: 2, borderColor: PRIMARY, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  doneBtnText: { fontSize: 12, fontWeight: '700', color: PRIMARY },

  // Idle row (belum scan)
  idleRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  manualBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1.5, borderColor: PRIMARY,
  },
  manualBtnText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  exitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  exitBtnText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },

  // Tombol manual kecil di bawah card
  manualBtnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    marginTop: 8,
  },
  manualBtnSecondaryText: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },

  // Search panel
  searchPanel: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 8,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, height: 44,
    borderBottomWidth: 1, borderBottomColor: '#f2f4f5',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#191c1d' },
  resultItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f2f4f5',
  },
  resultName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#191c1d' },
  resultStock: { fontSize: 16, fontWeight: '700', color: PRIMARY, marginLeft: 12 },
  noResult: { fontSize: 13, color: '#70787c', textAlign: 'center', padding: 14 },

  // Permission
  permTitle: { fontSize: 18, fontWeight: '700', color: '#191c1d', textAlign: 'center' },
  permDesc: { fontSize: 14, color: '#70787c', textAlign: 'center' },
  permBtn: { backgroundColor: PRIMARY, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10, marginTop: 8 },
  permBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  permCancel: { paddingVertical: 10 },
  permCancelText: { fontSize: 14, color: '#70787c' },
});
