import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePosStore, calcItemDiscountAmount } from "@/store/posStore";
import { useAuthStore } from "@/store/authStore";
import { useShiftStore } from "@/store/shiftStore";
import { processTransaction } from "@/lib/transactionProcessor";
import { formatCurrency } from "@/constants/config";
import { MemberPicker } from "@/components/MemberPicker";
import { calcPoints, getPointsPerRupiah } from "@/lib/memberQueries";
import RedeemPointModal from "@/components/RedeemPointModal";
import { printReceipt } from "@/lib/printerHelper";
import { thermalPrinterService } from "@/lib/thermalPrinterService";
import { useProductStore } from "@/store/productStore";
import { supabase } from "@/lib/supabase";
import { qrisService, type QRISSettings } from "@/lib/qrisService";
import { transferService, type TransferSettings } from "@/lib/transferService";
import QRCode from "react-native-qrcode-svg";

type PaymentMethod = "cash" | "transfer" | "qris" | "split";
type SecondMethod = "transfer" | "qris";

function fmtQuickLabel(value: number): string {
  if (value >= 1_000_000) {
    const jt = value / 1_000_000;
    return Number.isInteger(jt) ? `${jt}jt` : `${parseFloat(jt.toFixed(1))}jt`;
  }
  if (value >= 1_000) return `${value / 1_000}rb`;
  return `${value}`;
}

function getQuickAmounts(total: number): { label: string; value: number }[] {
  const pas = Math.ceil(total / 1_000) * 1_000;
  const candidates = new Set<number>([pas]);
  const steps =
    total >= 1_000_000
      ? [100_000, 500_000]
      : total >= 500_000
        ? [50_000, 100_000]
        : total >= 100_000
          ? [10_000, 50_000]
          : total >= 50_000
            ? [5_000, 10_000]
            : total >= 10_000
              ? [1_000, 5_000]
              : [1_000];
  for (const step of steps) {
    const rounded = Math.ceil(total / step) * step;
    if (rounded > total) candidates.add(rounded);
  }
  const anchors = [
    5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 300_000, 400_000, 500_000,
    1_000_000, 2_000_000,
  ];
  const currentCount = Array.from(candidates).filter((v) => v >= total).length;
  let anchorAdded = 0;
  const needed = Math.max(0, 4 - currentCount);
  for (const a of anchors) {
    if (a > pas && anchorAdded < needed) {
      candidates.add(a);
      anchorAdded++;
    }
  }
  const seen = new Set<number>();
  return Array.from(candidates)
    .filter((v) => v >= total)
    .sort((a, b) => a - b)
    .slice(0, 5)
    .filter((v) => {
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    })
    .map((v) => ({ label: v === pas ? "Pas" : fmtQuickLabel(v), value: v }));
}

const NUMPAD_KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "000",
  "0",
  "←",
];

const METHODS: {
  key: PaymentMethod;
  label: string;
  icon: string;
  color: string;
}[] = [
  { key: "cash", label: "Tunai", icon: "cash", color: "#38A169" },
  {
    key: "transfer",
    label: "Transfer",
    icon: "phone-portrait",
    color: "#347385",
  },
  { key: "qris", label: "QRIS", icon: "qr-code", color: "#E69738" },
  {
    key: "split",
    label: "Campuran",
    icon: "git-merge-outline",
    color: "#8B5CF6",
  },
];

const SECOND_METHODS: {
  key: SecondMethod;
  label: string;
  icon: string;
  color: string;
}[] = [
  { key: "qris", label: "QRIS", icon: "qr-code", color: "#E69738" },
  {
    key: "transfer",
    label: "Transfer",
    icon: "phone-portrait",
    color: "#347385",
  },
];

