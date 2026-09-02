import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, TextInput, Modal, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CameraView, Camera } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { qrisService } from '@/lib/qrisService';

export default function QrisSettingScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasActive, setHasActive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [merchantName, setMerchantName] = useState('');
  const [merchantCity, setMerchantCity] = useState('');
  const [qrisContent, setQrisContent] = useState('');

  const [showScanner, setShowScanner] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await qrisService.getActive();
    if (data) {
      setHasActive(true);
      setMerchantName(data.merchant_name);
      setMerchantCity(data.merchant_city);
      setQrisContent(data.qris_content);
      setLastUpdated(data.updated_at);
    }
    setLoading(false);
  };

  const openScanner = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setCameraPermission(status === 'granted');
    if (status === 'granted') {
      setShowScanner(true);
    } else {
      Alert.alert('Izin Kamera', 'Izinkan akses kamera untuk scan QR code QRIS.');
    }
  };

  const onScanned = ({ data }: { data: string }) => {
    setShowScanner(false);
    setQrisContent(data);

    if (data.length < 50) {
      Alert.alert('Peringatan', `QRIS terlalu pendek (${data.length} karakter). Pastikan scan QR QRIS lengkap.`);
      return;
    }

    const parsed = qrisService.parse(data);
    if (parsed.merchantName) setMerchantName(parsed.merchantName);
    if (parsed.merchantCity) setMerchantCity(parsed.merchantCity);

    Alert.alert('Berhasil', `QRIS berhasil di-scan (${data.length} karakter).`);
  };

  const handleParse = () => {
    if (!qrisContent.trim()) { Alert.alert('', 'Isi konten QRIS terlebih dahulu.'); return; }
    const parsed = qrisService.parse(qrisContent.trim());
    if (parsed.merchantName) setMerchantName(parsed.merchantName);
    if (parsed.merchantCity) setMerchantCity(parsed.merchantCity);
    Alert.alert('Parse', parsed.merchantName ? `Nama: ${parsed.merchantName}\nKota: ${parsed.merchantCity ?? '-'}` : 'Tidak bisa parse info merchant dari QRIS ini.');
  };

  const handleSave = async () => {
    if (!merchantName.trim()) { Alert.alert('', 'Nama merchant harus diisi.'); return; }
    if (!qrisContent.trim()) { Alert.alert('', 'Konten QRIS harus diisi.'); return; }
    if (qrisContent.trim().length < 50) {
      Alert.alert('', `QRIS terlalu pendek (${qrisContent.trim().length} karakter). Pastikan QRIS string lengkap.`);
      return;
    }
    setSaving(true);
    try {
      await qrisService.save({
        merchant_name: merchantName.trim(),
        merchant_city: merchantCity.trim(),
        qris_content: qrisContent.trim(),
      });
      Alert.alert('Berhasil', 'Pengaturan QRIS berhasil disimpan.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Gagal', e.message || 'Gagal menyimpan QRIS.');
    }
    setSaving(false);
  };

  const handleDelete = () => {
    Alert.alert('Hapus QRIS', 'Yakin ingin menonaktifkan QRIS?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus', style: 'destructive',
        onPress: async () => {
          setSaving(true);
          await qrisService.delete();
          setHasActive(false);
          setQrisContent('');
          setMerchantName('');
          setMerchantCity('');
          setLastUpdated(null);
          setSaving(false);
          Alert.alert('', 'QRIS dinonaktifkan.');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#347385" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pengaturan QRIS</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#56B2C1" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#347385" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pengaturan QRIS</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TabletCenteredView>
          {/* Info */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color="#347385" />
            <Text style={styles.infoText}>
              Scan QR code QRIS statis dari kartu atau aplikasi merchant Anda. Sistem akan otomatis mengkonversi ke QRIS dinamis (nominal terisi otomatis saat pelanggan scan).
            </Text>
          </View>

          {/* Status aktif */}
          {hasActive && lastUpdated && (
            <View style={styles.statusCard}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>QRIS Aktif</Text>
              <Text style={styles.statusDate}>
                Update: {new Date(lastUpdated).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>
            </View>
          )}

          {/* Tombol scan */}
          <TouchableOpacity style={styles.scanBtn} onPress={openScanner} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={22} color="#fff" />
            <Text style={styles.scanBtnText}>Scan QR Code QRIS</Text>
          </TouchableOpacity>

          <Text style={styles.orText}>— atau paste string QRIS di bawah —</Text>

          {/* Form */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Konten QRIS</Text>
            <Text style={styles.fieldLabel}>String QRIS (dari aplikasi / dashboard merchant)</Text>
            <View style={styles.qrisInputWrap}>
              <TextInput
                style={styles.qrisInput}
                value={qrisContent}
                onChangeText={setQrisContent}
                placeholder="00020101021126..."
                placeholderTextColor="#D1D5DB"
                multiline
                numberOfLines={5}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {qrisContent.length > 0 && (
                <View style={[styles.qrisLenBadge, { backgroundColor: qrisContent.length >= 50 ? '#DCFCE7' : '#FEF2F2' }]}>
                  <Ionicons
                    name={qrisContent.length >= 50 ? 'checkmark-circle' : 'alert-circle'}
                    size={14}
                    color={qrisContent.length >= 50 ? '#16A34A' : '#EF4444'}
                  />
                  <Text style={[styles.qrisLenText, { color: qrisContent.length >= 50 ? '#16A34A' : '#EF4444' }]}>
                    {qrisContent.length} karakter {qrisContent.length < 50 ? '(terlalu pendek)' : ''}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.parseBtn} onPress={handleParse} activeOpacity={0.7}>
              <Ionicons name="search-outline" size={15} color="#347385" />
              <Text style={styles.parseBtnText}>Parse Info Merchant Otomatis</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Informasi Merchant</Text>
            <Text style={styles.fieldLabel}>Nama Merchant</Text>
            <TextInput
              style={styles.input}
              value={merchantName}
              onChangeText={setMerchantName}
              placeholder="Nama Toko"
              placeholderTextColor="#D1D5DB"
            />
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Kota</Text>
            <TextInput
              style={styles.input}
              value={merchantCity}
              onChangeText={setMerchantCity}
              placeholder="Jakarta"
              placeholderTextColor="#D1D5DB"
            />
          </View>

          {/* Tips */}
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>Cara mendapatkan string QRIS</Text>
            <Text style={styles.tipItem}>1. Buka aplikasi mobile banking / e-wallet merchant Anda</Text>
            <Text style={styles.tipItem}>2. Tampilkan QR code QRIS statis</Text>
            <Text style={styles.tipItem}>3. Tap "Scan QR Code QRIS" di atas, arahkan ke QR tersebut</Text>
            <Text style={styles.tipItem}>4. Atau copy string dari dashboard merchant dan paste di field atas</Text>
          </View>

          {hasActive && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
              <Text style={styles.deleteBtnText}>Nonaktifkan QRIS</Text>
            </TouchableOpacity>
          )}
        </TabletCenteredView>
      </ScrollView>

      {/* Tombol simpan sticky */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Simpan Pengaturan QRIS</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Scanner modal */}
      <Modal visible={showScanner} animationType="slide" statusBarTranslucent>
        <View style={styles.scannerContainer}>
          <View style={[styles.scannerHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => setShowScanner(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scan QR QRIS</Text>
            <View style={{ width: 40 }} />
          </View>

          {cameraPermission && (
            <CameraView
              style={styles.camera}
              facing="back"
              onBarcodeScanned={onScanned}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            >
              <View style={styles.scannerOverlay}>
                <View style={styles.scannerFrame}>
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
                <Text style={styles.scannerHint}>Arahkan ke QR code QRIS merchant</Text>
              </View>
            </CameraView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#EEF8FA', borderRadius: 12, padding: 14,
    margin: 16, borderWidth: 1, borderColor: '#A9DFE9',
  },
  infoText: { flex: 1, fontSize: 13, color: '#347385', lineHeight: 19 },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12,
    marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#BBF7D0',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  statusText: { fontSize: 13, fontWeight: '700', color: '#16A34A', flex: 1 },
  statusDate: { fontSize: 11, color: '#6B7280' },

  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#347385', borderRadius: 14, padding: 16,
    marginHorizontal: 16, marginBottom: 12,
  },
  scanBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  orText: { textAlign: 'center', color: '#9CA3AF', fontSize: 12, marginBottom: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginBottom: 12,
    padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 6 },

  qrisInputWrap: { marginBottom: 10 },
  qrisInput: {
    borderWidth: 1, borderColor: '#D4EFF4', borderRadius: 10,
    padding: 12, fontSize: 13, color: '#111827',
    textAlignVertical: 'top', minHeight: 100, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  qrisLenBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginTop: 6, alignSelf: 'flex-start',
  },
  qrisLenText: { fontSize: 12, fontWeight: '600' },

  parseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#56B2C1', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start',
  },
  parseBtnText: { fontSize: 12, fontWeight: '700', color: '#347385' },

  input: {
    borderWidth: 1, borderColor: '#D4EFF4', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#111827',
  },

  tipsCard: {
    backgroundColor: '#FFFBEB', borderRadius: 12, margin: 16,
    padding: 14, gap: 6, borderWidth: 1, borderColor: '#FDE68A',
  },
  tipsTitle: { fontSize: 12, fontWeight: '700', color: '#92400E', marginBottom: 4 },
  tipItem: { fontSize: 12, color: '#78350F', lineHeight: 18 },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 16, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },

  footer: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#56B2C1', borderRadius: 14, paddingVertical: 15,
  },
  saveBtnDisabled: { backgroundColor: '#D1D5DB' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Scanner
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#347385',
  },
  closeBtn: { padding: 4 },
  scannerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  camera: { flex: 1 },
  scannerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', gap: 24,
  },
  scannerFrame: {
    width: 260, height: 260,
    justifyContent: 'space-between',
  },
  corner: { position: 'absolute', width: 32, height: 32, borderColor: '#fff', borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  scannerHint: { color: '#fff', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
});
