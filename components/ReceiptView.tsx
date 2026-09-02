import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatCurrency, APP_NAME } from "@/constants/config";

export interface ReceiptItem {
  product_name: string;
  quantity: number;
  price: number;
  discount_amount?: number;
  subtotal: number;
}

export interface ReceiptTransaction {
  invoice_number: string;
  created_at: string;
  payment_method: string;
  payment_amount: number;
  change_amount: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  notes?: string | null;
  status: string;
  member_name?: string | null;
  points_earned?: number | null;
  member_total_points?: number | null;
  split_payment_detail?: { cashAmount: number; secondMethod: string; secondAmount: number } | null;
  delivery_fee?: number | null;
}

export interface ReceiptBranch {
  name: string;
  address?: string | null;
  phone?: string | null;
}

interface Props {
  transaction: ReceiptTransaction;
  items: ReceiptItem[];
  branch: ReceiptBranch;
  cashierName: string;
  showActions?: boolean;
  onPrint?: () => void;
  onShare?: () => void;
}

const DIVIDER = "--------------------------------";

const methodLabel: Record<string, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
  split: "Campuran",
  delivery: "Delivery",
};

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

export default function ReceiptView({
  transaction,
  items,
  branch,
  cashierName,
  showActions,
  onPrint,
  onShare,
}: Props) {
  const isVoid = transaction.status === "void";

  return (
    <View style={styles.receipt}>
      {/* Header */}
      <Text style={styles.storeName}>{branch.name || APP_NAME}</Text>
      {!!branch.address && (
        <Text style={styles.headerMeta}>{branch.address}</Text>
      )}
      {!!branch.phone && (
        <Text style={styles.headerMeta}>Tel: {branch.phone}</Text>
      )}

      <Text style={styles.divider}>{DIVIDER}</Text>

      {/* Invoice info */}
      <Text style={styles.invoiceNumber}>{transaction.invoice_number}</Text>
      <Text style={styles.divider}>{DIVIDER}</Text>

      <View style={styles.row}>
        <Text style={styles.labelText}>Tanggal</Text>
        <Text style={styles.valueText}>
          {formatDateTime(transaction.created_at)}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.labelText}>Kasir</Text>
        <Text style={styles.valueText}>{cashierName}</Text>
      </View>
      {!!transaction.member_name && (
        <View style={styles.row}>
          <Text style={styles.labelText}>Member</Text>
          <Text style={styles.valueText}>{transaction.member_name}</Text>
        </View>
      )}

      <Text style={styles.divider}>{DIVIDER}</Text>

      {/* Items */}
      {items.map((item, i) => (
        <View key={i} style={styles.itemBlock}>
          <Text style={styles.itemName}>{item.product_name}</Text>
          <View style={styles.row}>
            <Text style={styles.itemQtyPrice}>
              {item.quantity} x {formatCurrency(item.price)}
            </Text>
            <Text style={styles.itemSubtotal}>
              {formatCurrency(item.subtotal)}
            </Text>
          </View>
          {(item.discount_amount ?? 0) > 0 && (
            <View style={styles.row}>
              <Text style={styles.itemDiscountLabel}> Diskon item</Text>
              <Text style={styles.itemDiscountValue}>
                - {formatCurrency(item.discount_amount!)}
              </Text>
            </View>
          )}
        </View>
      ))}

      <Text style={styles.divider}>{DIVIDER}</Text>

      {/* Totals */}
      <View style={styles.row}>
        <Text style={styles.labelText}>Subtotal</Text>
        <Text style={styles.valueText}>
          {formatCurrency(transaction.subtotal)}
        </Text>
      </View>
      {transaction.discount_amount > 0 && (
        <View style={styles.row}>
          <Text style={styles.labelText}>Diskon</Text>
          <Text style={[styles.valueText, { color: "#22C55E" }]}>
            - {formatCurrency(transaction.discount_amount)}
          </Text>
        </View>
      )}
      {transaction.tax_amount > 0 && (
        <View style={styles.row}>
          <Text style={styles.labelText}>Pajak</Text>
          <Text style={styles.valueText}>
            {formatCurrency(transaction.tax_amount)}
          </Text>
        </View>
      )}

      <Text style={styles.divider}>{DIVIDER}</Text>

      {(transaction.delivery_fee ?? 0) > 0 && (
        <View style={styles.row}>
          <Text style={styles.labelText}>Ongkir</Text>
          <Text style={styles.valueText}>{formatCurrency(transaction.delivery_fee ?? 0)}</Text>
        </View>
      )}
      <View style={styles.row}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={styles.totalValue}>
          {formatCurrency(transaction.total)}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.labelText}>Metode</Text>
        <Text style={styles.valueText}>
          {methodLabel[transaction.payment_method] || transaction.payment_method}
        </Text>
      </View>
      {transaction.split_payment_detail ? (
        <>
          <View style={styles.row}>
            <Text style={styles.labelText}>  Tunai</Text>
            <Text style={styles.valueText}>
              {formatCurrency(transaction.split_payment_detail.cashAmount)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.labelText}>
              {'  '}{methodLabel[transaction.split_payment_detail.secondMethod] || transaction.split_payment_detail.secondMethod}
            </Text>
            <Text style={styles.valueText}>
              {formatCurrency(transaction.split_payment_detail.secondAmount)}
            </Text>
          </View>
          {transaction.change_amount > 0 && (
            <View style={styles.row}>
              <Text style={styles.labelText}>Kembalian</Text>
              <Text style={[styles.valueText, { color: "#22C55E", fontWeight: "700" }]}>
                {formatCurrency(transaction.change_amount)}
              </Text>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.row}>
            <Text style={styles.labelText}>Bayar</Text>
            <Text style={styles.valueText}>
              {formatCurrency(transaction.payment_amount)}
            </Text>
          </View>
          {transaction.change_amount > 0 && (
            <View style={styles.row}>
              <Text style={styles.labelText}>Kembalian</Text>
              <Text style={[styles.valueText, { color: "#22C55E", fontWeight: "700" }]}>
                {formatCurrency(transaction.change_amount)}
              </Text>
            </View>
          )}
        </>
      )}

      {!!transaction.notes && (
        <>
          <Text style={styles.divider}>{DIVIDER}</Text>
          <Text style={styles.notes}>Catatan: {transaction.notes}</Text>
        </>
      )}

      {!!transaction.member_name && (
        <>
          <Text style={styles.divider}>{DIVIDER}</Text>
          {!!transaction.points_earned && transaction.points_earned > 0 && (
            <Text style={styles.pointsEarned}>
              +{transaction.points_earned} poin untuk {transaction.member_name}
            </Text>
          )}
          {transaction.member_total_points != null && (
            <Text style={styles.memberTotalPoints}>
              Total poin:{" "}
              {transaction.member_total_points.toLocaleString("id-ID")}
            </Text>
          )}
        </>
      )}

      <Text style={styles.divider}>{DIVIDER}</Text>

      {isVoid ? (
        <Text style={styles.voidBadge}>** TRANSAKSI DIBATALKAN **</Text>
      ) : (
        <Text style={styles.footer}>Terima kasih telah berbelanja!</Text>
      )}
      <Text style={styles.footerSub}>{APP_NAME}</Text>

      {/* Action buttons */}
      {showActions && (
        <View style={styles.actions}>
          {onPrint && (
            <TouchableOpacity style={styles.actionBtn} onPress={onPrint}>
              <Ionicons name="print-outline" size={18} color="#347385" />
              <Text style={styles.actionBtnText}>Cetak</Text>
            </TouchableOpacity>
          )}
          {onShare && (
            <TouchableOpacity style={styles.actionBtn} onPress={onShare}>
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
              <Text style={styles.actionBtnText}>Kirim WA</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  receipt: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  storeName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 2,
  },
  headerMeta: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  divider: {
    fontSize: 11,
    color: "#D1D5DB",
    textAlign: "center",
    marginVertical: 8,
    letterSpacing: 0,
  },
  invoiceNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginVertical: 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 3,
  },
  labelText: {
    fontSize: 13,
    color: "#6B7280",
    flex: 1,
  },
  valueText: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "500",
    textAlign: "right",
    flex: 1,
  },
  itemBlock: {
    marginBottom: 6,
  },
  itemName: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
  },
  itemQtyPrice: {
    fontSize: 12,
    color: "#6B7280",
  },
  itemSubtotal: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "500",
  },
  itemDiscountLabel: {
    fontSize: 11,
    color: "#22C55E",
  },
  itemDiscountValue: {
    fontSize: 11,
    color: "#22C55E",
    fontWeight: "600",
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  notes: {
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
  },
  pointsEarned: {
    fontSize: 12,
    color: "#D97706",
    fontWeight: "700",
    textAlign: "center",
  },
  memberTotalPoints: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 2,
  },
  footer: {
    fontSize: 13,
    color: "#374151",
    textAlign: "center",
    fontWeight: "600",
  },
  footerSub: {
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 2,
  },
  voidBadge: {
    fontSize: 13,
    fontWeight: "800",
    color: "#EF4444",
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#347385",
    backgroundColor: "#EEF8FA",
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#347385",
  },
});
