import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  useWindowDimensions,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePosStore } from "@/store/posStore";
import { formatCurrency } from "@/constants/config";
import { qrisService, type QRISSettings } from "@/lib/qrisService";
import { transferService, type TransferSettings } from "@/lib/transferService";
import QRCode from "react-native-qrcode-svg";

type PaymentMethod = "cash" | "transfer" | "qris" | "split";
type SecondMethod = "transfer" | "qris";

interface PaymentSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (paymentAmount: number) => Promise<void>;
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

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
    5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 300_000, 500_000,
    1_000_000, 2_000_000,
  ];
  const currentCount = Array.from(candidates).filter((v) => v >= total).length;
  let anchorAdded = 0;
  for (const a of anchors) {
    if (a > pas && anchorAdded < Math.max(0, 4 - currentCount)) {
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
    color: "#2563EB",
  },
  { key: "qris", label: "QRIS", icon: "qr-code", color: "#E69738" },
  { key: "split", label: "Campuran", icon: "shuffle", color: "#7C3AED" },
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
    color: "#2563EB",
  },
];

export function PaymentSheet({
  visible,
  onClose,
  onConfirm,
}: PaymentSheetProps) {
  const posStore = usePosStore();
  const {
    paymentMethod,
    setPaymentMethod,
    getTotal,
    getChangeAmount,
    deliveryFee,
    setDeliveryFee,
  } = posStore;

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isTablet = screenWidth >= 768;
  const isLandscape = screenWidth > screenHeight;

  const total = getTotal();
  const quickAmounts = getQuickAmounts(total);

  const [paymentInput, setPaymentInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Split state
  const [splitCashInput, setSplitCashInput] = useState("");
  const [splitSecondMethod, setSplitSecondMethod] =
    useState<SecondMethod>("qris");

  // Delivery state
  const [deliveryFeeInput, setDeliveryFeeInput] = useState("");

  // QRIS / Transfer settings
  const [qrisSettings, setQrisSettings] = useState<QRISSettings | null>(null);
  const [qrisDynamic, setQrisDynamic] = useState<string | null>(null);
  const [transferSettings, setTransferSettings] =
    useState<TransferSettings | null>(null);
  const [qrisFullscreen, setQrisFullscreen] = useState(false);

  useEffect(() => {
    if (visible) {
      setPaymentInput(Math.ceil(total).toString());
      setSplitCashInput("");
      setDeliveryFeeInput("");
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 120,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
      setPaymentInput("");
      setIsProcessing(false);
      setQrisFullscreen(false);
    }
  }, [visible]);

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
        .then((d) => {
          setQrisSettings(d);
          if (d?.qris_content) {
            const dynamic = qrisService.generateDynamic(d.qris_content, total);
            setQrisDynamic(dynamic);
          } else {
            setQrisDynamic(null);
          }
        })
        .catch(() => {
          setQrisDynamic(null);
        });
    }
    if (needsTransfer) {
      transferService
        .getActive()
        .then((d) => setTransferSettings(d))
        .catch(() => {});
    }
  }, [paymentMethod, splitSecondMethod, total]);

  const numericPayment = parseFloat(paymentInput.replace(/[^0-9]/g, "")) || 0;
  const change = getChangeAmount(numericPayment);
  const splitCash = parseFloat(splitCashInput.replace(/[^0-9]/g, "")) || 0;
  const splitSecond = splitCash > 0 ? Math.max(0, total - splitCash) : 0;
  const splitChange =
    splitCash > 0 ? Math.max(0, splitCash - (total - splitSecond)) : 0;

  const canProcess =
    paymentMethod === "cash"
      ? numericPayment >= total
      : paymentMethod === "split"
        ? splitCash > 0 && splitCash <= total
        : true;

  const handleNumpad = (key: string) => {
    const isCash = paymentMethod === "cash";
    const setter = isCash ? setPaymentInput : setSplitCashInput;
    if (key === "←") setter((p) => p.slice(0, -1));
    else
      setter((prev) => {
        const next = prev + key;
        return next.startsWith("0") && key !== "0" ? key : next;
      });
  };

  const handleConfirm = async () => {
    if (!canProcess) return;
    setIsProcessing(true);
    try {
      const amount = paymentMethod === "cash" ? numericPayment : total;
      await onConfirm(amount);
    } catch {
      setIsProcessing(false);
    }
  };

  const numpadRows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["000", "0", "←"],
  ];

  const renderNumpad = (compact = false) => (
    <View style={styles.numpad}>
      {numpadRows.map((row, ri) => (
        <View key={ri} style={styles.numpadRow}>
          {row.map((key) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.numKey,
                key === "←" && styles.numKeyDelete,
                compact && styles.numKeyCompact,
              ]}
              onPress={() => handleNumpad(key)}
              activeOpacity={0.7}
            >
              {key === "←" ? (
                <Ionicons name="backspace-outline" size={compact ? 18 : 22} color="#374151" />
              ) : (
                <Text style={[styles.numKeyText, compact && styles.numKeyTextCompact]}>{key}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );

  const numpadNode = renderNumpad(false);
  const numpadNodeCompact = renderNumpad(true);

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
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={styles.confirmBtnText}>Proses Transaksi</Text>
        </>
      )}
    </TouchableOpacity>
  );

  const needsNumpad = paymentMethod === "cash" || paymentMethod === "split";

  // ── Konten kiri (info pembayaran) ─────────────────────────────────────────
  const renderPaymentContent = () => {
    if (paymentMethod === "cash") {
      return (
        <View style={styles.cashSection}>
          <View style={{ height: 44, justifyContent: "center" }}>
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
                  onPress={() => setPaymentInput(q.value.toString())}
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
          </View>
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
            <View style={styles.amountDivider} />
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
          {!(isTablet && isLandscape) && numpadNode}
        </View>
      );
    }

    if (paymentMethod === "transfer") {
      return (
        <View style={[styles.nonCashSection, { alignItems: "stretch" }]}>
          {transferSettings ? (
            isTablet && isLandscape ? (
              // Tablet: tampil langsung tanpa perlu tap
              <View style={styles.transferCard}>
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
                <View style={[styles.transferRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.transferLabel}>Atas Nama</Text>
                  <Text style={styles.transferAccountName}>
                    {transferSettings.account_name}
                  </Text>
                </View>
                <View style={styles.transferTotalRow}>
                  <Text style={styles.transferTotalLabel}>Total Transfer</Text>
                  <Text style={styles.transferTotalAmount}>
                    {formatCurrency(total)}
                  </Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.transferCard}
                onPress={() => {}}
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
                <View style={[styles.transferRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.transferLabel}>Atas Nama</Text>
                  <Text style={styles.transferAccountName}>
                    {transferSettings.account_name}
                  </Text>
                </View>
                <View style={styles.transferTotalRow}>
                  <Text style={styles.transferTotalLabel}>Total Transfer</Text>
                  <Text style={styles.transferTotalAmount}>
                    {formatCurrency(total)}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          ) : (
            <>
              <View style={styles.nonCashIcon}>
                <Ionicons name="phone-portrait" size={48} color="#2563EB" />
              </View>
              <Text style={styles.nonCashInstruction}>
                Konfirmasi setelah transfer masuk
              </Text>
              <Text style={styles.nonCashTotal}>{formatCurrency(total)}</Text>
            </>
          )}
        </View>
      );
    }

    if (paymentMethod === "qris") {
      return (
        <View style={[styles.nonCashSection, { alignItems: "stretch" }]}>
          {qrisDynamic ? (
            isTablet && isLandscape ? (
              // Tablet: layout horizontal — QR kiri, info kanan
              <TouchableOpacity
                style={styles.qrisCard}
                onPress={() => setQrisFullscreen(true)}
                activeOpacity={0.9}
              >
                <View style={styles.qrisCardHeader}>
                  <Ionicons name="qr-code" size={16} color="#fff" />
                  <Text style={styles.qrisCardHeaderText}>QRIS</Text>
                  {qrisSettings?.merchant_name && (
                    <Text style={styles.qrisMerchantName} numberOfLines={1}>
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
                <View style={styles.qrisTabletBody}>
                  <View style={styles.qrisCodeWrap}>
                    <QRCode
                      value={qrisDynamic}
                      size={150}
                      backgroundColor="white"
                    />
                  </View>
                  <View style={styles.qrisTabletInfo}>
                    <Text style={styles.qrisTabletInfoLabel}>
                      Total Pembayaran
                    </Text>
                    <Text style={styles.qrisTabletInfoTotal}>
                      {formatCurrency(total)}
                    </Text>
                    <Text style={styles.qrisTabletInfoHint}>
                      Tap untuk perbesar
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.qrisCard}
                onPress={() => setQrisFullscreen(true)}
                activeOpacity={0.9}
              >
                <View style={styles.qrisCardHeader}>
                  <Ionicons name="qr-code" size={16} color="#fff" />
                  <Text style={styles.qrisCardHeaderText}>QRIS</Text>
                  {qrisSettings?.merchant_name && (
                    <Text style={styles.qrisMerchantName} numberOfLines={1}>
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
                    size={180}
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
            )
          ) : (
            <>
              <View style={styles.nonCashIcon}>
                <Ionicons name="qr-code-outline" size={52} color="#D1D5DB" />
              </View>
              <Text style={styles.nonCashInstruction}>QRIS Belum Diatur</Text>
              <Text style={styles.nonCashTotal}>{formatCurrency(total)}</Text>
            </>
          )}
        </View>
      );
    }


    if (paymentMethod === "split") {
      const splitSummary = (
        <View style={styles.splitCard}>
          <View style={styles.splitRow}>
            <View style={styles.splitBadge}>
              <Ionicons name="cash" size={13} color="#38A169" />
              <Text style={[styles.splitBadgeText, { color: "#38A169" }]}>
                Tunai
              </Text>
            </View>
            <Text style={[styles.splitAmount, { color: "#38A169" }]}>
              {splitCash > 0 ? formatCurrency(splitCash) : "Rp 0"}
            </Text>
          </View>
          <View style={styles.splitDivider} />
          <View style={styles.splitRow}>
            <View
              style={[
                styles.splitBadge,
                {
                  backgroundColor:
                    splitSecondMethod === "qris" ? "#FEF9EE" : "#EEF8FA",
                },
              ]}
            >
              <Ionicons
                name={
                  splitSecondMethod === "qris" ? "qr-code" : "phone-portrait"
                }
                size={13}
                color={splitSecondMethod === "qris" ? "#E69738" : "#2563EB"}
              />
              <Text
                style={[
                  styles.splitBadgeText,
                  {
                    color: splitSecondMethod === "qris" ? "#E69738" : "#2563EB",
                  },
                ]}
              >
                {splitSecondMethod === "qris" ? "QRIS" : "Transfer"}
              </Text>
            </View>
            <Text
              style={[
                styles.splitAmount,
                { color: splitSecondMethod === "qris" ? "#E69738" : "#2563EB" },
              ]}
            >
              {splitSecond > 0 ? formatCurrency(splitSecond) : "Rp 0"}
            </Text>
          </View>
          {splitCash > 0 && splitChange > 0 && (
            <>
              <View style={styles.splitDivider} />
              <View style={styles.splitRow}>
                <Text style={{ fontSize: 12, color: "#6B7280" }}>
                  Kembalian Tunai
                </Text>
                <Text style={[styles.splitAmount, { color: "#38A169" }]}>
                  {formatCurrency(splitChange)}
                </Text>
              </View>
            </>
          )}
          {splitCash > total && (
            <Text style={{ fontSize: 12, color: "#EF4444", marginTop: 6 }}>
              Nominal tunai melebihi total tagihan
            </Text>
          )}
        </View>
      );

      if (isTablet && isLandscape) {
        return (
          <View style={styles.cashSection}>
            {/* Baris atas: rincian kiri + pilih metode kanan */}
            <View style={styles.splitTabletTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionLabel}>Rincian Pembayaran</Text>
                {splitSummary}
              </View>
              <View style={styles.splitTabletMethodCol}>
                <Text style={styles.sectionLabel}>Metode Kedua</Text>
                {SECOND_METHODS.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={[
                      styles.splitSecondBtn,
                      { marginBottom: 8 },
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
                      color={splitSecondMethod === m.key ? m.color : "#9CA3AF"}
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

            {/* Baris bawah: info QR atau Transfer full width */}
            {splitSecond > 0 && splitSecondMethod === "qris" && qrisDynamic && (
              <TouchableOpacity
                style={[styles.qrisCard, { marginTop: 12 }]}
                onPress={() => setQrisFullscreen(true)}
                activeOpacity={0.9}
              >
                <View style={styles.qrisCardHeader}>
                  <Ionicons name="qr-code" size={14} color="#fff" />
                  <Text style={styles.qrisCardHeaderText}>
                    QRIS — Sisa Bayar
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: "#fff",
                      marginLeft: "auto",
                    }}
                  >
                    {formatCurrency(splitSecond)}
                  </Text>
                </View>
                <View style={styles.qrisTabletBody}>
                  <View style={styles.qrisCodeWrap}>
                    <QRCode
                      value={qrisDynamic}
                      size={120}
                      backgroundColor="white"
                    />
                  </View>
                  <View style={styles.qrisTabletInfo}>
                    <Text style={styles.qrisTabletInfoLabel}>Sisa QRIS</Text>
                    <Text style={styles.qrisTabletInfoTotal}>
                      {formatCurrency(splitSecond)}
                    </Text>
                    <Text style={styles.qrisTabletInfoHint}>
                      Tap untuk perbesar
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            {splitSecond > 0 &&
              splitSecondMethod === "transfer" &&
              transferSettings && (
                <View style={[styles.transferCard, { marginTop: 12 }]}>
                  <View style={styles.transferCardHeader}>
                    <Ionicons name="card" size={16} color="#2563EB" />
                    <Text style={styles.transferCardTitle}>
                      Transfer — Sisa {formatCurrency(splitSecond)}
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
                  <View style={[styles.transferRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.transferLabel}>Atas Nama</Text>
                    <Text style={styles.transferAccountName}>
                      {transferSettings.account_name}
                    </Text>
                  </View>
                </View>
              )}
          </View>
        );
      }

      return (
        <View style={styles.cashSection}>
          <View style={styles.splitSecondRow}>
            <Text style={styles.sectionLabel}>Metode Kedua</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
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
                    size={14}
                    color={splitSecondMethod === m.key ? m.color : "#9CA3AF"}
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
          {splitSummary}
          <Text style={styles.sectionLabel}>Nominal Tunai</Text>
          <View style={styles.cashDisplay}>
            <Text style={styles.cashDisplayText}>
              Rp {splitCash > 0 ? splitCash.toLocaleString("id-ID") : "0"}
            </Text>
          </View>
          {numpadNode}
        </View>
      );
    }

    return null;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          isTablet && isLandscape && styles.overlayTablet,
        ]}
      >
        <TouchableOpacity
          style={styles.backdrop}
          onPress={onClose}
          activeOpacity={1}
        />

        <Animated.View
          style={[
            styles.sheet,
            isTablet && isLandscape
              ? {
                  ...styles.sheetTablet,
                  width: Math.min(screenWidth * 0.88, 820),
                  height: screenHeight * 0.82,
                }
              : isTablet
                ? {
                    // Tablet portrait: bottom sheet full width
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    maxHeight: screenHeight * 0.92,
                    width: "100%",
                    transform: [{ translateY: slideAnim }],
                  }
                : {
                    transform: [{ translateY: slideAnim }],
                    maxHeight: screenHeight * 0.95,
                    width: "100%",
                  },
          ]}
        >
          {(!isTablet || !isLandscape) && <View style={styles.handle} />}

          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Pembayaran</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {isTablet && isLandscape ? (
            // ── Tablet Landscape: 2 kolom ────────────────────────────────────
            <View style={styles.tabletBody}>
              {/* Kiri: total + metode + konten */}
              <ScrollView
                style={styles.tabletLeft}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 16 }}
              >
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Total Tagihan</Text>
                  <Text style={[styles.totalAmount, { fontSize: 24 }]}>
                    {formatCurrency(total)}
                  </Text>
                </View>

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
                        size={15}
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

                {renderPaymentContent()}
              </ScrollView>

              {/* Kanan: numpad + konfirmasi */}
              <View style={styles.tabletRight}>
                {needsNumpad && (
                  <>
                    <View style={styles.tabletDisplay}>
                      {paymentMethod === "cash" && (
                        <>
                          <Text style={styles.tabletDisplayLabel}>
                            Nominal Bayar
                          </Text>
                          <Text style={styles.tabletDisplayValue}>
                            Rp{" "}
                            {numericPayment > 0
                              ? numericPayment.toLocaleString("id-ID")
                              : "0"}
                          </Text>
                          <Text
                            style={[
                              styles.tabletDisplayChange,
                              { color: change >= 0 ? "#38A169" : "#EF4444" },
                            ]}
                          >
                            Kembalian: {formatCurrency(change)}
                          </Text>
                        </>
                      )}
                      {paymentMethod === "split" && (
                        <>
                          <Text style={styles.tabletDisplayLabel}>
                            Nominal Tunai
                          </Text>
                          <Text style={styles.tabletDisplayValue}>
                            Rp{" "}
                            {splitCash > 0
                              ? splitCash.toLocaleString("id-ID")
                              : "0"}
                          </Text>
                        </>
                      )}
                    </View>
                    {numpadNodeCompact}
                  </>
                )}
                <View style={{ flex: 1 }} />
                <View style={{ paddingTop: 12 }}>{confirmNode}</View>
              </View>
            </View>
          ) : (
            // ── Mobile: 1 kolom ─────────────────────────────────────────────
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>Total Tagihan</Text>
                <Text style={styles.totalAmount}>{formatCurrency(total)}</Text>
              </View>

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

              {renderPaymentContent()}

              <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                {confirmNode}
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </View>

      {/* QRIS Fullscreen */}
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
                  size={Math.min(screenWidth * 0.7, 320)}
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
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  overlayTablet: { justifyContent: "center", alignItems: "center" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: "100%",
  },
  sheetTablet: { borderRadius: 20, overflow: "hidden" },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#A9DFE9",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF8FA",
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: "#347385" },
  closeBtn: { padding: 4 },

  // Tablet 2-col
  tabletBody: { flexDirection: "row", flexGrow: 1, flexShrink: 1 },
  tabletLeft: { flex: 1, minWidth: 0 },
  tabletRight: {
    width: 280,
    backgroundColor: "#F9FAFB",
    borderLeftWidth: 1,
    borderLeftColor: "#E5E7EB",
    padding: 14,
    flexDirection: "column",
    justifyContent: "flex-start",
  },
  tabletDisplay: {
    backgroundColor: "#EEF8FA",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#A9DFE9",
  },
  tabletDisplayLabel: { fontSize: 12, color: "#347385", marginBottom: 4 },
  tabletDisplayValue: { fontSize: 24, fontWeight: "800", color: "#1A202C" },
  tabletDisplayChange: { fontSize: 13, fontWeight: "600", marginTop: 4 },

  totalBox: {
    backgroundColor: "#EEF8FA",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#A9DFE9",
  },
  totalLabel: { fontSize: 12, color: "#347385", marginBottom: 4 },
  totalAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: "#347385",
    letterSpacing: -0.5,
  },

  methodRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 6,
    flexWrap: "wrap",
  },
  methodBtn: {
    flex: 1,
    minWidth: 60,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#D4EFF4",
    backgroundColor: "#F9FAFB",
    gap: 3,
  },
  methodLabel: { fontSize: 10, fontWeight: "600", color: "#9CA3AF" },

  cashSection: { paddingHorizontal: 16, marginTop: 10 },

  quickRow: { gap: 8, paddingHorizontal: 2, alignItems: "center" },
  quickBtn: {
    backgroundColor: "#EEF8FA",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#A9DFE9",
  },
  quickBtnActive: { backgroundColor: "#56B2C1", borderColor: "#56B2C1" },
  quickBtnText: { fontSize: 13, fontWeight: "600", color: "#347385" },
  quickBtnTextActive: { color: "#fff" },

  amountCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountDivider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 8 },
  amountLabel: { fontSize: 13, color: "#6B7280" },
  amountValue: { fontSize: 18, fontWeight: "700", color: "#1A202C" },

  numpad: { gap: 8, marginTop: 8, alignSelf: "stretch" },
  numpadRow: { flexDirection: "row", gap: 8, alignSelf: "stretch" },
  numKey: {
    flex: 1,
    paddingVertical: 18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EEF8FA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4EFF4",
  },
  numKeyDelete: { backgroundColor: "#FEE2E2", borderColor: "#FECACA" },
  numKeyCompact: { paddingVertical: 10 },
  numKeyText: { fontSize: 22, fontWeight: "600", color: "#1A202C" },
  numKeyTextCompact: { fontSize: 17 },

  nonCashSection: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
    gap: 10,
  },
  nonCashIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#EEF8FA",
    justifyContent: "center",
    alignItems: "center",
  },
  nonCashInstruction: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  nonCashTotal: { fontSize: 26, fontWeight: "800", color: "#347385" },

  // Transfer card
  transferCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    overflow: "hidden",
  },
  transferCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  transferCardTitle: { fontSize: 14, fontWeight: "700", color: "#1D4ED8" },
  transferRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EFF6FF",
  },
  transferLabel: { fontSize: 13, color: "#6B7280", flexShrink: 0 },
  transferBank: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1D4ED8",
    flexShrink: 1,
    textAlign: "right",
  },
  transferAccountNumber: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    flexShrink: 1,
    textAlign: "right",
  },
  transferAccountName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    flexShrink: 1,
    textAlign: "right",
  },
  transferTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#EFF6FF",
  },
  transferTotalLabel: { fontSize: 13, color: "#1D4ED8", fontWeight: "600" },
  transferTotalAmount: { fontSize: 18, fontWeight: "800", color: "#1D4ED8" },

  // QRIS card
  qrisCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    overflow: "hidden",
  },
  qrisCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#CC1414",
    paddingHorizontal: 14,
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
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    textAlign: "right",
  },
  qrisCodeWrap: {
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
  },
  qrisTabletBody: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  qrisTabletInfo: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    justifyContent: "center",
    gap: 6,
  },
  qrisTabletInfoLabel: { fontSize: 12, color: "#991B1B", fontWeight: "600" },
  qrisTabletInfoTotal: { fontSize: 22, fontWeight: "800", color: "#991B1B" },
  qrisTabletInfoHint: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },
  qrisTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FEF2F2",
  },
  qrisTotalLabel: { fontSize: 13, color: "#991B1B", fontWeight: "600" },
  qrisTotalAmount: { fontSize: 20, fontWeight: "800", color: "#991B1B" },

  // Delivery
  deliveryFeeCard: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  deliveryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  deliveryLabel: { fontSize: 13, color: "#6B7280" },
  deliveryValue: { fontSize: 14, fontWeight: "600", color: "#1A202C" },

  // Split
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 6,
    marginTop: 12,
  },
  cashDisplay: {
    backgroundColor: "#F5F3FF",
    borderRadius: 10,
    padding: 12,
    alignItems: "flex-end",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  cashDisplayText: { fontSize: 26, fontWeight: "800", color: "#7C3AED" },
  splitSecondRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  splitTabletTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  splitTabletMethodCol: { width: 140 },
  splitSecondBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  splitSecondBtnText: { fontSize: 12, fontWeight: "600", color: "#9CA3AF" },
  splitCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
  },
  splitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  splitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
  },
  splitBadgeText: { fontSize: 12, fontWeight: "700" },
  splitDivider: { height: 1, backgroundColor: "#F3F4F6", marginVertical: 2 },
  splitAmount: { fontSize: 15, fontWeight: "700" },

  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: "#56B2C1",
  },
  confirmBtnDisabled: { backgroundColor: "#D1D5DB" },
  confirmBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // QRIS Fullscreen
  qrisFullscreenBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  qrisFullscreenCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
    width: "100%",
    maxWidth: 380,
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
    fontSize: 13,
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
  qrisFullscreenTotal: { fontSize: 26, fontWeight: "800", color: "#991B1B" },
  qrisFullscreenTap: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 8,
    textAlign: "center",
  },
});