export default function PaymentScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const posStore = usePosStore();
  const { user, currentBranch } = useAuthStore();
  const activeShift = useShiftStore((s) => s.activeShift);
  const { refreshStockFromSupabase } = useProductStore();
  const {
    paymentMethod,
    setPaymentMethod,
    getTotal,
    getChangeAmount,
    member,
    setMember,
    deliveryFee,
  } = posStore;

  const total = getTotal();
  const quickAmounts = getQuickAmounts(total);

  const [paymentInput, setPaymentInput] = useState(Math.ceil(total).toString());
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [pointsPerRupiah, setPointsPerRupiah] = useState(10_000);

  // Split payment state
  const [qrisSettings, setQrisSettings] = useState<QRISSettings | null>(null);
  const [qrisDynamic, setQrisDynamic] = useState<string | null>(null);
  const [qrisFullscreen, setQrisFullscreen] = useState(false);
  const [transferSettings, setTransferSettings] =
    useState<TransferSettings | null>(null);
  const [transferInfoModal, setTransferInfoModal] = useState(false);
  const [splitCashInput, setSplitCashInput] = useState("");
  const [splitHasTyped, setSplitHasTyped] = useState(false);
  const [splitSecondMethod, setSplitSecondMethod] =
    useState<SecondMethod>("qris");
  // activeNumpad: 'cash' (default, untuk metode tunai biasa dan tunai di split), 'split_cash'
  const [activeNumpad] = useState<"cash">("cash");

  useEffect(() => {
    getPointsPerRupiah()
      .then(setPointsPerRupiah)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const needsQris =
      paymentMethod === "qris" ||
      (paymentMethod === "split" && splitSecondMethod === "qris");
    const needsTransfer =
      paymentMethod === "transfer" ||
      (paymentMethod === "split" && splitSecondMethod === "transfer");
    if (needsQris) {
      qrisService
        .getActive()
        .then((data) => {
          setQrisSettings(data);
          if (data) {
            const cashAmt =
              parseFloat(splitCashInput.replace(/[^0-9]/g, "")) || 0;
            const secondAmt = cashAmt > 0 ? Math.max(0, total - cashAmt) : 0;
            const amount =
              paymentMethod === "split"
                ? secondAmt > 0
                  ? secondAmt
                  : total
                : total;
            const dynamic = qrisService.generateDynamic(
              data.qris_content,
              amount,
            );
            setQrisDynamic(dynamic);
          }
        })
        .catch(() => {});
    }
    if (needsTransfer) {
      transferService
        .getActive()
        .then(setTransferSettings)
        .catch(() => {});
    }
  }, [paymentMethod, splitSecondMethod, total, splitCashInput]);

  useFocusEffect(
    useCallback(() => {
      const currentTotal = posStore.getTotal();
      setPaymentInput(Math.ceil(currentTotal).toString());
      setHasTyped(false);
      setSplitCashInput("");
      setSplitHasTyped(false);
      setIsProcessing(false);
    }, []),
  );

  const numericPayment = parseFloat(paymentInput.replace(/[^0-9]/g, "")) || 0;
  const change = getChangeAmount(numericPayment);

  // Split calculations
  const splitCash = parseFloat(splitCashInput.replace(/[^0-9]/g, "")) || 0;
  const splitSecond = splitCash > 0 ? Math.max(0, total - splitCash) : 0;
  const splitChange =
    splitCash > 0 ? Math.max(0, splitCash - (total - splitSecond)) : 0;

  const canProcess =
    paymentMethod === "cash"
      ? numericPayment >= total
      : paymentMethod === "split"
        ? splitCash > 0 && splitCash <= total && splitSecond >= 0
        : true;

  const handleQuickAmount = (value: number) => {
    setPaymentInput(value.toString());
    setHasTyped(false);
  };

  const handleNumpad = (key: string) => {
    const isSplit = paymentMethod === "split";
    if (key === "←") {
      if (isSplit) {
        setSplitHasTyped(true);
        setSplitCashInput((p) => p.slice(0, -1));
      } else {
        setHasTyped(true);
        setPaymentInput((p) => p.slice(0, -1));
      }
    } else {
      if (isSplit) {
        if (!splitHasTyped) {
          setSplitHasTyped(true);
          setSplitCashInput(key);
        } else {
          setSplitCashInput((prev) => {
            const next = prev + key;
            return next.startsWith("0") ? key : next;
          });
        }
      } else {
        if (!hasTyped) {
          setHasTyped(true);
          setPaymentInput(key);
        } else {
          setPaymentInput((prev) => {
            const next = prev + key;
            return next.startsWith("0") ? key : next;
          });
        }
      }
    }
  };

  const handleConfirm = async () => {
    if (!canProcess || isProcessing) return;
    setIsProcessing(true);
    try {
      const isSplit = paymentMethod === "split";
      const amount = isSplit
        ? splitCash
        : paymentMethod === "cash"
          ? numericPayment
          : total;

      const result = await processTransaction({
        cart: posStore.cart,
        discount: posStore.discount,
        paymentMethod: posStore.paymentMethod,
        note: posStore.note,
        paymentAmount: amount,
        subtotal: posStore.getSubtotal(),
        discountAmount: posStore.getDiscountAmount(),
        taxAmount: posStore.getTaxAmount(),
        total,
        member: posStore.member,
        shiftSnapshot: activeShift,
        splitPayment: isSplit
          ? {
              cashAmount: splitCash,
              secondMethod: splitSecondMethod,
              secondAmount: splitSecond,
            }
          : null,
        deliveryFee: deliveryFee,
      });

      const cartSnapshot = posStore.cart.map((c) => ({
        name: c.productName,
        qty: c.quantity,
        price: c.price,
        discountAmount: calcItemDiscountAmount(
          c.quantity,
          c.price,
          c.discount ?? { type: "nominal", value: 0 },
        ),
        subtotal: c.subtotal,
      }));
      const subtotalSnapshot = posStore.getSubtotal();
      const discountSnapshot = posStore.getDiscountAmount();
      const taxSnapshot = posStore.getTaxAmount();
      posStore.clearCart();
      refreshStockFromSupabase().catch(() => {});

      router.replace({
        pathname: "/(cashier)/success",
        params: {
          invoice: result.transaction.invoice_number,
          total: result.transaction.total.toString(),
          change: result.transaction.change_amount.toString(),
          method: result.transaction.payment_method,
          lowStock: JSON.stringify(result.lowStockItems),
          pointsEarned: result.pointsEarned.toString(),
          memberName: result.member?.name ?? "",
          splitPayment: result.transaction.splitPayment
            ? JSON.stringify(result.transaction.splitPayment)
            : "",
          deliveryFee: deliveryFee.toString(),
        },
      });

      printReceipt({
        storeName: currentBranch?.name ?? "Toko",
        storeAddress: currentBranch?.address,
        storePhone: currentBranch?.phone,
        cashierName: user?.name ?? "Kasir",
        invoiceNumber: result.transaction.invoice_number,
        createdAt: result.transaction.created_at,
        items: cartSnapshot,
        subtotal: subtotalSnapshot,
        discountAmount: discountSnapshot,
        taxAmount: taxSnapshot,
        total: result.transaction.total,
        paymentMethod: result.transaction.payment_method,
        paymentAmount: result.transaction.payment_amount,
        changeAmount: result.transaction.change_amount,
        memberName: result.member?.name,
        pointsEarned: result.pointsEarned,
        memberTotalPoints: result.member
          ? result.member.points + result.pointsEarned
          : null,
        splitPayment: result.transaction.splitPayment ?? null,
        deliveryFee: deliveryFee,
      }).catch(() => {});
    } catch (err: any) {
      Alert.alert("Gagal", err.message || "Transaksi gagal diproses");
      setIsProcessing(false);
    }
  };

  const isSplitMode = paymentMethod === "split";
  const needsNumpad =
    paymentMethod === "cash" ||
    paymentMethod === "split";

  const numpadRows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["000", "0", "←"],
  ];

  const numpadNode = (
    <View style={styles.numpad}>
      {numpadRows.map((row, ri) => (
        <View key={ri} style={styles.numpadRow}>
          {row.map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.numKey, key === "←" && styles.numKeyDelete]}
              onPress={() => handleNumpad(key)}
              activeOpacity={0.7}
            >
              {key === "←" ? (
                <Ionicons name="backspace-outline" size={24} color="#374151" />
              ) : (
                <Text style={styles.numKeyText}>{key}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );

  const confirmNode = (
    <TouchableOpacity
      style={[styles.confirmBtn, !canProcess && styles.confirmBtnDisabled]}
      onPress={handleConfirm}
      disabled={!canProcess || isProcessing}
      activeOpacity={0.85}
    >
      {isProcessing ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <>
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <Text style={styles.confirmBtnText}>Proses Transaksi</Text>
        </>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#347385" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pembayaran</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[
              styles.memberHeaderBtn,
              member && styles.memberHeaderBtnActive,
            ]}
            onPress={() => setShowMemberPicker(true)}
            activeOpacity={0.8}
          >
            {member ? (
              <>
                <View style={styles.memberHeaderAvatar}>
                  <Text style={styles.memberHeaderAvatarText}>
                    {member.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ maxWidth: 80 }}>
                  <Text style={styles.memberHeaderName} numberOfLines={1}>
                    {member.name}
                  </Text>
                  <Text style={styles.memberHeaderPoin}>
                    +{calcPoints(total, pointsPerRupiah)} poin
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Ionicons name="person-add-outline" size={16} color="#347385" />
                <Text style={styles.memberHeaderLabel}>Member</Text>
              </>
            )}
          </TouchableOpacity>
          {!!member && (
            <TouchableOpacity
              style={styles.redeemHeaderBtn}
              onPress={() => setShowRedeem(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="gift-outline" size={15} color="#D97706" />
              <Text style={styles.redeemHeaderText}>
                {member.points.toLocaleString("id-ID")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body: 2 kolom di tablet, 1 kolom di mobile */}
      <View style={isTablet ? styles.tabletBody : { flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            isTablet && { paddingBottom: 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          style={isTablet ? styles.tabletScrollCol : undefined}
        >
          {/* Total */}
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total Tagihan</Text>
            <Text style={styles.totalAmount}>{formatCurrency(total)}</Text>
          </View>

          {/* Metode pembayaran */}
          <View style={styles.methodRow}>
            {METHODS.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[
                  styles.methodBtn,
                  paymentMethod === m.key && {
                    backgroundColor: m.color + "18",
                    borderColor: m.color,
                  },
                ]}
                onPress={() => setPaymentMethod(m.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={m.icon as any}
                  size={18}
                  color={paymentMethod === m.key ? m.color : "#9CA3AF"}
                />
                <Text
                  style={[
                    styles.methodLabel,
                    paymentMethod === m.key && {
                      color: m.color,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* === TUNAI BIASA === */}
          {paymentMethod === "cash" && (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickRow}
              >
                {quickAmounts.map((q) => (
                  <TouchableOpacity
                    key={q.label}
                    style={[
                      styles.quickBtn,
                      numericPayment === q.value && styles.quickBtnActive,
                    ]}
                    onPress={() => handleQuickAmount(q.value)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.quickBtnText,
                        numericPayment === q.value && styles.quickBtnTextActive,
                      ]}
                    >
                      {q.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.amountCard}>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Nominal Bayar</Text>
                  <Text style={styles.amountValue}>
                    Rp{" "}
                    {numericPayment > 0
                      ? numericPayment.toLocaleString("id-ID")
                      : "0"}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Kembalian</Text>
                  <Text
                    style={[
                      styles.amountValue,
                      { color: change >= 0 ? "#38A169" : "#EF4444" },
                    ]}
                  >
                    {formatCurrency(change)}
                  </Text>
                </View>
              </View>
              {!isTablet && numpadNode}
            </>
          )}

          {/* === NON-TUNAI: TRANSFER === */}
          {paymentMethod === "transfer" &&
            (isTablet ? (
              /* Tablet: layout 2 kolom — info rekening kiri, total + konfirmasi kanan */
              <View style={styles.tabletNonCashRow}>
                {transferSettings ? (
                  <>
                    <View style={styles.tabletTransferLeft}>
                      <View style={styles.transferCardHeader}>
                        <Ionicons name="card" size={20} color="#2563EB" />
                        <Text
                          style={[styles.transferCardTitle, { fontSize: 16 }]}
                        >
                          Transfer ke
                        </Text>
                      </View>
                      <View style={styles.transferRow}>
                        <Text style={styles.transferLabel}>Bank</Text>
                        <Text style={[styles.transferBank, { fontSize: 18 }]}>
                          {transferSettings.bank_name}
                        </Text>
                      </View>
                      <View style={styles.transferRow}>
                        <Text style={styles.transferLabel}>No. Rekening</Text>
                        <Text
                          style={[
                            styles.transferAccountNumber,
                            { fontSize: 22 },
                          ]}
                        >
                          {transferSettings.account_number}
                        </Text>
                      </View>
                      <View
                        style={[styles.transferRow, { borderBottomWidth: 0 }]}
                      >
                        <Text style={styles.transferLabel}>Atas Nama</Text>
                        <Text style={styles.transferAccountName}>
                          {transferSettings.account_name}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.tabletTransferRight}>
                      <Ionicons
                        name="phone-portrait-outline"
                        size={40}
                        color="#2563EB"
                      />
                      <Text style={styles.tabletTransferLabel}>
                        Total Transfer
                      </Text>
                      <Text style={styles.tabletTransferTotal}>
                        {formatCurrency(total)}
                      </Text>
                      <Text style={styles.tabletTransferHint}>
                        Konfirmasi setelah{"\n"}transfer masuk
                      </Text>
                    </View>
                  </>
                ) : (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                    }}
                  >
                    <Ionicons name="phone-portrait" size={56} color="#347385" />
                    <Text style={styles.nonCashInstruction}>
                      Konfirmasi setelah transfer masuk
                    </Text>
                    <Text style={styles.nonCashTotal}>
                      {formatCurrency(total)}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.nonCashSection}>
                {transferSettings ? (
                  <TouchableOpacity
                    style={styles.transferCard}
                    onPress={() => setTransferInfoModal(true)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.transferCardHeader}>
                      <Ionicons name="card" size={18} color="#2563EB" />
                      <Text style={styles.transferCardTitle}>Transfer ke</Text>
                    </View>
                    <View style={styles.transferRow}>
                      <Text style={styles.transferLabel}>Bank</Text>
                      <Text style={styles.transferBank}>
                        {transferSettings.bank_name}
                      </Text>
                    </View>
                    <View style={styles.transferRow}>
                      <Text style={styles.transferLabel}>No. Rekening</Text>
                      <Text style={styles.transferAccountNumber}>
                        {transferSettings.account_number}
                      </Text>
                    </View>
                    <View
                      style={[styles.transferRow, { borderBottomWidth: 0 }]}
                    >
                      <Text style={styles.transferLabel}>Atas Nama</Text>
                      <Text style={styles.transferAccountName}>
                        {transferSettings.account_name}
                      </Text>
                    </View>
                    <View style={styles.transferTotalRow}>
                      <Text style={styles.transferTotalLabel}>
                        Total Transfer
                      </Text>
                      <Text style={styles.transferTotalAmount}>
                        {formatCurrency(total)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <>
                    <View style={styles.nonCashIcon}>
                      <Ionicons
                        name="phone-portrait"
                        size={56}
                        color="#347385"
                      />
                    </View>
                    <Text style={styles.nonCashInstruction}>
                      Konfirmasi setelah transfer masuk
                    </Text>
                    <Text style={styles.nonCashTotal}>
                      {formatCurrency(total)}
                    </Text>
                  </>
                )}
              </View>
            ))}

          {/* === NON-TUNAI: QRIS === */}
          {paymentMethod === "qris" &&
            (isTablet ? (
              /* Tablet: QR besar di kiri, total di kanan */
              <View style={styles.tabletNonCashRow}>
                {qrisDynamic ? (
                  <>
                    <View style={styles.tabletQrisLeft}>
                      <View style={styles.qrisCardHeader}>
                        <Ionicons name="qr-code" size={16} color="#fff" />
                        <Text style={styles.qrisCardHeaderText}>QRIS</Text>
                        {qrisSettings?.merchant_name && (
                          <Text
                            style={styles.qrisMerchantName}
                            numberOfLines={1}
                          >
                            {qrisSettings.merchant_name}
                          </Text>
                        )}
                      </View>
                      <View
                        style={[styles.qrisCodeWrap, { paddingVertical: 24 }]}
                      >
                        <QRCode
                          value={qrisDynamic}
                          size={240}
                          backgroundColor="white"
                        />
                      </View>
                    </View>
                    <View style={styles.tabletQrisRight}>
                      <Text style={styles.tabletQrisLabel}>
                        Total Pembayaran
                      </Text>
                      <Text style={styles.tabletQrisTotal}>
                        {formatCurrency(total)}
                      </Text>
                      {qrisSettings?.merchant_name && (
                        <Text style={styles.tabletQrisMerchant}>
                          {qrisSettings.merchant_name}
                        </Text>
                      )}
                      <View style={styles.tabletQrisHintRow}>
                        <Ionicons
                          name="checkmark-circle"
                          size={14}
                          color="#38A169"
                        />
                        <Text style={styles.qrisHintText}>
                          Nominal otomatis terisi saat pelanggan scan
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.tabletQrisFullscreenBtn}
                        onPress={() => setQrisFullscreen(true)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name="expand-outline"
                          size={16}
                          color="#CC1414"
                        />
                        <Text style={styles.tabletQrisFullscreenBtnText}>
                          Perbesar QR
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                    }}
                  >
                    <Ionicons
                      name="qr-code-outline"
                      size={64}
                      color="#D1D5DB"
                    />
                    <Text style={styles.qrisNotSetTitle}>
                      QRIS Belum Diatur
                    </Text>
                    <Text style={styles.qrisNotSet}>
                      Minta owner upload QRIS di menu Pengaturan QRIS
                    </Text>
                    <Text style={styles.nonCashTotal}>
                      {formatCurrency(total)}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.qrisSection}>
                {qrisDynamic ? (
                  <>
                    <TouchableOpacity
                      style={styles.qrisCard}
                      onPress={() => setQrisFullscreen(true)}
                      activeOpacity={0.9}
                    >
                      <View style={styles.qrisCardHeader}>
                        <Ionicons name="qr-code" size={16} color="#fff" />
                        <Text style={styles.qrisCardHeaderText}>QRIS</Text>
                        {qrisSettings?.merchant_name && (
                          <Text
                            style={styles.qrisMerchantName}
                            numberOfLines={1}
                          >
                            {qrisSettings.merchant_name}
                          </Text>
                        )}
                        <Text
                          style={{
                            fontSize: 11,
                            color: "rgba(255,255,255,0.8)",
                            fontWeight: "600",
                          }}
                        >
                          Perbesar
                        </Text>
                      </View>
                      <View style={styles.qrisCodeWrap}>
                        <QRCode
                          value={qrisDynamic}
                          size={200}
                          backgroundColor="white"
                        />
                      </View>
                      <View style={styles.qrisTotalRow}>
                        <Text style={styles.qrisTotalLabel}>Total</Text>
                        <Text style={styles.qrisTotalAmount}>
                          {formatCurrency(total)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.qrisHintRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={14}
                        color="#38A169"
                      />
                      <Text style={styles.qrisHintText}>
                        Nominal otomatis terisi saat pelanggan scan — tap untuk
                        perbesar
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.qrisNotSetCard}>
                    <Ionicons
                      name="qr-code-outline"
                      size={52}
                      color="#D1D5DB"
                    />
                    <Text style={styles.qrisNotSetTitle}>
                      QRIS Belum Diatur
                    </Text>
                    <Text style={styles.qrisNotSet}>
                      Minta owner upload QRIS di menu Pengaturan QRIS
                    </Text>
                    <Text style={styles.nonCashTotal}>
                      {formatCurrency(total)}
                    </Text>
                  </View>
                )}
              </View>
            ))}

          {/* === PEMBAYARAN CAMPURAN === */}
          {isSplitMode && (
            <>
              {/* Info header */}
              {/* <View style={styles.splitInfoBox}>
              <Ionicons name="information-circle-outline" size={16} color="#8B5CF6" />
              <Text style={styles.splitInfoText}>Masukkan nominal tunai, sisa otomatis dihitung untuk metode kedua</Text>
            </View> */}

              {/* Metode kedua */}
              <View style={styles.splitSecondRow}>
                <Text style={styles.splitSectionLabel}>Metode Kedua</Text>
                <View style={styles.splitSecondBtns}>
                  {SECOND_METHODS.map((m) => (
                    <TouchableOpacity
                      key={m.key}
                      style={[
                        styles.splitSecondBtn,
                        splitSecondMethod === m.key && {
                          backgroundColor: m.color + "18",
                          borderColor: m.color,
                        },
                      ]}
                      onPress={() => setSplitSecondMethod(m.key)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={m.icon as any}
                        size={16}
                        color={
                          splitSecondMethod === m.key ? m.color : "#9CA3AF"
                        }
                      />
                      <Text
                        style={[
                          styles.splitSecondBtnText,
                          splitSecondMethod === m.key && {
                            color: m.color,
                            fontWeight: "700",
                          },
                        ]}
                      >
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Rincian split */}
              <View style={styles.splitCard}>
                <View style={styles.splitRow}>
                  <View style={styles.splitMethodBadge}>
                    <Ionicons name="cash" size={14} color="#38A169" />
                    <Text style={styles.splitMethodBadgeText}>Tunai</Text>
                  </View>
                  <Text style={[styles.splitAmount, { color: "#38A169" }]}>
                    {splitCash > 0 ? formatCurrency(splitCash) : "Rp 0"}
                  </Text>
                </View>
                <View style={styles.splitDivider} />
                <View style={styles.splitRow}>
                  <View
                    style={[
                      styles.splitMethodBadge,
                      {
                        backgroundColor:
                          splitSecondMethod === "qris" ? "#FEF9EE" : "#EEF8FA",
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        splitSecondMethod === "qris"
                          ? "qr-code"
                          : "phone-portrait"
                      }
                      size={14}
                      color={
                        splitSecondMethod === "qris" ? "#E69738" : "#347385"
                      }
                    />
                    <Text
                      style={[
                        styles.splitMethodBadgeText,
                        {
                          color:
                            splitSecondMethod === "qris"
                              ? "#E69738"
                              : "#347385",
                        },
                      ]}
                    >
                      {splitSecondMethod === "qris" ? "QRIS" : "Transfer"}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={[
                        styles.splitAmount,
                        {
                          color:
                            splitSecondMethod === "qris"
                              ? "#E69738"
                              : "#347385",
                        },
                      ]}
                    >
                      {splitSecond > 0 ? formatCurrency(splitSecond) : "Rp 0"}
                    </Text>
                    {splitSecondMethod === "qris" &&
                      qrisDynamic &&
                      splitSecond > 0 && (
                        <TouchableOpacity
                          onPress={() => setQrisFullscreen(true)}
                          style={styles.splitQrisBtn}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="qr-code" size={14} color="#CC1414" />
                          <Text style={styles.splitQrisBtnText}>Lihat QR</Text>
                        </TouchableOpacity>
                      )}
                    {splitSecondMethod === "transfer" &&
                      transferSettings &&
                      splitSecond > 0 && (
                        <TouchableOpacity
                          onPress={() => setTransferInfoModal(true)}
                          style={styles.splitTransferBtn}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="card" size={14} color="#2563EB" />
                          <Text style={styles.splitTransferBtnText}>
                            Rekening
                          </Text>
                        </TouchableOpacity>
                      )}
                  </View>
                </View>
                {splitCash > 0 && splitChange > 0 && (
                  <>
                    <View style={styles.splitDivider} />
                    <View style={styles.splitRow}>
                      <Text style={styles.splitChangeLabel}>
                        Kembalian Tunai
                      </Text>
                      <Text style={[styles.splitAmount, { color: "#38A169" }]}>
                        {formatCurrency(splitChange)}
                      </Text>
                    </View>
                  </>
                )}
                {splitCash > total && (
                  <Text style={styles.splitWarning}>
                    Nominal tunai melebihi total tagihan
                  </Text>
                )}
              </View>

              {/* Info metode kedua inline untuk tablet */}
              {isTablet && splitSecond > 0 && (
                <>
                  {splitSecondMethod === "qris" && qrisDynamic && (
                    <View style={styles.tabletSplitQrisBox}>
                      <View style={styles.qrisCardHeader}>
                        <Ionicons name="qr-code" size={14} color="#fff" />
                        <Text style={styles.qrisCardHeaderText}>
                          QRIS — Sisa Bayar
                        </Text>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "800",
                            color: "#fff",
                            marginLeft: "auto",
                          }}
                        >
                          {formatCurrency(splitSecond)}
                        </Text>
                      </View>
                      <View
                        style={{ alignItems: "center", paddingVertical: 16 }}
                      >
                        <QRCode
                          value={qrisDynamic}
                          size={180}
                          backgroundColor="white"
                        />
                      </View>
                    </View>
                  )}
                  {splitSecondMethod === "transfer" && transferSettings && (
                    <View style={[styles.transferCard, { marginTop: 8 }]}>
                      <View style={styles.transferCardHeader}>
                        <Ionicons name="card" size={16} color="#2563EB" />
                        <Text style={styles.transferCardTitle}>
                          Transfer — Sisa Bayar {formatCurrency(splitSecond)}
                        </Text>
                      </View>
                      <View style={styles.transferRow}>
                        <Text style={styles.transferLabel}>Bank</Text>
                        <Text style={styles.transferBank}>
                          {transferSettings.bank_name}
                        </Text>
                      </View>
                      <View style={styles.transferRow}>
                        <Text style={styles.transferLabel}>No. Rekening</Text>
                        <Text style={styles.transferAccountNumber}>
                          {transferSettings.account_number}
                        </Text>
                      </View>
                      <View
                        style={[styles.transferRow, { borderBottomWidth: 0 }]}
                      >
                        <Text style={styles.transferLabel}>Atas Nama</Text>
                        <Text style={styles.transferAccountName}>
                          {transferSettings.account_name}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}

              {/* Numpad untuk nominal tunai */}
              <Text style={styles.splitSectionLabel}>Nominal Tunai</Text>
              <View style={styles.splitCashDisplay}>
                <Text style={styles.splitCashDisplayText}>
                  Rp {splitCash > 0 ? splitCash.toLocaleString("id-ID") : "0"}
                </Text>
              </View>
              {!isTablet && numpadNode}
            </>
          )}

          <MemberPicker
            visible={showMemberPicker}
            selected={member}
            total={total}
            onSelect={setMember}
            onClose={() => setShowMemberPicker(false)}
          />
        </ScrollView>

        {isTablet ? (
          /* Panel kanan tablet: numpad + konfirmasi */
          <View
            style={[
              styles.tabletRightCol,
              { paddingBottom: insets.bottom + 16 },
            ]}
          >
            {needsNumpad && (
              <>
                {/* Label input aktif */}
                {paymentMethod === "cash" && (
                  <View style={styles.tabletInputDisplay}>
                    <Text style={styles.tabletInputLabel}>Nominal Bayar</Text>
                    <Text style={styles.tabletInputValue}>
                      Rp{" "}
                      {numericPayment > 0
                        ? numericPayment.toLocaleString("id-ID")
                        : "0"}
                    </Text>
                    <Text
                      style={[
                        styles.tabletInputChange,
                        { color: change >= 0 ? "#38A169" : "#EF4444" },
                      ]}
                    >
                      Kembalian: {formatCurrency(change)}
                    </Text>
                  </View>
                )}
                {paymentMethod === "split" && (
                  <View style={styles.tabletInputDisplay}>
                    <Text style={styles.tabletInputLabel}>Nominal Tunai</Text>
                    <Text style={styles.tabletInputValue}>
                      Rp{" "}
                      {splitCash > 0 ? splitCash.toLocaleString("id-ID") : "0"}
                    </Text>
                  </View>
                )}
                {numpadNode}
              </>
            )}
            <View style={styles.tabletConfirmWrapper}>{confirmNode}</View>
          </View>
        ) : (
          /* Tombol konfirmasi sticky mobile */
          <View style={styles.confirmWrapper}>{confirmNode}</View>
        )}
      </View>
      {/* end tabletBody */}

      {!!member && (
        <RedeemPointModal
          visible={showRedeem}
          member={{ ...member, points: member.points }}
          onRedeemed={(newPoints) => {
            setMember({ ...member, points: newPoints });
          }}
          onClose={() => setShowRedeem(false)}
        />
      )}

      {/* QRIS Fullscreen Modal */}
      <Modal
        visible={qrisFullscreen}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setQrisFullscreen(false)}
      >
        <TouchableOpacity
          style={styles.qrisFullscreenBg}
          activeOpacity={1}
          onPress={() => setQrisFullscreen(false)}
        >
          {isTablet ? (
            /* Tablet landscape: card horizontal, QR kiri, info kanan */
            <TouchableOpacity activeOpacity={1} style={styles.qrisTabletCard}>
              <View style={styles.qrisTabletLeft}>
                <View style={styles.qrisFullscreenHeader}>
                  <Ionicons name="qr-code" size={18} color="#fff" />
                  <Text style={styles.qrisFullscreenHeaderText}>QRIS</Text>
                  {qrisSettings?.merchant_name && (
                    <Text
                      style={styles.qrisFullscreenMerchant}
                      numberOfLines={1}
                    >
                      {qrisSettings.merchant_name}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => setQrisFullscreen(false)}
                    style={{ padding: 4 }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={22}
                      color="rgba(255,255,255,0.9)"
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.qrisFullscreenQR}>
                  {qrisDynamic && (
                    <QRCode
                      value={qrisDynamic}
                      size={260}
                      backgroundColor="white"
                    />
                  )}
                </View>
              </View>
              <View style={styles.qrisTabletRight}>
                <Text style={styles.qrisTabletLabel}>
                  {paymentMethod === "split" ? "Sisa QRIS" : "Total Pembayaran"}
                </Text>
                <Text style={styles.qrisTabletTotal}>
                  {formatCurrency(
                    paymentMethod === "split" ? splitSecond : total,
                  )}
                </Text>
                {qrisSettings?.merchant_name && (
                  <Text style={styles.qrisTabletMerchant}>
                    {qrisSettings.merchant_name}
                  </Text>
                )}
                <Text style={styles.qrisTabletHint}>
                  Arahkan kamera ke QR code{"\n"}atau tap di luar untuk tutup
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            /* Mobile: layout vertikal */
            <View style={styles.qrisFullscreenCard}>
              <View style={styles.qrisFullscreenHeader}>
                <Ionicons name="qr-code" size={18} color="#fff" />
                <Text style={styles.qrisFullscreenHeaderText}>QRIS</Text>
                {qrisSettings?.merchant_name && (
                  <Text style={styles.qrisFullscreenMerchant} numberOfLines={1}>
                    {qrisSettings.merchant_name}
                  </Text>
                )}
                <TouchableOpacity
                  onPress={() => setQrisFullscreen(false)}
                  style={{ padding: 4 }}
                >
                  <Ionicons
                    name="close-circle"
                    size={22}
                    color="rgba(255,255,255,0.9)"
                  />
                </TouchableOpacity>
              </View>
              <View style={styles.qrisFullscreenQR}>
                {qrisDynamic && (
                  <QRCode
                    value={qrisDynamic}
                    size={Math.min(Dimensions.get("window").width * 0.72, 320)}
                    backgroundColor="white"
                  />
                )}
              </View>
              <View style={styles.qrisFullscreenFooter}>
                <Text style={styles.qrisFullscreenTotalLabel}>
                  {paymentMethod === "split" ? "Sisa QRIS" : "Total Pembayaran"}
                </Text>
                <Text style={styles.qrisFullscreenTotal}>
                  {formatCurrency(
                    paymentMethod === "split" ? splitSecond : total,
                  )}
                </Text>
                <Text style={styles.qrisFullscreenTap}>
                  Tap di mana saja untuk tutup
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Modal>

      {/* Transfer Info Modal */}
      <Modal
        visible={transferInfoModal}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setTransferInfoModal(false)}
      >
        <TouchableOpacity
          style={styles.qrisFullscreenBg}
          activeOpacity={1}
          onPress={() => setTransferInfoModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.transferModalCard}>
            <View style={styles.transferModalHeader}>
              <Ionicons name="card" size={18} color="#2563EB" />
              <Text style={styles.transferModalTitle}>Info Transfer</Text>
              <TouchableOpacity
                onPress={() => setTransferInfoModal(false)}
                style={{ marginLeft: "auto", padding: 4 }}
              >
                <Ionicons name="close-circle" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {transferSettings && (
              <>
                <View style={styles.transferModalRow}>
                  <Text style={styles.transferModalLabel}>Bank</Text>
                  <Text style={styles.transferBank}>
                    {transferSettings.bank_name}
                  </Text>
                </View>
                <View style={styles.transferModalRow}>
                  <Text style={styles.transferModalLabel}>No. Rekening</Text>
                  <Text style={styles.transferAccountNumber}>
                    {transferSettings.account_number}
                  </Text>
                </View>
                <View style={styles.transferModalRow}>
                  <Text style={styles.transferModalLabel}>Atas Nama</Text>
                  <Text style={styles.transferAccountName}>
                    {transferSettings.account_name}
                  </Text>
                </View>
                <View
                  style={[
                    styles.transferModalRow,
                    {
                      backgroundColor: "#EFF6FF",
                      borderRadius: 10,
                      marginTop: 4,
                    },
                  ]}
                >
                  <Text style={styles.transferTotalLabel}>
                    {paymentMethod === "split"
                      ? "Sisa Transfer"
                      : "Total Transfer"}
                  </Text>
                  <Text style={styles.transferTotalAmount}>
                    {formatCurrency(
                      paymentMethod === "split" ? splitSecond : total,
                    )}
                  </Text>
                </View>
              </>
            )}
            <Text
              style={[
                styles.qrisFullscreenTap,
                { color: "#9CA3AF", marginTop: 12 },
              ]}
            >
              Tap di luar untuk tutup
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F7F9" },

  // Tablet layout
  tabletBody: { flex: 1, flexDirection: "row" },
  // Tablet transfer
  tabletNonCashRow: {
    flex: 1,
    flexDirection: "row",
    gap: 16,
    paddingVertical: 8,
  },
  tabletTransferLeft: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    overflow: "hidden",
  },
  tabletTransferRight: {
    width: 200,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  tabletTransferLabel: { fontSize: 13, color: "#1D4ED8", fontWeight: "600" },
  tabletTransferTotal: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1D4ED8",
    textAlign: "center",
  },
  tabletTransferHint: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  // Tablet QRIS inline
  tabletQrisLeft: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
    overflow: "hidden",
  },
  tabletQrisRight: {
    width: 200,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  tabletQrisLabel: { fontSize: 13, color: "#991B1B", fontWeight: "600" },
  tabletQrisTotal: {
    fontSize: 26,
    fontWeight: "800",
    color: "#991B1B",
    textAlign: "center",
  },
  tabletQrisMerchant: { fontSize: 12, color: "#6B7280", textAlign: "center" },
  tabletQrisHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  tabletQrisFullscreenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#FECACA",
    backgroundColor: "#fff",
  },
  tabletQrisFullscreenBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#CC1414",
  },
  // Split tablet QRIS box
  tabletSplitQrisBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    overflow: "hidden",
    marginTop: 8,
  },
  tabletScrollCol: { flex: 1 },
  tabletRightCol: {
    width: 340,
    backgroundColor: "#fff",
    borderLeftWidth: 1,
    borderLeftColor: "#D4EFF4",
    paddingHorizontal: 16,
    paddingTop: 16,
    justifyContent: "space-between",
  },
  tabletInputDisplay: {
    backgroundColor: "#EEF8FA",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#A9DFE9",
  },
  tabletInputLabel: { fontSize: 12, color: "#347385", marginBottom: 4 },
  tabletInputValue: { fontSize: 26, fontWeight: "800", color: "#1A202C" },
  tabletInputChange: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  tabletConfirmWrapper: { paddingTop: 12 },

  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  redeemHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  redeemHeaderText: { fontSize: 12, fontWeight: "700", color: "#D97706" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#D4EFF4",
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#347385" },

  scroll: { padding: 16, paddingBottom: 100 },

  totalBox: {
    backgroundColor: "#EEF8FA",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#A9DFE9",
    marginBottom: 16,
  },
  totalLabel: { fontSize: 13, color: "#347385", marginBottom: 6 },
  totalAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: "#347385",
    letterSpacing: -0.5,
  },

  methodRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  methodBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D4EFF4",
    backgroundColor: "#F9FAFB",
    gap: 4,
  },
  methodLabel: { fontSize: 11, fontWeight: "600", color: "#9CA3AF" },

  quickRow: { gap: 8, paddingVertical: 4, marginBottom: 12 },
  quickBtn: {
    backgroundColor: "#EEF8FA",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#A9DFE9",
  },
  quickBtnText: { fontSize: 13, fontWeight: "600", color: "#347385" },
  quickBtnActive: { backgroundColor: "#56B2C1", borderColor: "#56B2C1" },
  quickBtnTextActive: { color: "#fff" },

  amountCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#D4EFF4",
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountLabel: { fontSize: 14, color: "#6B7280" },
  amountValue: { fontSize: 22, fontWeight: "700", color: "#1A202C" },
  divider: { height: 1, backgroundColor: "#EEF8FA", marginVertical: 12 },

  numpad: { gap: 10 },
  numpadRow: { flexDirection: "row", gap: 10 },
  numKey: {
    flex: 1,
    paddingVertical: 18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4EFF4",
  },
  numKeyDelete: { backgroundColor: "#FEE2E2", borderColor: "#FECACA" },
  numKeyText: { fontSize: 22, fontWeight: "600", color: "#1A202C" },

  nonCashSection: { alignItems: "center", paddingVertical: 8, gap: 12 },
  nonCashIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#EEF8FA",
    justifyContent: "center",
    alignItems: "center",
  },
  nonCashInstruction: { fontSize: 15, color: "#6B7280", textAlign: "center" },
  nonCashTotal: { fontSize: 28, fontWeight: "800", color: "#347385" },

  transferCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  transferCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#BFDBFE",
  },
  transferCardTitle: { fontSize: 14, fontWeight: "700", color: "#1D4ED8" },
  transferRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  transferLabel: { fontSize: 13, color: "#6B7280" },
  transferBank: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1D4ED8",
    letterSpacing: 0.3,
  },
  transferAccountNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 1,
  },
  transferAccountName: { fontSize: 13, fontWeight: "600", color: "#374151" },
  transferTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#EFF6FF",
  },
  transferTotalLabel: { fontSize: 13, color: "#1D4ED8", fontWeight: "600" },
  transferTotalAmount: { fontSize: 22, fontWeight: "800", color: "#1D4ED8" },

  // QRIS styles
  qrisSection: { alignItems: "center", paddingVertical: 8, gap: 14 },
  qrisCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
    width: "100%",
  },
  qrisCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#CC1414",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  qrisCardHeaderText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
  },
  qrisMerchantName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    textAlign: "right",
  },
  qrisCodeWrap: {
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: "#fff",
  },
  qrisTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FEF2F2",
    borderTopWidth: 1,
    borderTopColor: "#FECACA",
  },
  qrisTotalLabel: { fontSize: 13, color: "#991B1B", fontWeight: "600" },
  qrisTotalAmount: { fontSize: 22, fontWeight: "800", color: "#991B1B" },
  qrisHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0FDF4",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  qrisHintText: { fontSize: 12, color: "#16A34A", fontWeight: "600" },
  qrisNotSetCard: {
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    width: "100%",
  },
  qrisNotSetTitle: { fontSize: 16, fontWeight: "700", color: "#9CA3AF" },
  qrisNotSet: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    paddingHorizontal: 16,
  },

  // Fullscreen modal
  qrisFullscreenBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  // Tablet QRIS: card horizontal
  qrisTabletCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
    maxWidth: 680,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  qrisTabletLeft: { flex: 1, backgroundColor: "#fff" },
  qrisTabletRight: {
    width: 240,
    backgroundColor: "#FEF2F2",
    borderLeftWidth: 1,
    borderLeftColor: "#FECACA",
    padding: 28,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  qrisTabletLabel: {
    fontSize: 13,
    color: "#991B1B",
    fontWeight: "600",
    textAlign: "center",
  },
  qrisTabletTotal: {
    fontSize: 26,
    fontWeight: "800",
    color: "#991B1B",
    textAlign: "center",
  },
  qrisTabletMerchant: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
  },
  qrisTabletHint: {
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
  },

  qrisFullscreenCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
    width: "100%",
    maxWidth: 420,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  qrisFullscreenHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#CC1414",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  qrisFullscreenHeaderText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
  },
  qrisFullscreenMerchant: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    textAlign: "right",
  },
  qrisFullscreenQR: {
    alignItems: "center",
    paddingVertical: 28,
    backgroundColor: "#fff",
  },
  qrisFullscreenFooter: {
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF2F2",
    borderTopWidth: 1,
    borderTopColor: "#FECACA",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  qrisFullscreenTotalLabel: {
    fontSize: 12,
    color: "#991B1B",
    fontWeight: "600",
  },
  qrisFullscreenTotal: { fontSize: 28, fontWeight: "800", color: "#991B1B" },
  qrisFullscreenTap: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginTop: 10,
    textAlign: "center",
  },

  // Split payment styles
  splitInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F5F3FF",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    marginBottom: 16,
  },
  splitInfoText: { flex: 1, fontSize: 12, color: "#7C3AED", lineHeight: 17 },

  splitSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  splitSecondRow: { marginBottom: 16 },
  splitSecondBtns: { flexDirection: "row", gap: 10 },
  splitSecondBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D4EFF4",
    backgroundColor: "#F9FAFB",
  },
  splitSecondBtnText: { fontSize: 13, fontWeight: "600", color: "#9CA3AF" },

  splitCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#D4EFF4",
  },
  splitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  splitMethodBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  splitMethodBadgeText: { fontSize: 13, fontWeight: "700", color: "#38A169" },
  splitAmount: { fontSize: 20, fontWeight: "800" },
  splitDivider: { height: 1, backgroundColor: "#F3F4F6", marginVertical: 12 },
  splitChangeLabel: { fontSize: 14, color: "#6B7280" },
  splitWarning: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 8,
    textAlign: "center",
  },
  splitQrisBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  splitQrisBtnText: { fontSize: 11, fontWeight: "700", color: "#CC1414" },
  splitTransferBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  splitTransferBtnText: { fontSize: 11, fontWeight: "700", color: "#2563EB" },
  transferModalCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    width: "90%",
    maxWidth: 380,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  transferModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  transferModalTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  transferModalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  transferModalLabel: { fontSize: 13, color: "#6B7280" },

  splitCashDisplay: {
    backgroundColor: "#F5F3FF",
    borderRadius: 12,
    padding: 14,
    alignItems: "flex-end",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  splitCashDisplayText: { fontSize: 28, fontWeight: "800", color: "#7C3AED" },

  confirmWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#D4EFF4",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#56B2C1",
  },
  confirmBtnDisabled: { backgroundColor: "#D1D5DB" },
  confirmBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  memberHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#D4EFF4",
    backgroundColor: "#F0F7F9",
  },
  memberHeaderBtnActive: { borderColor: "#347385", backgroundColor: "#EEF8FA" },
  memberHeaderAvatar: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#347385",
    justifyContent: "center",
    alignItems: "center",
  },
  memberHeaderAvatarText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  memberHeaderName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#347385",
    lineHeight: 15,
  },
  memberHeaderPoin: { fontSize: 10, color: "#56B2C1", fontWeight: "600" },
  memberHeaderLabel: { fontSize: 13, fontWeight: "600", color: "#347385" },

});
