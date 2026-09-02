import React, { useEffect, useState, useRef, useCallback, memo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  Alert,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
  ScrollView,
  Modal,
  InteractionManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { useAuth } from "@/hooks/useAuth";
import { useProductStore, unitsCacheMap, awaitUnitsCacheReady, type Product, type ProductUnit, type ProductSortBy } from "@/store/productStore";
import { usePosStore, type Discount, type HeldTransaction, calcItemDiscountAmount, getActivePromoPrice } from "@/store/posStore";
import { useShiftStore } from "@/store/shiftStore";
import { PaymentSheet } from "@/components/PaymentSheet";
import { CashierHeader } from "@/components/CashierHeader";
import { MemberPicker } from "@/components/MemberPicker";
import RedeemPointModal from "@/components/RedeemPointModal";
import { OpenShiftScreen } from "@/components/OpenShiftScreen";
import { processTransaction } from "@/lib/transactionProcessor";
import { formatCurrency } from "@/constants/config";
import { calcPoints, getPointsPerRupiah } from "@/lib/memberQueries";
import { getActiveShift, ensureShiftTable } from "@/lib/shiftQueries";
import { mmkv } from "@/lib/mmkvStorage";
import { printReceipt } from "@/lib/printerHelper";
import { thermalPrinterService } from "@/lib/thermalPrinterService";

const KEY_STORE_SETTINGS = 'settings.store';

/* ─────────────────────────────────────────────
   ProductCard — memo agar hanya re-render jika
   data produk atau qty di keranjang berubah.
   Tidak subscribe ke seluruh posStore.
───────────────────────────────────────────── */
interface ProductCardProps {
  item: Product;
  cardWidth: number;
  bounceAnims: React.MutableRefObject<Record<string, Animated.Value>>;
  onPress: (product: Product) => void;
}

const ProductCard = memo(function ProductCard({ item, cardWidth, bounceAnims, onPress }: ProductCardProps) {
  const cartQty = usePosStore((s) => {
    const found = s.cart.find((c) => c.productId === item.id);
    return found ? found.quantity : 0;
  });

  const activePromoPrice = getActivePromoPrice(item);
  const outOfStock = item.stock <= 0;

  if (!bounceAnims.current[item.id]) {
    bounceAnims.current[item.id] = new Animated.Value(1);
  }
  const bounce = bounceAnims.current[item.id];

  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      disabled={outOfStock}
      activeOpacity={0.8}
      style={[
        styles.productCard,
        { width: cardWidth },
        outOfStock && styles.productCardDisabled,
      ]}
    >
      <Animated.View style={{ transform: [{ scale: bounce }] }}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.productImage} />
        ) : (
          <View style={styles.productImagePlaceholder}>
            <Text style={styles.productImageInitial}>
              {item.name.substring(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
        {outOfStock && (
          <View style={styles.outOfStockOverlay}>
            <Text style={styles.outOfStockText}>Habis</Text>
          </View>
        )}
        {cartQty > 0 && !outOfStock && (
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartQty}</Text>
          </View>
        )}
        {activePromoPrice && !outOfStock && (
          <View style={styles.promoBadge}>
            <Text style={styles.promoBadgeText}>PROMO</Text>
          </View>
        )}
      </Animated.View>
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        {activePromoPrice ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Text style={styles.productPromoPrice}>{formatCurrency(activePromoPrice)}</Text>
            <Text style={styles.productPriceStrike}>{formatCurrency(item.price)}</Text>
          </View>
        ) : (
          <Text style={styles.productPrice}>{formatCurrency(item.price)}</Text>
        )}
        <Text style={[styles.productStock, item.stock <= item.min_stock && styles.productStockLow]}>
          Stok: {item.stock} {item.unit || "pcs"}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nama A-Z' },
  { value: 'name_desc', label: 'Nama Z-A' },
  { value: 'price_asc', label: 'Harga Terendah' },
  { value: 'price_desc', label: 'Harga Tertinggi' },
  { value: 'stock_asc', label: 'Stok Terendah' },
  { value: 'stock_desc', label: 'Stok Tertinggi' },
  { value: 'updated_desc', label: 'Terbaru Diupdate' },
];

export default function CashierScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { logout, user, currentBranch } = useAuth();
  const {
    products,
    allProducts,
    categories,
    isLoading,
    isLoadingMore,
    hasMore,
    sortBy,
    syncFromSupabase,
    loadCategories,
    loadMore,
    setSearchQuery,
    setSelectedCategory,
    setSortBy,
    refreshStockFromSupabase,
    fetchProductUnits,
  } = useProductStore();
  const posStore = usePosStore();
  const cart = usePosStore((s) => s.cart);
  const cartLength = usePosStore((s) => s.cart.length);
  const cartEmpty = cartLength === 0;
  const totalItems = usePosStore((s) => s.getTotalItems());
  const subtotal = usePosStore((s) => s.getSubtotal());
  const discountAmt = usePosStore((s) => s.getDiscountAmount());
  const taxAmt = usePosStore((s) => s.getTaxAmount());
  const total = usePosStore((s) => s.getTotal());
  const taxRatePct = usePosStore((s) => Math.round(s.taxRate * 100));
  const itemDiscountTotal = usePosStore((s) =>
    s.cart.reduce((sum, item) => sum + calcItemDiscountAmount(item.quantity, item.price, item.discount ?? { type: 'nominal', value: 0 }), 0)
  );
  const { activeShift, setActiveShift } = useShiftStore();
  const [shiftLoading, setShiftLoading] = useState(true);

  const isTablet = width >= 768;

  // Tablet layout calc
  const rightPanelWidth = isTablet ? 380 : width * 0.38;
  const leftPanelWidth = width - rightPanelWidth - 10 - 20;
  const numColumnsTablet =
    leftPanelWidth >= 900
      ? 5
      : leftPanelWidth >= 700
        ? 4
        : leftPanelWidth >= 500
          ? 3
          : 2;
  const cardGapTablet = 8;
  const cardWidthTablet =
    (leftPanelWidth - cardGapTablet * (numColumnsTablet + 1)) /
    numColumnsTablet;

  // Mobile layout calc — padding 12 kiri+kanan, gap 10 antar kolom
  const mobilePadding = 12;
  const mobileCardGap = 10;
  const mobileNumColumns = 2;
  const mobileCardWidth =
    (width - mobilePadding * 2 - mobileCardGap * (mobileNumColumns - 1)) /
    mobileNumColumns;

  const [search, setSearch] = useState("");
  const [selectedCategoryLocal, setSelectedCategoryLocal] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [discountType, setDiscountType] = useState<"nominal" | "percent">(
    "nominal",
  );
  const [discountInput, setDiscountInput] = useState("");
  // Mobile-only: which page is shown
  const [mobileView, setMobileView] = useState<"products" | "cart">("products");

  // Member & redeem
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [pointsPerRupiah, setPointsPerRupiah] = useState(10_000);
  const { member, setMember } = posStore;

  // Ongkir
  const deliveryFee = usePosStore((s) => s.deliveryFee);
  const [deliveryInput, setDeliveryInput] = useState('');
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);

  const handleDeliveryChange = (v: string) => {
    const digits = v.replace(/\D/g, '');
    const formatted = digits ? parseInt(digits, 10).toLocaleString('id-ID') : '';
    setDeliveryInput(formatted);
    posStore.setDeliveryFee(parseInt(digits, 10) || 0);
  };

  const handleDeliveryToggle = () => {
    setDeliveryInput(deliveryFee > 0 ? deliveryFee.toLocaleString('id-ID') : '');
    setShowDeliveryModal(true);
  };


  // Diskon per item
  const [itemDiscountTarget, setItemDiscountTarget] = useState<string | null>(null);
  const [itemDiscountType, setItemDiscountType] = useState<'nominal' | 'percent'>('nominal');
  const [itemDiscountInput, setItemDiscountInput] = useState('');

  // Pilih satuan
  const [unitPickerProduct, setUnitPickerProduct] = useState<Product | null>(null);
  const [unitPickerOptions, setUnitPickerOptions] = useState<ProductUnit[]>([]);
  const [unitPickerLoading, setUnitPickerLoading] = useState(false);

  // Hold transaksi
  const [heldTransactions, setHeldTransactions] = useState<import('@/store/posStore').HeldTransaction[]>([]);
  const [showHoldList, setShowHoldList] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [barcodeToast, setBarcodeToast] = useState<{ message: string; ok: boolean; product?: Product; quantity?: number } | null>(null);
  const barcodeToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [barcodeMatch, setBarcodeMatch] = useState<Product | null>(null);

  const bounceAnims = useRef<Record<string, Animated.Value>>({});
  const getBounce = (id: string) => {
    if (!bounceAnims.current[id])
      bounceAnims.current[id] = new Animated.Value(1);
    return bounceAnims.current[id];
  };

  useEffect(() => {
    if (!currentBranch?.id) return;
    loadCategories();
    syncFromSupabase();
    getPointsPerRupiah().then(setPointsPerRupiah).catch(() => {});
    initShift();
    mmkv.getObject<{ tax_percentage?: number }>(KEY_STORE_SETTINGS).then((s) => {
      const pct = s?.tax_percentage ?? 0;
      posStore.setTaxRate(pct / 100);
    });
  }, [currentBranch?.id]);

  const initShift = async () => {
    if (!user?.id || !currentBranch?.id) {
      setShiftLoading(false);
      return;
    }
    try {
      await ensureShiftTable();
      const shift = await getActiveShift(user.id, currentBranch.id);
      setActiveShift(shift);
    } catch {}
    setShiftLoading(false);
  };

  const refreshHeld = useCallback(async () => {
    const list = await posStore.getHeldTransactions();
    setHeldTransactions(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setMobileView("products");
      setSearch('');
      setSearchQuery('');
      setBarcodeMatch(null);
      handleCategoryChange(null);
      refreshStockFromSupabase().catch(() => {});
      refreshHeld();
      const task = InteractionManager.runAfterInteractions(() => {
        searchInputRef.current?.focus();
        searchInputHeaderRef.current?.focus();
      });
      return () => task.cancel();
    }, [])
  );

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const searchInputHeaderRef = useRef<TextInput>(null);

  const barcodeMatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (barcodeMatchTimer.current) clearTimeout(barcodeMatchTimer.current);
    const trimmed = text.trim();
    if (!trimmed) {
      setBarcodeMatch(null);
      setSearchQuery('');
      return;
    }
    // Tunda 200ms — tunggu scanner selesai kirim semua karakter
    barcodeMatchTimer.current = setTimeout(async () => {
      const match = allProducts.find(
        (p) => p.is_active === 1 && p.barcode?.toLowerCase() === trimmed.toLowerCase()
      );
      if (match) {
        // Langsung masuk keranjang, reset search, tidak perlu tampil grid/card
        setSearch('');
        setSearchQuery('');
        setBarcodeMatch(null);
        if (match.stock <= 0) {
          showBarcodeToast(`${match.name} — stok habis`, false, match);
          return;
        }
        await handleAddToCart(match);
        const qty = posStore.cart.find((c) => c.productId === match.id)?.quantity ?? 1;
        showBarcodeToast(match.name, true, match, qty);
        searchInputRef.current?.focus();
        searchInputHeaderRef.current?.focus();
      } else {
        // Bukan barcode — filter nama biasa
        setBarcodeMatch(null);
        searchTimer.current = setTimeout(() => setSearchQuery(trimmed), 200);
      }
    }, 200);
  };

  const showBarcodeToast = (message: string, ok: boolean, product?: Product, quantity?: number) => {
    if (barcodeToastTimer.current) clearTimeout(barcodeToastTimer.current);
    setBarcodeToast({ message, ok, product, quantity });
    barcodeToastTimer.current = setTimeout(() => setBarcodeToast(null), 1500);
  };

  const handleSearchSubmit = async () => {
    // Barcode sudah dihandle realtime di handleSearchChange.
    // handleSearchSubmit hanya sebagai fallback jika scanner lambat (Enter tiba sebelum timer).
    const barcode = search.trim();
    if (!barcode) return;
    const found = allProducts.find(
      (p) => p.is_active === 1 && p.barcode?.toLowerCase() === barcode.toLowerCase()
    );
    if (!found) return;
    if (found.stock <= 0) {
      showBarcodeToast(`${found.name} — stok habis`, false, found);
      setSearch('');
      setSearchQuery('');
      return;
    }
    setSearch('');
    setSearchQuery('');
    setBarcodeMatch(null);
    await handleAddToCart(found);
    const qty = posStore.cart.find((c) => c.productId === found.id)?.quantity ?? 1;
    showBarcodeToast(found.name, true, found, qty);
    searchInputRef.current?.focus();
    searchInputHeaderRef.current?.focus();
  };

  const handleCategoryChange = (catId: string | null) => {
    setSelectedCategoryLocal(catId);
    setSelectedCategory(catId);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncFromSupabase();
    setRefreshing(false);
  };

  const filteredProducts = products;

  const triggerBounce = (productId: string) => {
    const anim = getBounce(productId);
    anim.setValue(1);
    Animated.sequence([
      Animated.timing(anim, { toValue: 1.13, duration: 80, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.95, duration: 60, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  const handleAddToCart = useCallback(async (product: Product) => {
    if (product.stock <= 0) return;
    triggerBounce(product.id);

    // Tunggu preload selesai (biasanya sudah done, jadi instant)
    await awaitUnitsCacheReady();

    // Setelah preload, baca langsung dari in-memory map — tanpa I/O
    if (Object.keys(unitsCacheMap).length > 0 || product.id in unitsCacheMap) {
      const units = unitsCacheMap[product.id] ?? [];
      if (units.length >= 2) {
        setUnitPickerOptions(units);
        setUnitPickerProduct(product);
      } else if (units.length === 1) {
        posStore.addToCart(product, units[0]);
      } else {
        posStore.addToCart(product, null);
      }
      return;
    }

    // Cache kosong total — fetch dari Supabase (online) atau skip (offline)
    setUnitPickerLoading(true);
    try {
      const units = await fetchProductUnits(product.id);
      if (units.length >= 2) {
        setUnitPickerOptions(units);
        setUnitPickerProduct(product);
      } else if (units.length === 1) {
        posStore.addToCart(product, units[0]);
      } else {
        posStore.addToCart(product, null);
      }
    } catch {
      posStore.addToCart(product, null);
    } finally {
      setUnitPickerLoading(false);
    }
  }, [fetchProductUnits, posStore]);

  const handleSelectUnit = (unit: ProductUnit) => {
    if (!unitPickerProduct) return;
    posStore.addToCart(unitPickerProduct, unit);
    triggerBounce(unitPickerProduct.id);
    setUnitPickerProduct(null);
    setUnitPickerOptions([]);
  };

  const openScanner = () => router.push('/(cashier)/scanner');

  const handleHold = async () => {
    const success = await posStore.holdTransaction();
    if (!success) {
      if (cartLength === 0) return;
      Alert.alert('Batas Hold', 'Maksimal 5 transaksi bisa ditunda sekaligus.');
      return;
    }
    await refreshHeld();
  };

  const handleRestoreHold = async (id: string) => {
    await posStore.restoreHold(id);
    await refreshHeld();
    setShowHoldList(false);
    // Reset input diskon lokal karena cart diganti
    setDiscountInput('');
    setDiscountType('nominal');
  };

  const handleDeleteHold = async (id: string) => {
    Alert.alert('Hapus Tundaan', 'Transaksi yang ditunda akan dihapus permanen.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          await posStore.deleteHold(id);
          await refreshHeld();
        },
      },
    ]);
  };

  const formatNumberInput = (raw: string) => {
    const digits = raw.replace(/\./g, '').replace(/[^0-9]/g, '');
    if (!digits) return '';
    return parseInt(digits, 10).toLocaleString('id-ID');
  };

  const parseNumberInput = (formatted: string) =>
    parseInt(formatted.replace(/\./g, ''), 10) || 0;

  const handleDiscountChange = (val: string) => {
    if (discountType === 'nominal') {
      const formatted = formatNumberInput(val);
      setDiscountInput(formatted);
      posStore.setDiscount({ type: discountType, value: parseNumberInput(formatted) });
    } else {
      setDiscountInput(val);
      posStore.setDiscount({ type: discountType, value: parseFloat(val) || 0 });
    }
  };

  const handleDiscountTypeToggle = () => {
    const next = discountType === "nominal" ? "percent" : "nominal";
    setDiscountType(next);
    setDiscountInput('');
    posStore.setDiscount({ type: next, value: 0 });
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const handlePaymentConfirm = async (paymentAmount: number) => {
    try {
      const result = await processTransaction({
        cart: posStore.cart,
        discount: posStore.discount,
        paymentMethod: posStore.paymentMethod,
        note: posStore.note,
        paymentAmount,
        subtotal: posStore.getSubtotal(),
        discountAmount: posStore.getDiscountAmount(),
        taxAmount: posStore.getTaxAmount(),
        total: posStore.getTotal(),
        member: posStore.member,
        shiftSnapshot: activeShift,
      });

      const cartSnapshot = posStore.cart.map((c) => ({
        name: c.productName,
        qty: c.quantity,
        price: c.price,
        discountAmount: calcItemDiscountAmount(c.quantity, c.price, c.discount ?? { type: 'nominal', value: 0 }),
        subtotal: c.subtotal,
      }));
      const subtotalSnapshot = posStore.getSubtotal();
      const discountSnapshot = posStore.getDiscountAmount();
      const taxSnapshot = posStore.getTaxAmount();
      const totalSnapshot = posStore.getTotal();
      setPaymentVisible(false);
      posStore.clearCart();
      setDiscountInput("");
      setDeliveryInput("");
      
      refreshStockFromSupabase().catch(() => {});
      if (thermalPrinterService.getConnectionStatus().isConnected) {
        printReceipt({
          storeName: currentBranch?.name ?? 'Toko',
          storeAddress: currentBranch?.address,
          storePhone: currentBranch?.phone,
          cashierName: user?.name ?? 'Kasir',
          invoiceNumber: result.transaction.invoice_number,
          createdAt: result.transaction.created_at,
          items: cartSnapshot,
          subtotal: subtotalSnapshot,
          discountAmount: discountSnapshot,
          taxAmount: taxSnapshot,
          total: totalSnapshot,
          paymentMethod: result.transaction.payment_method,
          paymentAmount: result.transaction.payment_amount,
          changeAmount: result.transaction.change_amount,
          memberName: result.member?.name,
          pointsEarned: result.pointsEarned,
          memberTotalPoints: result.member ? result.member.points + result.pointsEarned : null,
        }).catch(() => {});
      }

      router.push({
        pathname: "/(cashier)/success",
        params: {
          invoice: result.transaction.invoice_number,
          total: result.transaction.total.toString(),
          change: result.transaction.change_amount.toString(),
          method: result.transaction.payment_method,
          lowStock: JSON.stringify(result.lowStockItems),
          isOffline: result.isOffline ? '1' : '0',
        },
      });
    } catch (err: any) {
      Alert.alert("Gagal", err.message || "Transaksi gagal diproses");
      throw err;
    }
  };


  const renderTabletProductCard = useCallback(
    ({ item }: { item: Product }) => (
      <ProductCard
        item={item}
        cardWidth={cardWidthTablet}
        bounceAnims={bounceAnims}
        onPress={handleAddToCart}
      />
    ),
    [handleAddToCart, cardWidthTablet]
  );

  const renderMobileProductCard = useCallback(
    ({ item }: { item: Product }) => (
      <ProductCard
        item={item}
        cardWidth={mobileCardWidth}
        bounceAnims={bounceAnims}
        onPress={handleAddToCart}
      />
    ),
    [handleAddToCart, mobileCardWidth]
  );

  // Gate: tunggu load shift, lalu tampilkan OpenShiftScreen jika belum buka shift
  if (shiftLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F7F9' }}>
        <ActivityIndicator size="large" color="#56B2C1" />
      </View>
    );
  }
  if (!activeShift) {
    return <OpenShiftScreen />;
  }

  /* ─────────────────────────────────────────────
     SHARED: renderCartItem (used by tablet & mobile)
  ───────────────────────────────────────────── */
  const openItemDiscount = (productId: string) => {
    const item = posStore.cart.find((c) => c.productId === productId);
    if (!item) return;
    const disc = item.discount ?? { type: 'nominal' as const, value: 0 };
    setItemDiscountTarget(productId);
    setItemDiscountType(disc.type);
    if (disc.value > 0) {
      setItemDiscountInput(
        disc.type === 'nominal'
          ? disc.value.toLocaleString('id-ID')
          : String(disc.value)
      );
    } else {
      setItemDiscountInput('');
    }
  };

  const applyItemDiscount = () => {
    if (!itemDiscountTarget) return;
    const val = itemDiscountType === 'nominal'
      ? parseNumberInput(itemDiscountInput)
      : parseFloat(itemDiscountInput) || 0;
    posStore.setItemDiscount(itemDiscountTarget, { type: itemDiscountType, value: val });
    setItemDiscountTarget(null);
    setItemDiscountInput('');
  };

  const renderCartItem = ({ item }: { item: (typeof cart)[0] }) => {
    const itemDiscount = item.discount ?? { type: 'nominal' as const, value: 0 };
    const hasDiscount = itemDiscount.value > 0;
    const renderRightActions = () => (
      <TouchableOpacity
        style={styles.swipeDelete}
        onPress={() => posStore.removeFromCart(item.productId)}
      >
        <Ionicons name="trash" size={22} color="#fff" />
      </TouchableOpacity>
    );

    return (
      <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
        <View style={styles.cartItem}>
          <TouchableOpacity style={styles.cartItemInfo} onPress={() => openItemDiscount(item.productId)} activeOpacity={0.7}>
            <Text style={styles.cartItemName} numberOfLines={1}>
              {item.productName}
              {item.unitLabel ? <Text style={styles.cartItemUnitLabel}> · {item.unitLabel}</Text> : null}
            </Text>
            <View style={styles.cartItemPriceRow}>
              <Text style={styles.cartItemPrice}>{formatCurrency(item.price)}</Text>
              {hasDiscount && (
                <View style={styles.itemDiscountBadge}>
                  <Text style={styles.itemDiscountBadgeText}>
                    -{itemDiscount.type === 'percent' ? `${itemDiscount.value}%` : formatCurrency(itemDiscount.value)}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <View style={styles.cartStepper}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => posStore.updateQty(item.productId, item.quantity - 1)}
            >
              <Ionicons name="remove" size={16} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.stepperQty}>{item.quantity}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => posStore.updateQty(item.productId, item.quantity + 1)}
            >
              <Ionicons name="add" size={16} color="#374151" />
            </TouchableOpacity>
          </View>
          <Text style={[styles.cartItemSubtotal, hasDiscount && { color: '#DC2626' }]}>
            {formatCurrency(item.subtotal)}
          </Text>
        </View>
      </Swipeable>
    );
  };

  /* ─────────────────────────────────────────────
     Modal pilih satuan
  ───────────────────────────────────────────── */
  const renderHoldListModal = () => (
    <Modal visible={showHoldList} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={[styles.unitPickerModal, { maxWidth: 420 }]}>
          <Text style={styles.unitPickerTitle}>Transaksi Ditunda</Text>
          {heldTransactions.length === 0 ? (
            <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', paddingVertical: 16 }}>
              Tidak ada transaksi yang ditunda
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {heldTransactions.map((h) => {
                const itemCount = h.cart.reduce((s, c) => s + c.quantity, 0);
                const total = h.cart.reduce((s, c) => s + c.subtotal, 0);
                const time = new Date(h.heldAt);
                const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
                return (
                  <View key={h.id} style={styles.holdCard}>
                    <TouchableOpacity style={styles.holdCardMain} onPress={() => handleRestoreHold(h.id)} activeOpacity={0.7}>
                      <View style={styles.holdCardInfo}>
                        <Text style={styles.holdCardTime}>{timeStr}</Text>
                        <Text style={styles.holdCardMeta}>
                          {itemCount} item{itemCount > 1 ? 's' : ''}
                          {h.member ? ` · ${h.member.name}` : ''}
                        </Text>
                        <Text style={styles.holdCardTotal}>{formatCurrency(total)}</Text>
                      </View>
                      <View style={styles.holdCardRestore}>
                        <Ionicons name="refresh-outline" size={18} color="#56B2C1" />
                        <Text style={styles.holdCardRestoreText}>Ambil</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.holdCardDelete} onPress={() => handleDeleteHold(h.id)}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
          <TouchableOpacity style={styles.unitPickerCancelBtn} onPress={() => setShowHoldList(false)}>
            <Text style={styles.unitPickerCancelText}>Tutup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderUnitPickerModal = () => (
    <Modal visible={!!unitPickerProduct} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.unitPickerModal}>
          <Text style={styles.unitPickerTitle}>Pilih Satuan</Text>
          {unitPickerProduct && (
            <Text style={styles.unitPickerSub} numberOfLines={1}>
              {unitPickerProduct.name}
            </Text>
          )}
          <View style={styles.unitPickerList}>
            {unitPickerOptions.map((unit) => (
              <TouchableOpacity
                key={unit.id}
                style={styles.unitPickerOption}
                onPress={() => handleSelectUnit(unit)}
              >
                <View>
                  <Text style={styles.unitPickerLabel}>{unit.label}</Text>
                  <Text style={styles.unitPickerMeta}>
                    Isi {unit.multiplier} {unitPickerProduct?.unit || 'pcs'}
                  </Text>
                </View>
                <Text style={styles.unitPickerPrice}>{formatCurrency(unit.price)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.unitPickerCancelBtn}
            onPress={() => { setUnitPickerProduct(null); setUnitPickerOptions([]); }}
          >
            <Text style={styles.unitPickerCancelText}>Batal</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  /* ─────────────────────────────────────────────
     Modal diskon per item
  ───────────────────────────────────────────── */
  const renderItemDiscountModal = () => {
    const targetItem = posStore.cart.find((c) => c.productId === itemDiscountTarget);
    return (
      <Modal visible={!!itemDiscountTarget} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.itemDiscountModal}>
            <Text style={styles.itemDiscountModalTitle}>Diskon Item</Text>
            {targetItem && (
              <Text style={styles.itemDiscountModalSub} numberOfLines={1}>
                {targetItem.productName}
              </Text>
            )}

            <View style={styles.itemDiscountInputRow}>
              <TouchableOpacity
                style={styles.discountToggle}
                onPress={() => {
                  setItemDiscountType((t) => {
                    const next = t === 'nominal' ? 'percent' : 'nominal';
                    setItemDiscountInput('');
                    return next;
                  });
                }}
              >
                <Text style={styles.discountToggleText}>
                  {itemDiscountType === 'nominal' ? 'Rp' : '%'}
                </Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.discountInput, { flex: 1 }]}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                value={itemDiscountInput}
                onChangeText={(val) => {
                  if (itemDiscountType === 'nominal') {
                    setItemDiscountInput(formatNumberInput(val));
                  } else {
                    setItemDiscountInput(val);
                  }
                }}
                autoFocus
              />
            </View>

            {targetItem && (itemDiscountType === 'nominal' ? parseNumberInput(itemDiscountInput) : parseFloat(itemDiscountInput)) > 0 && (
              <Text style={styles.itemDiscountPreview}>
                Hemat{' '}
                {itemDiscountType === 'percent'
                  ? formatCurrency((parseFloat(itemDiscountInput) / 100) * targetItem.price * targetItem.quantity)
                  : formatCurrency(parseNumberInput(itemDiscountInput) * targetItem.quantity)}
              </Text>
            )}

            <View style={styles.itemDiscountActions}>
              <TouchableOpacity
                style={styles.itemDiscountCancelBtn}
                onPress={() => {
                  // Hapus diskon item
                  if (itemDiscountTarget) posStore.setItemDiscount(itemDiscountTarget, { type: 'nominal', value: 0 });
                  setItemDiscountTarget(null);
                  setItemDiscountInput('');
                }}
              >
                <Text style={styles.itemDiscountCancelText}>Hapus Diskon</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.itemDiscountApplyBtn} onPress={applyItemDiscount}>
                <Text style={styles.itemDiscountApplyText}>Terapkan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  /* ─────────────────────────────────────────────
     Modal catatan transaksi (tablet)
  ───────────────────────────────────────────── */
  const renderBarcodeToast = () => {
    if (!barcodeToast) return null;
    const { ok, message, product, quantity } = barcodeToast;
    return (
      <View style={styles.barcodeToastOverlay} pointerEvents="none">
        <View style={[styles.barcodeToast, !ok && styles.barcodeToastError]}>
          {/* Gambar produk */}
          {product?.image_url ? (
            <Image source={{ uri: product.image_url }} style={styles.barcodeToastImage} />
          ) : (
            <View style={[styles.barcodeToastImagePlaceholder, !ok && { backgroundColor: '#FEE2E2' }]}>
              {ok ? (
                <Text style={styles.barcodeToastInitial}>
                  {product?.name.substring(0, 2).toUpperCase() ?? '??'}
                </Text>
              ) : (
                <Ionicons name="close-circle" size={32} color="#EF4444" />
              )}
            </View>
          )}

          {ok ? (
            <>
              {/* Nama produk */}
              <Text style={styles.barcodeToastName} numberOfLines={2}>{message}</Text>
              {/* Harga */}
              {product && (
                <Text style={styles.barcodeToastPrice}>{formatCurrency(product.price)}</Text>
              )}
              {/* Quantity badge */}
              {quantity != null && (
                <View style={styles.barcodeToastQtyRow}>
                  <Ionicons name="cart" size={14} color="#56B2C1" />
                  <Text style={styles.barcodeToastQty}>x{quantity} di keranjang</Text>
                </View>
              )}
            </>
          ) : (
            <Text style={styles.barcodeToastTextError} numberOfLines={2}>{message}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderSortModal = () => (
    <Modal visible={showSort} transparent animationType="fade" onRequestClose={() => setShowSort(false)}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSort(false)}>
        <View style={[styles.unitPickerModal, { maxWidth: 340 }]}>
          <Text style={styles.unitPickerTitle}>Urutkan Produk</Text>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.unitPickerOption, { marginBottom: 0 }]}
              onPress={() => { setSortBy(opt.value as ProductSortBy); setShowSort(false); }}
            >
              <Text style={[styles.unitPickerLabel, sortBy === opt.value && { color: '#347385' }]}>
                {opt.label}
              </Text>
              <Ionicons
                name={sortBy === opt.value ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={sortBy === opt.value ? '#347385' : '#9CA3AF'}
              />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.unitPickerCancelBtn} onPress={() => setShowSort(false)}>
            <Text style={styles.unitPickerCancelText}>Batal</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderNoteModal = () => (
    <>
    <Modal visible={showNoteModal} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.unitPickerModal}>
          <Text style={styles.unitPickerTitle}>Catatan Transaksi</Text>
          <TextInput
            style={styles.noteModalInput}
            placeholder="Tulis catatan untuk transaksi ini..."
            placeholderTextColor="#9CA3AF"
            value={posStore.note}
            onChangeText={posStore.setNote}
            multiline
            numberOfLines={5}
            autoFocus
            textAlignVertical="top"
          />
          <View style={styles.itemDiscountActions}>
            {posStore.note.length > 0 && (
              <TouchableOpacity
                style={styles.itemDiscountCancelBtn}
                onPress={() => { posStore.setNote(''); }}
              >
                <Text style={styles.itemDiscountCancelText}>Hapus</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.itemDiscountApplyBtn, { flex: 1 }]}
              onPress={() => setShowNoteModal(false)}
            >
              <Text style={styles.itemDiscountApplyText}>Simpan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={showDeliveryModal} transparent animationType="fade" onRequestClose={() => setShowDeliveryModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.unitPickerModal}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Ionicons name="bicycle-outline" size={20} color="#DC2626" />
            <Text style={styles.unitPickerTitle}>Ongkos Kirim</Text>
          </View>
          <View style={[styles.discountRow, { marginBottom: 16 }]}>
            <View style={[styles.discountToggle, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <Text style={[styles.discountToggleText, { color: '#DC2626' }]}>Rp</Text>
            </View>
            <TextInput
              style={styles.discountInput}
              placeholder="0"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              value={deliveryInput}
              onChangeText={handleDeliveryChange}
              autoFocus
            />
          </View>
          <View style={styles.itemDiscountActions}>
            {deliveryFee > 0 && (
              <TouchableOpacity
                style={styles.itemDiscountCancelBtn}
                onPress={() => {
                  setDeliveryInput('');
                  posStore.setDeliveryFee(0);
                }}
              >
                <Text style={styles.itemDiscountCancelText}>Hapus</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.itemDiscountApplyBtn, { flex: 1 }]}
              onPress={() => setShowDeliveryModal(false)}
            >
              <Text style={styles.itemDiscountApplyText}>Simpan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );

  /* ─────────────────────────────────────────────
     Tablet cart panel — FlatList (scrolls inside fixed panel)
  ───────────────────────────────────────────── */
  const renderTabletCartPanel = () => (
    <>
      {/* Area cart item — flex:1 agar menyisakan ruang untuk panel bawah */}
      {cartEmpty ? (
        <View style={styles.emptyCart}>
          <Ionicons name="cart-outline" size={52} color="#D1D5DB" />
          <Text style={styles.emptyCartText}>Keranjang kosong</Text>
          <Text style={styles.emptyCartSub}>Tap produk untuk menambahkan</Text>
        </View>
      ) : (
        <FlatList
          data={cart}
          renderItem={renderCartItem}
          keyExtractor={(item) => item.productId}
          style={styles.cartList}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Panel bawah — fixed, tidak ikut scroll cart */}
      <View style={styles.tabletCartBottom}>
        {/* Diskon + tombol ongkir satu baris */}
        <View style={styles.discountRow}>
          <TouchableOpacity
            style={styles.discountToggle}
            onPress={handleDiscountTypeToggle}
          >
            <Text style={styles.discountToggleText}>
              {discountType === "nominal" ? "Rp" : "%"}
            </Text>
          </TouchableOpacity>
          <TextInput
            style={[styles.discountInput, { flex: 1 }]}
            placeholder="Diskon transaksi"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            value={discountInput}
            onChangeText={handleDiscountChange}
          />
        </View>
        {/* Ringkasan */}
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>
          {itemDiscountTotal > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: "#16A34A" }]}>Diskon Item</Text>
              <Text style={[styles.summaryValue, { color: "#16A34A" }]}>-{formatCurrency(itemDiscountTotal)}</Text>
            </View>
          )}
          {discountAmt > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: "#38A169" }]}>
                Diskon Transaksi{discountType === "percent" ? ` (${posStore.discount.value}%)` : ""}
              </Text>
              <Text style={[styles.summaryValue, { color: "#38A169" }]}>-{formatCurrency(discountAmt)}</Text>
            </View>
          )}
          {taxRatePct > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>PPN {taxRatePct}%</Text>
              <Text style={styles.summaryValue}>{formatCurrency(taxAmt)}</Text>
            </View>
          )}
          {deliveryFee > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: "#DC2626" }]}>Ongkir</Text>
              <Text style={[styles.summaryValue, { color: "#DC2626" }]}>{formatCurrency(deliveryFee)}</Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>{formatCurrency(total)}</Text>
          </View>
        </View>

        {/* Member info compact — tampil jika ada member */}
        {!!member && (
          <View style={styles.memberCompactRow}>
            <View style={styles.memberAvatar}>
              <Text style={styles.memberAvatarText}>{member.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
              <Text style={styles.memberPoints}>+{calcPoints(total, pointsPerRupiah)} poin</Text>
            </View>
            <TouchableOpacity style={styles.redeemBtn} onPress={() => setShowRedeem(true)} activeOpacity={0.8}>
              <Ionicons name="gift-outline" size={14} color="#D97706" />
              <Text style={styles.redeemBtnText}>{member.points.toLocaleString('id-ID')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMember(null)} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.holdBtn}
            onPress={async () => {
              if (!cartEmpty) {
                await handleHold();
              } else {
                setShowHoldList(true);
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons name={cartEmpty ? 'time-outline' : 'pause-circle-outline'} size={18} color="#6B7280" />
            <Text style={styles.holdBtnText}>{cartEmpty ? 'Tundaan' : 'Tunda'}</Text>
            {heldTransactions.length > 0 && (
              <View style={styles.holdBadge}>
                <Text style={styles.holdBadgeText}>{heldTransactions.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.payBtn, { flex: 1 }, cartEmpty && styles.payBtnDisabled]}
            disabled={cartEmpty}
            onPress={() => setPaymentVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="card" size={20} color="#fff" />
            <Text style={styles.payBtnText}>
              Bayar {cartEmpty ? "" : formatCurrency(total)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  /* ─────────────────────────────────────────────
     Mobile cart panel — ScrollView (full page, no fixed height)
  ───────────────────────────────────────────── */
  const renderMobileCartPanel = (bottomInset: number) => (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.mobileCartScroll,
        { paddingBottom: bottomInset + 32 },
      ]}
    >
      {cartEmpty ? (
        <View style={styles.mobileEmptyCart}>
          <Ionicons name="cart-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyCartText}>Keranjang kosong</Text>
          <Text style={styles.emptyCartSub}>
            Kembali ke produk untuk menambahkan
          </Text>
        </View>
      ) : (
        <View style={styles.mobileCartItems}>
          {cart.map((item) => (
            <View key={item.productId}>
              {renderCartItem({ item })}
            </View>
          ))}
        </View>
      )}

      <View style={[styles.discountRow, { marginTop: 12 }]}>
        <TouchableOpacity
          style={styles.discountToggle}
          onPress={handleDiscountTypeToggle}
        >
          <Text style={styles.discountToggleText}>
            {discountType === "nominal" ? "Rp" : "%"}
          </Text>
        </TouchableOpacity>
        <TextInput
          style={styles.discountInput}
          placeholder="Diskon"
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
          value={discountInput}
          onChangeText={handleDiscountChange}
        />
      </View>

      <TextInput
        style={[styles.noteInput, { marginTop: 10 }]}
        placeholder="Catatan transaksi (opsional)..."
        placeholderTextColor="#9CA3AF"
        value={posStore.note}
        onChangeText={posStore.setNote}
        multiline
        numberOfLines={3}
      />

      <View style={[styles.mobileSummaryCard, { marginTop: 12 }]}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
        </View>
        {itemDiscountTotal > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: "#16A34A" }]}>Diskon Item</Text>
            <Text style={[styles.summaryValue, { color: "#16A34A" }]}>-{formatCurrency(itemDiscountTotal)}</Text>
          </View>
        )}
        {discountAmt > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: "#38A169" }]}>
              Diskon Transaksi{" "}
              {discountType === "percent"
                ? `(${posStore.discount.value}%)`
                : ""}
            </Text>
            <Text style={[styles.summaryValue, { color: "#38A169" }]}>
              -{formatCurrency(discountAmt)}
            </Text>
          </View>
        )}
        {taxRatePct > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>PPN {taxRatePct}%</Text>
            <Text style={styles.summaryValue}>{formatCurrency(taxAmt)}</Text>
          </View>
        )}
        {deliveryFee > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: "#DC2626" }]}>Ongkir</Text>
            <Text style={[styles.summaryValue, { color: "#DC2626" }]}>{formatCurrency(deliveryFee)}</Text>
          </View>
        )}
        <View style={[styles.summaryRow, styles.summaryTotal]}>
          <Text style={styles.summaryTotalLabel}>Total</Text>
          <Text style={styles.summaryTotalValue}>{formatCurrency(total)}</Text>
        </View>
      </View>

      {/* Member row */}
      <View style={[styles.memberRow, { marginTop: 16 }]}>
        <TouchableOpacity
          style={[styles.memberBtn, member && styles.memberBtnActive]}
          onPress={() => setShowMemberPicker(true)}
          activeOpacity={0.8}
        >
          {member ? (
            <>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>{member.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
                <Text style={styles.memberPoints}>+{calcPoints(total, pointsPerRupiah)} poin</Text>
              </View>
              <TouchableOpacity onPress={() => setMember(null)} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Ionicons name="person-add-outline" size={16} color="#347385" />
              <Text style={styles.memberBtnLabel}>Tambah Member</Text>
            </>
          )}
        </TouchableOpacity>
        {!!member && (
          <TouchableOpacity style={styles.redeemBtn} onPress={() => setShowRedeem(true)} activeOpacity={0.8}>
            <Ionicons name="gift-outline" size={15} color="#D97706" />
            <Text style={styles.redeemBtnText}>{member.points.toLocaleString('id-ID')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.actionRow, { marginTop: 12 }]}>
        <TouchableOpacity
          style={styles.holdBtn}
          onPress={async () => {
            if (!cartEmpty) {
              await handleHold();
            } else {
              setShowHoldList(true);
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons name={cartEmpty ? 'time-outline' : 'pause-circle-outline'} size={18} color="#6B7280" />
          <Text style={styles.holdBtnText}>{cartEmpty ? 'Tundaan' : 'Tunda'}</Text>
          {heldTransactions.length > 0 && (
            <View style={styles.holdBadge}>
              <Text style={styles.holdBadgeText}>{heldTransactions.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.payBtn, { flex: 1 }, cartEmpty && styles.payBtnDisabled]}
          disabled={cartEmpty}
          onPress={() => router.push('/(cashier)/payment')}
          activeOpacity={0.85}
        >
          <Ionicons name="card" size={22} color="#fff" />
          <Text style={styles.payBtnText}>
            Bayar {cartEmpty ? "" : formatCurrency(total)}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );


  /* ─────────────────────────────────────────────
     SHARED: search bar (untuk header tablet) + category chips
  ───────────────────────────────────────────── */
  const renderSearchBar = () => (
    <View style={styles.searchBar}>
      <Ionicons name="search" size={18} color="#9CA3AF" />
      <TextInput
        ref={searchInputRef}
        style={styles.searchInput}
        placeholder="Cari nama / ketik barcode..."
        placeholderTextColor="#9CA3AF"
        value={search}
        onChangeText={handleSearchChange}
        onSubmitEditing={handleSearchSubmit}
        returnKeyType="search"
        blurOnSubmit={false}
      />
      {search.length > 0 && (
        <TouchableOpacity onPress={() => { setSearch(''); setSearchQuery(''); setBarcodeMatch(null); }}>
          <Ionicons name="close-circle" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.sortBtnInline, sortBy !== 'name_asc' && styles.sortBtnInlineActive]}
        onPress={() => setShowSort(true)}
      >
        <Ionicons name="swap-vertical-outline" size={18} color={sortBy !== 'name_asc' ? '#347385' : '#9CA3AF'} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
        <Ionicons name="scan" size={20} color="#56B2C1" />
      </TouchableOpacity>
    </View>
  );

  const renderSearchBarHeader = () => (
    <View style={styles.searchBarHeader}>
      <Ionicons name="search" size={16} color="#9CA3AF" />
      <TextInput
        ref={searchInputHeaderRef}
        style={styles.searchInputHeader}
        placeholder="Cari nama / ketik barcode..."
        placeholderTextColor="rgba(255,255,255,0.6)"
        value={search}
        onChangeText={handleSearchChange}
        onSubmitEditing={handleSearchSubmit}
        returnKeyType="search"
        blurOnSubmit={false}
      />
      {search.length > 0 && (
        <TouchableOpacity onPress={() => { setSearch(''); setSearchQuery(''); setBarcodeMatch(null); }}>
          <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.scanBtnHeader, sortBy !== 'name_asc' && { backgroundColor: 'rgba(255,255,255,0.35)' }]}
        onPress={() => setShowSort(true)}
      >
        <Ionicons name="swap-vertical-outline" size={17} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.scanBtnHeader} onPress={openScanner}>
        <Ionicons name="scan" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderCategoryChips = () => (
    <FlatList
      horizontal
      data={[{ id: "__all__", name: "Semua" }, ...categories]}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      style={styles.categoryScroll}
      contentContainerStyle={styles.categoryRow}
      renderItem={({ item }) => {
        const isAll = item.id === "__all__";
        const isActive = isAll
          ? !selectedCategoryLocal
          : selectedCategoryLocal === item.id;
        return (
          <TouchableOpacity
            style={[
              styles.categoryChip,
              isActive && styles.categoryChipActive,
            ]}
            onPress={() => handleCategoryChange(isAll ? null : item.id)}
          >
            <Text
              style={[
                styles.categoryChipText,
                isActive && styles.categoryChipTextActive,
              ]}
            >
              {item.name}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );

  const renderSearchAndCategories = () => (
    <>
      {renderSearchBar()}
      {renderCategoryChips()}
    </>
  );

  const renderBarcodeMatchCard = () => {
    if (!barcodeMatch) return null;
    const outOfStock = barcodeMatch.stock <= 0;
    return (
      <TouchableOpacity
        style={[styles.barcodeMatchCard, outOfStock && styles.barcodeMatchCardDisabled]}
        activeOpacity={outOfStock ? 1 : 0.75}
        onPress={() => {
          if (outOfStock) return;
          handleAddToCart(barcodeMatch);
          showBarcodeToast(`+1  ${barcodeMatch.name}`, true);
          setSearch('');
          setSearchQuery('');
          setBarcodeMatch(null);
        }}
      >
        <View style={styles.barcodeMatchIcon}>
          <Ionicons name="barcode-outline" size={20} color="#347385" />
        </View>
        <View style={styles.barcodeMatchInfo}>
          <Text style={styles.barcodeMatchName} numberOfLines={1}>{barcodeMatch.name}</Text>
          <Text style={styles.barcodeMatchPrice}>
            Rp {barcodeMatch.price.toLocaleString('id-ID')}
            {' · '}
            <Text style={[styles.barcodeMatchStock, outOfStock && { color: '#EF4444' }]}>
              Stok: {barcodeMatch.stock}
            </Text>
          </Text>
        </View>
        {outOfStock ? (
          <View style={styles.barcodeMatchOutBadge}>
            <Text style={styles.barcodeMatchOutText}>Habis</Text>
          </View>
        ) : (
          <View style={styles.barcodeMatchAddBtn}>
            <Ionicons name="add" size={20} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  /* ─────────────────────────────────────────────
     TABLET LAYOUT
  ───────────────────────────────────────────── */
  const shiftButton = (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <TouchableOpacity style={styles.attendanceBtn} onPress={() => router.push('/(cashier)/attendance' as any)} activeOpacity={0.8}>
        <Ionicons name="finger-print-outline" size={16} color="#7C3AED" />
        <Text style={styles.attendanceBtnText}>Presensi</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.shiftBtn} onPress={() => router.push('/(cashier)/close-shift')} activeOpacity={0.8}>
        <Ionicons name="stop-circle-outline" size={16} color="#fff" />
        <Text style={styles.shiftBtnText}>Tutup Shift</Text>
      </TouchableOpacity>
    </View>
  );

  if (isTablet) {
    return (
      <View style={styles.container}>
        <CashierHeader onLogout={handleLogout} rightElement={shiftButton} searchElement={renderSearchBarHeader()} />

        <View style={styles.content}>
          {/* LEFT: Products */}
          <View style={styles.leftPanel}>
            {renderCategoryChips()}
            {isLoading && products.length === 0 ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color="#56B2C1" />
              </View>
            ) : filteredProducts.length === 0 ? (
              <View style={styles.centered}>
                <Ionicons name="cube-outline" size={56} color="#D1D5DB" />
                <Text style={styles.emptyText}>Tidak ada produk</Text>
              </View>
            ) : (
              <FlatList
                key={numColumnsTablet}
                data={filteredProducts}
                renderItem={renderTabletProductCard}
                keyExtractor={(item) => item.id}
                numColumns={numColumnsTablet}
                columnWrapperStyle={{
                  paddingHorizontal: cardGapTablet,
                  gap: cardGapTablet,
                }}
                contentContainerStyle={styles.productListContent}
                showsVerticalScrollIndicator={false}
                onEndReached={loadMore}
                onEndReachedThreshold={0.3}
                ListFooterComponent={isLoadingMore ? <ActivityIndicator size="small" color="#56B2C1" style={{ marginVertical: 12 }} /> : null}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    colors={["#56B2C1"]}
                  />
                }
              />
            )}
          </View>

          {/* RIGHT: Cart */}
          <View style={[styles.rightPanel, { flex: 0, width: 380 }]}>
            <View style={styles.cartHeader}>
              <Text style={styles.cartTitle}>Keranjang</Text>
              {totalItems > 0 && (
                <View style={styles.cartBadgeHeader}>
                  <Text style={styles.cartBadgeHeaderText}>{totalItems}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.noteIconBtn, posStore.note.length > 0 && styles.noteIconBtnActive]}
                onPress={() => setShowNoteModal(true)}
              >
                <Ionicons name="document-text-outline" size={18} color={posStore.note.length > 0 ? "#347385" : "#9CA3AF"} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.noteIconBtn, member && styles.noteIconBtnActive]}
                onPress={() => setShowMemberPicker(true)}
              >
                <Ionicons name="person-outline" size={18} color={member ? "#347385" : "#9CA3AF"} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.noteIconBtn, deliveryFee > 0 && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                onPress={handleDeliveryToggle}
              >
                <Ionicons name="bicycle-outline" size={18} color={deliveryFee > 0 ? "#DC2626" : "#9CA3AF"} />
              </TouchableOpacity>
              {!cartEmpty && (
                <TouchableOpacity
                  style={styles.clearCartBtn}
                  onPress={() => {
                    posStore.clearCart();
                    setDiscountInput("");
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
            {renderTabletCartPanel()}
          </View>
        </View>

        <PaymentSheet
          visible={paymentVisible}
          onClose={() => setPaymentVisible(false)}
          onConfirm={handlePaymentConfirm}
        />

        <MemberPicker
          visible={showMemberPicker}
          selected={member}
          total={total}
          onSelect={setMember}
          onClose={() => setShowMemberPicker(false)}
        />
        {!!member && (
          <RedeemPointModal
            visible={showRedeem}
            member={member}
            onRedeemed={(newPoints) => setMember({ ...member, points: newPoints })}
            onClose={() => setShowRedeem(false)}
          />
        )}
        {renderItemDiscountModal()}
        {renderUnitPickerModal()}
        {renderHoldListModal()}
        {renderNoteModal()}
        {renderSortModal()}
        {renderBarcodeToast()}
      </View>
    );
  }

  /* ─────────────────────────────────────────────
     MOBILE LAYOUT — Halaman Produk
  ───────────────────────────────────────────── */
  if (mobileView === "products") {
    return (
      <View style={styles.container}>
        <CashierHeader onLogout={handleLogout} rightElement={shiftButton} />

        {/* Search + kategori */}
        {renderSearchAndCategories()}

        {/* Product grid */}
        {isLoading && products.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#56B2C1" />
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="cube-outline" size={56} color="#D1D5DB" />
            <Text style={styles.emptyText}>Tidak ada produk</Text>
          </View>
        ) : (
          <FlatList
            key={mobileNumColumns}
            data={filteredProducts}
            renderItem={renderMobileProductCard}
            keyExtractor={(item) => item.id}
            numColumns={mobileNumColumns}
            columnWrapperStyle={{ gap: mobileCardGap }}
            contentContainerStyle={[
              styles.productListContent,
              { paddingHorizontal: mobilePadding, paddingBottom: 100 },
            ]}
            showsVerticalScrollIndicator={false}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={isLoadingMore ? <ActivityIndicator size="small" color="#56B2C1" style={{ marginVertical: 12 }} /> : null}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={["#56B2C1"]}
              />
            }
          />
        )}

        {renderSortModal()}
        {renderBarcodeToast()}

        {/* Floating cart button */}
        <TouchableOpacity
          style={[styles.mobileCartFab, { bottom: 10 }]}
          onPress={() => setMobileView("cart")}
          activeOpacity={0.88}
        >
          <View style={styles.mobileCartFabLeft}>
            <Ionicons name="cart" size={22} color="#fff" />
            {totalItems > 0 && (
              <View style={styles.mobileCartFabBadge}>
                <Text style={styles.mobileCartFabBadgeText}>{totalItems}</Text>
              </View>
            )}
          </View>
          <Text style={styles.mobileCartFabLabel}>
            {cartEmpty ? "Keranjang Kosong" : `${cartLength} item`}
          </Text>
          <Text style={styles.mobileCartFabTotal}>
            {cartEmpty ? "" : formatCurrency(total)}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ─────────────────────────────────────────────
     MOBILE LAYOUT — Halaman Keranjang
  ───────────────────────────────────────────── */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header keranjang */}
      <View style={styles.mobileCartHeader}>
        <TouchableOpacity
          onPress={() => setMobileView("products")}
          style={styles.mobileBackBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#347385" />
        </TouchableOpacity>
        <Text style={styles.mobileCartTitle}>Keranjang</Text>
        {totalItems > 0 && (
          <View style={styles.cartBadgeHeader}>
            <Text style={styles.cartBadgeHeaderText}>{totalItems}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.noteIconBtn, { marginLeft: 'auto' }, deliveryFee > 0 && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
          onPress={handleDeliveryToggle}
        >
          <Ionicons name="bicycle-outline" size={18} color={deliveryFee > 0 ? "#DC2626" : "#9CA3AF"} />
        </TouchableOpacity>
        {!cartEmpty && (
          <TouchableOpacity
            style={styles.clearCartBtn}
            onPress={() => {
              posStore.clearCart();
              setDiscountInput("");
              setDeliveryInput("");
              
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      {/* Cart content */}
      <View style={styles.mobileCartContent}>
        {renderMobileCartPanel(insets.bottom)}
      </View>

      <PaymentSheet
        visible={paymentVisible}
        onClose={() => setPaymentVisible(false)}
        onConfirm={handlePaymentConfirm}
      />

      <MemberPicker
        visible={showMemberPicker}
        selected={member}
        total={total}
        onSelect={setMember}
        onClose={() => setShowMemberPicker(false)}
      />
      {!!member && (
        <RedeemPointModal
          visible={showRedeem}
          member={member}
          onRedeemed={(newPoints) => setMember({ ...member, points: newPoints })}
          onClose={() => setShowRedeem(false)}
        />
      )}
      {renderNoteModal()}
      {renderItemDiscountModal()}
      {renderUnitPickerModal()}
      {renderHoldListModal()}
      {renderSortModal()}
      {renderBarcodeToast()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F7F9" },

  shiftBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(220,38,38,0.85)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  shiftBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  attendanceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F5F3FF', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  attendanceBtnText: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberCompactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EEF8FA', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: '#D4EFF4',
  },
  memberBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#D4EFF4', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#F0F7F9',
  },
  memberBtnActive: { borderColor: '#347385', backgroundColor: '#EEF8FA' },
  memberAvatar: {
    width: 24, height: 24, borderRadius: 7,
    backgroundColor: '#347385', justifyContent: 'center', alignItems: 'center',
  },
  memberAvatarText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  memberName: { fontSize: 12, fontWeight: '700', color: '#347385' },
  memberPoints: { fontSize: 10, color: '#56B2C1', fontWeight: '600' },
  memberBtnLabel: { fontSize: 13, fontWeight: '600', color: '#347385' },

  noteOngkirRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ongkirBtn: {
    alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB', minWidth: 56,
  },
  ongkirBtnActive: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  ongkirBtnLabel: { fontSize: 10, fontWeight: '600', color: '#6B7280' },
  ongkirBtnFee: { fontSize: 9, fontWeight: '700', color: '#DC2626' },
  redeemBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#FCD34D',
  },
  redeemBtnText: { fontSize: 12, fontWeight: '700', color: '#D97706' },

  /* ── Tablet split layout ── */
  content: { flex: 1, flexDirection: "row", gap: 10, padding: 10 },
  leftPanel: {
    flex: 2,
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D4EFF4",
  },
  rightPanel: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    gap: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D4EFF4",
    flexDirection: "column",
  },
  tabletCartBottom: {
    gap: 8,
    flexShrink: 0,
  },

  /* ── Search & categories ── */
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF8FA",
    backgroundColor: "#fff",
  },
  searchInput: { flex: 1, fontSize: 14, color: "#1A202C", height: 36 },
  scanBtn: { padding: 6, backgroundColor: "#EEF8FA", borderRadius: 8 },
  sortBtnInline: { padding: 6, borderRadius: 8 },
  sortBtnInlineActive: { backgroundColor: '#EEF8FA' },

  barcodeMatchCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 12, marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 12, padding: 12,
    borderWidth: 1.5, borderColor: '#A9DFE9',
    shadowColor: '#347385', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  barcodeMatchCardDisabled: { borderColor: '#E5E7EB', opacity: 0.7 },
  barcodeMatchIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  barcodeMatchInfo: { flex: 1 },
  barcodeMatchName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  barcodeMatchPrice: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  barcodeMatchStock: { fontWeight: '600', color: '#347385' },
  barcodeMatchAddBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#347385', justifyContent: 'center', alignItems: 'center',
  },
  barcodeMatchOutBadge: {
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: '#FEE2E2', borderRadius: 8,
  },
  barcodeMatchOutText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },

  barcodeToastOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  barcodeToast: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 8,
    width: 220,
    borderWidth: 1.5,
    borderColor: '#A9DFE9',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  barcodeToastError: { borderColor: '#FECACA' },
  barcodeToastImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  barcodeToastImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  barcodeToastInitial: {
    fontSize: 26,
    fontWeight: '800',
    color: '#347385',
  },
  barcodeToastName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  barcodeToastPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#347385',
  },
  barcodeToastQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF8FA',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  barcodeToastQty: {
    fontSize: 12,
    fontWeight: '700',
    color: '#56B2C1',
  },
  barcodeToastTextError: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
    textAlign: 'center',
  },
  searchBarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  searchInputHeader: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
    paddingVertical: 0,
  },
  scanBtnHeader: {
    padding: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 7,
  },
  categoryScroll: {
    height: 52,
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF8FA",
    backgroundColor: "#fff",
  },
  categoryRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: "center",
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#EEF8FA",
    borderWidth: 1,
    borderColor: "#A9DFE9",
    justifyContent: "center",
    alignItems: "center",
  },
  categoryChipActive: { backgroundColor: "#56B2C1", borderColor: "#56B2C1" },
  categoryChipText: { fontSize: 13, fontWeight: "600", color: "#347385" },
  categoryChipTextActive: { color: "#fff" },

  /* ── Product cards ── */
  productListContent: { paddingBottom: 16, paddingTop: 4 },
  productCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D4EFF4",
    marginBottom: 8,
  },
  productCardDisabled: { opacity: 0.45 },
  productImage: { width: "100%", height: 100, resizeMode: "cover" },
  productImagePlaceholder: {
    width: "100%",
    height: 100,
    backgroundColor: "#D4EFF4",
    justifyContent: "center",
    alignItems: "center",
  },
  productImageInitial: { fontSize: 28, fontWeight: "800", color: "#347385" },
  outOfStockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    height: 100,
    top: 0,
  },
  outOfStockText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  cartBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E69738",
    justifyContent: "center",
    alignItems: "center",
  },
  cartBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  promoBadge: { position: 'absolute', bottom: 4, left: 4, backgroundColor: '#DC2626', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  promoBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  productPromoPrice: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  productPriceStrike: { fontSize: 11, color: '#9CA3AF', textDecorationLine: 'line-through' },
  productInfo: { padding: 8 },
  productName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1A202C",
    marginBottom: 2,
  },
  productPrice: { fontSize: 13, fontWeight: "700", color: "#347385" },
  productStock: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  productStockLow: { color: "#E69738" },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: { fontSize: 14, color: "#9CA3AF", marginTop: 12 },

  /* ── Cart shared ── */
  cartHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  cartTitle: { fontSize: 16, fontWeight: "700", color: "#347385", flex: 1 },
  cartBadgeHeader: {
    backgroundColor: "#56B2C1",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  cartBadgeHeaderText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  clearCartBtn: { padding: 4 },
  noteIconBtn: { padding: 4, borderRadius: 8 },
  noteIconBtnActive: { backgroundColor: '#EEF8FA' },
  noteModalInput: {
    borderWidth: 1,
    borderColor: '#D4EFF4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A202C',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  emptyCart: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  emptyCartText: { fontSize: 14, fontWeight: "600", color: "#9CA3AF" },
  emptyCartSub: { fontSize: 11, color: "#D1D5DB", textAlign: "center" },
  cartList: { flex: 1 },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF8FA",
    gap: 6,
    backgroundColor: "#fff",
  },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: 13, fontWeight: "600", color: "#1A202C" },
  cartItemUnitLabel: { fontSize: 12, fontWeight: '400', color: '#6B7280' },
  cartItemPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  cartItemPrice: { fontSize: 11, color: "#6B7280" },
  itemDiscountBadge: {
    backgroundColor: '#FEE2E2', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1,
  },
  itemDiscountBadgeText: { fontSize: 10, fontWeight: '700', color: '#DC2626' },
  cartStepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: "#EEF8FA",
    justifyContent: "center",
    alignItems: "center",
  },
  stepperQty: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A202C",
    minWidth: 28,
    textAlign: "center",
  },
  cartItemSubtotal: {
    fontSize: 13,
    fontWeight: "700",
    color: "#347385",
    minWidth: 70,
    textAlign: "right",
  },
  swipeDelete: {
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    width: 56,
    borderRadius: 8,
    marginVertical: 2,
  },
  discountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#D4EFF4",
    borderRadius: 10,
    overflow: "hidden",
  },
  discountToggle: {
    backgroundColor: "#EEF8FA",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: "#D4EFF4",
  },
  discountToggleText: { fontSize: 13, fontWeight: "700", color: "#56B2C1" },
  discountInput: {
    flex: 1,
    fontSize: 13,
    color: "#1A202C",
    paddingHorizontal: 8,
    height: 38,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#D4EFF4",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: "#1A202C",
    minHeight: 44,
    textAlignVertical: "top",
  },
  summary: {
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#EEF8FA",
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 13, color: "#6B7280" },
  summaryValue: { fontSize: 13, color: "#374151", fontWeight: "500" },
  summaryTotal: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#D4EFF4",
    marginTop: 4,
  },
  summaryTotalLabel: { fontSize: 16, fontWeight: "700", color: "#1A202C" },
  summaryTotalValue: { fontSize: 20, fontWeight: "800", color: "#347385" },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  holdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    position: 'relative',
  },
  holdBtnText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  holdBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  holdBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  holdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
  },
  holdCardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  holdCardInfo: { gap: 2 },
  holdCardTime: { fontSize: 13, fontWeight: '700', color: '#111827' },
  holdCardMeta: { fontSize: 12, color: '#6B7280' },
  holdCardTotal: { fontSize: 13, fontWeight: '700', color: '#56B2C1', marginTop: 2 },
  holdCardRestore: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  holdCardRestoreText: { fontSize: 13, fontWeight: '600', color: '#56B2C1' },
  holdCardDelete: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#56B2C1",
    borderRadius: 12,
    paddingVertical: 16,
  },
  payBtnDisabled: { backgroundColor: "#D1D5DB" },
  payBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  /* ── Mobile: floating cart button ── */
  mobileCartFab: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#347385",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  mobileCartFabLeft: { position: "relative", marginRight: 10 },
  mobileCartFabBadge: {
    position: "absolute",
    top: -6,
    right: -8,
    backgroundColor: "#E69738",
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  mobileCartFabBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  mobileCartFabLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  mobileCartFabTotal: { fontSize: 15, fontWeight: "800", color: "#fff" },

  /* ── Mobile: cart page ── */
  mobileCartHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#D4EFF4",
  },
  mobileBackBtn: { padding: 4 },
  mobileCartTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#347385",
  },
  mobileCartContent: {
    flex: 1,
    backgroundColor: "#fff",
  },
  mobileCartScroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  mobileEmptyCart: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 10,
  },
  mobileCartItems: {
    gap: 0,
  },
  mobileSummaryCard: {
    backgroundColor: "#F0F7F9",
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#D4EFF4",
  },

  /* ── Modal diskon item ── */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  itemDiscountModal: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    width: '100%', maxWidth: 380, gap: 12,
  },

  /* Unit picker */
  unitPickerModal: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    width: '100%', maxWidth: 380, gap: 12,
  },
  unitPickerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  unitPickerSub: { fontSize: 13, color: '#6B7280', marginTop: -4 },
  unitPickerList: { gap: 8 },
  unitPickerOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#F9FAFB',
  },
  unitPickerLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },
  unitPickerMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  unitPickerPrice: { fontSize: 15, fontWeight: '700', color: '#56B2C1' },
  unitPickerCancelBtn: {
    paddingVertical: 12, alignItems: 'center',
    borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', marginTop: 4,
  },
  unitPickerCancelText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  itemDiscountModalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  itemDiscountModalSub: { fontSize: 13, color: '#6B7280', marginTop: -4 },
  itemDiscountInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 0,
    borderWidth: 1, borderColor: '#D4EFF4', borderRadius: 10, overflow: 'hidden',
  },
  itemDiscountPreview: { fontSize: 13, color: '#16A34A', fontWeight: '600' },
  itemDiscountActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  itemDiscountCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center',
  },
  itemDiscountCancelText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  itemDiscountApplyBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#347385', alignItems: 'center',
  },
  itemDiscountApplyText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Scanner
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  scanFrame: {
    width: 240,
    height: 180,
    position: 'relative',
  },
  scanCorner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#56B2C1',
    borderWidth: 3,
  },
  scanCornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  scanCornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  scanCornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  scanCornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scanHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
  },
  scanToast: {
    position: 'absolute',
    top: 60,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#22C55E',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  scanToastError: { backgroundColor: '#EF4444' },
  scanToastText: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  scanCartBadge: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(52,115,133,0.92)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  scanCartBadgeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  scanCloseBtn: {
    position: 'absolute',
    bottom: 32,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#347385',
    borderRadius: 16,
    paddingVertical: 16,
  },
  scanCloseBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
