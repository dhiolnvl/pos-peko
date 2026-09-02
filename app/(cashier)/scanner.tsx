import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  FlatList,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import { useProductStore } from "@/store/productStore";
import { usePosStore, CartItem } from "@/store/posStore";
import { formatCurrency } from "@/constants/config";

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const allProducts = useProductStore((s) => s.allProducts);
  const posStore = usePosStore();
  const cart = usePosStore((s) => s.cart);
  const [permission, requestPermission] = useCameraPermissions();
  const [feedback, setFeedback] = useState<{
    message: string;
    ok: boolean;
  } | null>(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const cooldown = useRef(false);
  const lastScanned = useRef<string>('');
  const lastScannedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [mode, setMode] = useState<'camera' | 'hid'>('camera');
  const hidInput = useRef<TextInput>(null);
  const hidBuffer = useRef('');
  const hidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beepSound = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    Audio.Sound.createAsync(require("@/assets/beep-scan.wav")).then(
      ({ sound }) => {
        beepSound.current = sound;
      },
    );
    return () => {
      beepSound.current?.unloadAsync();
    };
  }, []);

  const playBeep = useCallback(() => {
    if (!beepSound.current) return;
    beepSound.current
      .setPositionAsync(0)
      .then(() => beepSound.current?.playAsync())
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      setCameraKey((k) => k + 1);
      cooldown.current = false;
      lastScanned.current = '';
      setFeedback(null);
      hidBuffer.current = '';
      setTimeout(() => hidInput.current?.focus(), 100);
    }, []),
  );

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (cooldown.current) return;
      const barcode = data.trim();
      // Abaikan scan duplikat dalam 1.5 detik
      if (barcode === lastScanned.current) return;
      cooldown.current = true;
      lastScanned.current = barcode;
      if (lastScannedTimer.current) clearTimeout(lastScannedTimer.current);
      lastScannedTimer.current = setTimeout(() => { lastScanned.current = ''; }, 1500);

      const found = allProducts.find(
        (p) =>
          p.is_active === 1 &&
          p.barcode?.toLowerCase() === barcode.toLowerCase(),
      );

      let delay = 1200;

      if (found) {
        if (found.stock <= 0) {
          Vibration.vibrate(300);
          setFeedback({ message: `${found.name} — stok habis`, ok: false });
        } else {
          Vibration.vibrate(80);
          playBeep();
          posStore.addToCart(found);
          setFeedback({ message: `+1  ${found.name}`, ok: true });
          delay = 800;
        }
      } else {
        console.log('[Scanner Kamera] barcode tidak ditemukan:', JSON.stringify(barcode), 'length:', barcode.length);
        Vibration.vibrate([0, 150, 80, 150]);
        setNotFoundBarcode(barcode);
        // cooldown tetap true sampai user dismiss notFoundBarcode
        return;
      }

      setTimeout(() => {
        setFeedback(null);
        cooldown.current = false;
      }, delay);
    },
    [allProducts, posStore, playBeep],
  );

  const processHidBarcode = useCallback(() => {
    if (hidTimer.current) clearTimeout(hidTimer.current);
    hidTimer.current = null;
    const barcode = hidBuffer.current.trim().replace(/\n|\r/g, '');
    hidBuffer.current = '';
    hidInput.current?.clear();
    setTimeout(() => hidInput.current?.focus(), 30);
    if (barcode.length < 2) return;

    // Abaikan duplikat dalam 1.5 detik
    if (barcode === lastScanned.current) return;
    lastScanned.current = barcode;
    if (lastScannedTimer.current) clearTimeout(lastScannedTimer.current);
    lastScannedTimer.current = setTimeout(() => { lastScanned.current = ''; }, 1500);

    const found = allProducts.find(
      (p) => p.is_active === 1 && p.barcode?.toLowerCase() === barcode.toLowerCase(),
    );
    if (found) {
      if (found.stock <= 0) {
        Vibration.vibrate(300);
        setFeedback({ message: `${found.name} — stok habis`, ok: false });
      } else {
        Vibration.vibrate(80);
        playBeep();
        posStore.addToCart(found);
        setFeedback({ message: `+1  ${found.name}`, ok: true });
      }
    } else {
      console.log('[Scanner HID] barcode tidak ditemukan:', JSON.stringify(barcode), 'length:', barcode.length);
      Vibration.vibrate([0, 150, 80, 150]);
      setNotFoundBarcode(barcode);
      // cooldown tetap true sampai user dismiss
      return;
    }
    setTimeout(() => setFeedback(null), 1000);
  }, [allProducts, posStore, playBeep]);

  const handleHidChange = useCallback((text: string) => {
    hidBuffer.current = text;
    if (hidTimer.current) clearTimeout(hidTimer.current);
    // 150ms — lebih toleran untuk scanner yang kirim karakter lambat
    hidTimer.current = setTimeout(processHidBarcode, 150);
  }, [processHidBarcode]);

  const handleHidSubmit = useCallback(() => {
    processHidBarcode();
  }, [processHidBarcode]);

  const totalItems = posStore.getTotalItems();
  const total = posStore.getTotal();

  if (!permission) {
    return <View style={styles.root} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="camera-outline" size={56} color="#9CA3AF" />
        <Text style={styles.permText}>
          Izin kamera diperlukan untuk scan barcode
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Izinkan Kamera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* HID input tersembunyi — selalu ada agar scanner eksternal selalu tertangkap */}
      <TextInput
        ref={hidInput}
        style={styles.hidInput}
        onChangeText={handleHidChange}
        onSubmitEditing={handleHidSubmit}
        autoCorrect={false}
        autoCapitalize="none"
        enterKeyHint="done"
        showSoftInputOnFocus={false}
      />

      {/* 2/3 kamera / header kecil saat HID */}
      <View style={mode === 'hid' ? styles.hidTopSection : styles.cameraSection}>
        {mode === 'camera' ? (
          <CameraView
            key={cameraKey}
            style={StyleSheet.absoluteFill}
            facing={facing}
            barcodeScannerSettings={{
              barcodeTypes: [
                "ean13", "ean8", "code128", "code39",
                "qr", "upc_a", "upc_e", "itf14", "codabar",
              ],
            }}
            onBarcodeScanned={handleScan}
          />
        ) : null}

        {/* Header */}
        <View style={mode === 'hid' ? styles.headerHid : styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Barcode</Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              setMode((m) => {
                const next = m === 'camera' ? 'hid' : 'camera';
                if (next === 'hid') setTimeout(() => hidInput.current?.focus(), 150);
                return next;
              });
            }}
          >
            <Ionicons
              name={mode === 'camera' ? 'barcode-outline' : 'camera-outline'}
              size={22}
              color="#fff"
            />
          </TouchableOpacity>
        </View>

        {/* Status bar HID */}
        {mode === 'hid' && (
          <TouchableOpacity
            style={[styles.hidStatusBar, feedback && (!feedback.ok ? styles.hidStatusError : styles.hidStatusOk)]}
            activeOpacity={1}
            onPress={() => hidInput.current?.focus()}
          >
            <Ionicons
              name={feedback ? (feedback.ok ? 'checkmark-circle' : 'close-circle') : 'barcode-outline'}
              size={16}
              color="#fff"
            />
            <Text style={styles.hidStatusText} numberOfLines={1}>
              {feedback ? feedback.message : 'Siap scan — arahkan scanner ke barcode'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Viewfinder — hanya saat mode kamera */}
        {mode === 'camera' && (
          <>
            <View style={styles.viewfinder} pointerEvents="none">
              <View style={styles.frame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <Text style={styles.hint}>Arahkan kamera ke barcode produk</Text>
            </View>
            {/* Feedback toast kamera */}
            {feedback && (
              <View style={[styles.toast, !feedback.ok && styles.toastError]}>
                <Ionicons
                  name={feedback.ok ? "checkmark-circle" : "close-circle"}
                  size={20} color="#fff"
                />
                <Text style={styles.toastText} numberOfLines={2}>
                  {feedback.message}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.flipBtn}
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            >
              <Ionicons name="camera-reverse-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* list produk — lebih lebar saat mode HID */}
      <View style={mode === 'hid' ? styles.cartSectionWide : styles.cartSection}>
        {/* Panel header */}
        <View style={styles.cartHeader}>
          <View style={styles.cartHeaderLeft}>
            <Ionicons name="cart" size={16} color="#347385" />
            <Text style={styles.cartHeaderTitle}>
              {totalItems > 0 ? `${totalItems} item` : "Keranjang kosong"}
            </Text>
          </View>
          <Text style={styles.cartHeaderTotal}>{formatCurrency(total)}</Text>
        </View>

        {cart.length === 0 ? (
          <View style={styles.emptyCart}>
            <Ionicons name="scan-outline" size={32} color="#CBD5E1" />
            <Text style={styles.emptyCartText}>
              Scan barcode untuk{"\n"}menambah produk
            </Text>
          </View>
        ) : (
          <FlatList
            data={[...cart].reverse()}
            keyExtractor={(item) => item.productId}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingTop: 4,
              paddingBottom: 4,
            }}
            renderItem={({ item }: { item: CartItem }) => (
              <CartRow
                item={item}
                onIncrease={() =>
                  posStore.updateQty(item.productId, item.quantity + 1)
                }
                onDecrease={() => {
                  if (item.quantity <= 1)
                    posStore.removeFromCart(item.productId);
                  else posStore.updateQty(item.productId, item.quantity - 1);
                }}
              />
            )}
          />
        )}
      </View>

      {/* Modal produk tidak ditemukan */}
      {notFoundBarcode && (
        <View style={styles.notFoundOverlay}>
          <View style={styles.notFoundCard}>
            <View style={styles.notFoundIcon}>
              <Ionicons name="search-outline" size={28} color="#E37518" />
            </View>
            <Text style={styles.notFoundTitle}>Produk Tidak Ditemukan</Text>
            <Text style={styles.notFoundBarcode}>{notFoundBarcode}</Text>
            <Text style={styles.notFoundSub}>Barcode ini belum terdaftar di sistem. Mau tambah produk baru?</Text>
            <TouchableOpacity
              style={styles.notFoundBtnPrimary}
              onPress={() => {
                const bc = notFoundBarcode;
                setNotFoundBarcode(null);
                cooldown.current = false;
                router.push(`/(cashier)/products/form?barcode=${encodeURIComponent(bc)}`);
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.notFoundBtnPrimaryText}>Tambah Produk</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.notFoundBtnSecondary}
              onPress={() => { setNotFoundBarcode(null); cooldown.current = false; }}
            >
              <Ionicons name="scan-outline" size={18} color="#347385" />
              <Text style={styles.notFoundBtnSecondaryText}>Scan Ulang</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tombol selesai — selalu nempel di bawah */}
      <View style={[styles.doneBtnWrapper]}>
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-done" size={20} color="#fff" />
          <Text style={styles.doneBtnText}>
            {totalItems > 0 ? `Selesai (${totalItems} item)` : "Selesai Scan"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CartRow({
  item,
  onIncrease,
  onDecrease,
}: {
  item: CartItem;
  onIncrease: () => void;
  onDecrease: () => void;
}) {
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.info}>
        <Text style={rowStyles.name} numberOfLines={1}>
          {item.productName}
        </Text>
        <Text style={rowStyles.price}>{formatCurrency(item.subtotal)}</Text>
      </View>
      <View style={rowStyles.qtyRow}>
        <TouchableOpacity
          style={rowStyles.qtyBtn}
          onPress={onDecrease}
          hitSlop={8}
        >
          <Ionicons
            name={item.quantity <= 1 ? "trash-outline" : "remove"}
            size={14}
            color="#EF4444"
          />
        </TouchableOpacity>
        <Text style={rowStyles.qty}>{item.quantity}</Text>
        <TouchableOpacity
          style={rowStyles.qtyBtn}
          onPress={onIncrease}
          hitSlop={8}
        >
          <Ionicons name="add" size={14} color="#347385" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 32,
  },

  permText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
  permBtn: {
    backgroundColor: "#347385",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  permBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  backLink: { marginTop: 4 },
  backLinkText: { color: "#9CA3AF", fontSize: 14 },

  hidInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    top: -100,
  },

  // header kecil saat mode HID — hanya setinggi header bar
  hidTopSection: {
    backgroundColor: '#0F172A',
    overflow: 'hidden',
  },

  // 2/3 kamera
  cameraSection: {
    flex: 2,
    backgroundColor: "#000",
    overflow: "hidden",
  },

  hidStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1E3A4A',
  },
  hidStatusOk: { backgroundColor: '#166534' },
  hidStatusError: { backgroundColor: '#7F1D1D' },
  hidStatusText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },

  hidArea: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  hidAreaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginTop: 8,
  },
  hidAreaSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  hidFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 16,
    marginHorizontal: 24,
  },
  hidFeedbackError: { backgroundColor: '#EF4444' },
  hidFeedbackText: { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 },

  flipBtn: {
    position: 'absolute',
    bottom: 14,
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerHid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#0F172A',
  },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 15, fontWeight: "700", color: "#fff" },

  viewfinder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  frame: { width: 220, height: 160, position: "relative" },
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: "#56B2C1",
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  hint: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    textAlign: "center",
    marginTop: 14,
  },

  toast: {
    position: "absolute",
    bottom: 12,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#22C55E",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    elevation: 8,
  },
  toastError: { backgroundColor: "#EF4444" },
  toastText: { color: "#fff", fontSize: 13, fontWeight: "700", flex: 1 },

  // 1/3 cart (mode kamera)
  cartSection: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  // mode HID — ambil semua sisa ruang
  cartSectionWide: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  cartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  cartHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cartHeaderTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
  },
  cartHeaderTotal: {
    fontSize: 13,
    fontWeight: "700",
    color: "#347385",
  },

  emptyCart: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 16,
  },
  emptyCartText: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 18,
  },

  doneBtnWrapper: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingBottom: 10,
  },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#347385",
    borderRadius: 12,
    paddingVertical: 13,
    elevation: 2,
  },
  doneBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  notFoundOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
    padding: 24, zIndex: 100,
  },
  notFoundCard: {
    backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 360,
    padding: 24, alignItems: 'center', gap: 8,
  },
  notFoundIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#FFFAF0', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  notFoundTitle: { fontSize: 17, fontWeight: '800', color: '#1A202C' },
  notFoundBarcode: { fontSize: 13, color: '#A0AEC0', fontFamily: 'monospace' },
  notFoundSub: { fontSize: 13, color: '#718096', textAlign: 'center', lineHeight: 19, marginTop: 2 },
  notFoundBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#347385', borderRadius: 12, paddingVertical: 13,
    width: '100%', marginTop: 8,
  },
  notFoundBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  notFoundBtnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#347385', borderRadius: 12, paddingVertical: 11,
    width: '100%',
  },
  notFoundBtnSecondaryText: { color: '#347385', fontWeight: '600', fontSize: 14 },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  info: { flex: 1, marginRight: 8 },
  name: { fontSize: 13, fontWeight: "600", color: "#1E293B" },
  price: { fontSize: 12, color: "#64748B", marginTop: 1 },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  qty: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    minWidth: 20,
    textAlign: "center",
  },
});
