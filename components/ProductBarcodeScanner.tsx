import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, Vibration,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchOFFProduct, type OFFProduct } from '@/lib/openFoodFacts';
import { fetchMasterProductIpos } from '@/lib/masterProductLookup';

interface Props {
  visible: boolean;
  onClose: () => void;
  onFound: (product: OFFProduct) => void;
  onNotFound: (barcode: string) => void;
  // Jika ada, dipanggil sebelum cek OFF API. Return true = produk sudah ada, scanner stop.
  onExistingFound?: (barcode: string) => boolean;
}

export function ProductBarcodeScanner({ visible, onClose, onFound, onNotFound, onExistingFound }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<'scanning' | 'loading' | 'notfound'>('scanning');
  const [lastBarcode, setLastBarcode] = useState('');
  const cooldown = useRef(false);

  const handleScan = useCallback(async ({ data }: { data: string }) => {
    if (cooldown.current || !data) return;
    cooldown.current = true;
    Vibration.vibrate(50);

    const trimmed = data.trim();
    setLastBarcode(trimmed);

    // Cek produk lokal dulu — kalau ada, serahkan ke pemanggil dan stop
    if (onExistingFound && onExistingFound(trimmed)) {
      setTimeout(() => { setStatus('scanning'); cooldown.current = false; }, 300);
      return;
    }

    setStatus('loading');

    // Cek OpenFoodFacts dan database master IPOS (50rb item) sekaligus
    const [offProduct, masterProduct] = await Promise.all([
      fetchOFFProduct(trimmed),
      fetchMasterProductIpos(trimmed),
    ]);

    const offName = offProduct?.name || '';
    const iposName = masterProduct?.nama_item || '';

    if (offProduct && offName) {
      // Pakai nama yang paling panjang, gambar tetap dari OFF
      const name = iposName.length > offName.length ? iposName : offName;
      onFound({ ...offProduct, name });
      // reset untuk scan berikutnya jika modal dibuka lagi
      setTimeout(() => {
        setStatus('scanning');
        cooldown.current = false;
      }, 500);
      return;
    }

    if (masterProduct) {
      onFound({
        barcode: trimmed,
        name: iposName,
        brands: masterProduct.merek || null,
        image_url: null,
        ingredients_text: null,
        product_quantity: null,
        product_quantity_unit: masterProduct.satuan || null,
        serving_size: null,
        nutriscore_grade: null,
        nova_group: null,
        allergens: null,
        off_categories: null,
        energy_kcal_100g: null,
        carbohydrates_100g: null,
        fat_100g: null,
        saturated_fat_100g: null,
        sugars_100g: null,
        proteins_100g: null,
        salt_100g: null,
        nutrient_levels: null,
      });
      setTimeout(() => {
        setStatus('scanning');
        cooldown.current = false;
      }, 500);
      return;
    }

    setStatus('notfound');
    // biarkan user pilih: manual atau scan ulang
  }, [onFound, onExistingFound]);

  const handleUseManual = () => {
    setStatus('scanning');
    cooldown.current = false;
    onNotFound(lastBarcode);
  };

  const handleRescan = () => {
    setStatus('scanning');
    cooldown.current = false;
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Barcode Produk</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Camera */}
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Ionicons name="camera-outline" size={48} color="#A0AEC0" />
            <Text style={styles.permissionText}>Izin kamera diperlukan</Text>
            <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permBtnText}>Beri Izin</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            {status === 'scanning' && (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
                onBarcodeScanned={handleScan}
              />
            )}

            {/* Viewfinder overlay */}
            {status === 'scanning' && (
              <View style={styles.overlay}>
                <View style={styles.finder}>
                  <View style={[styles.corner, styles.tl]} />
                  <View style={[styles.corner, styles.tr]} />
                  <View style={[styles.corner, styles.bl]} />
                  <View style={[styles.corner, styles.br]} />
                </View>
                <Text style={styles.hint}>Arahkan ke barcode produk</Text>
              </View>
            )}

            {status === 'loading' && (
              <View style={styles.statusBox}>
                <ActivityIndicator color="#56B2C1" size="large" />
                <Text style={styles.statusText}>Mencari di database...</Text>
                <Text style={styles.statusBarcode}>{lastBarcode}</Text>
              </View>
            )}

            {status === 'notfound' && (
              <View style={styles.statusBox}>
                <Ionicons name="search-outline" size={48} color="#ECC94B" />
                <Text style={styles.statusTitle}>Produk Tidak Ditemukan</Text>
                <Text style={styles.statusBarcode}>{lastBarcode}</Text>
                <Text style={styles.statusSub}>Barcode tidak ditemukan di database manapun.</Text>
                <TouchableOpacity style={styles.actionBtn} onPress={handleUseManual}>
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Input Manual</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleRescan}>
                  <Ionicons name="refresh-outline" size={18} color="#347385" />
                  <Text style={styles.secondaryBtnText}>Scan Ulang</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const CORNER = 24;
const BORDER = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },

  permissionBox: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32,
  },
  permissionText: { fontSize: 16, color: '#A0AEC0', textAlign: 'center' },
  permBtn: {
    backgroundColor: '#347385', paddingVertical: 12, paddingHorizontal: 28,
    borderRadius: 10,
  },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  cameraWrapper: { flex: 1, position: 'relative' },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', gap: 24,
  },
  finder: {
    width: 260, height: 160,
    position: 'relative',
  },
  corner: {
    position: 'absolute', width: CORNER, height: CORNER,
    borderColor: '#56B2C1',
  },
  tl: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER },
  tr: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER },
  bl: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER },
  br: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER },
  hint: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500' },

  statusBox: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32,
  },
  statusTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  statusText: { fontSize: 16, color: '#E2E8F0', fontWeight: '600' },
  statusBarcode: { fontSize: 14, color: '#A0AEC0', fontFamily: 'monospace' },
  statusSub: { fontSize: 14, color: '#718096', textAlign: 'center' },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#347385', paddingVertical: 13, paddingHorizontal: 28,
    borderRadius: 10, marginTop: 8, width: '100%', justifyContent: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#347385', paddingVertical: 11, paddingHorizontal: 28,
    borderRadius: 10, width: '100%', justifyContent: 'center',
  },
  secondaryBtnText: { color: '#347385', fontWeight: '600', fontSize: 15 },
});
