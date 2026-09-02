/**
 * Transaction Detail Screen
 * Shows full receipt, reprint button, and void/cancel (same-day only).
 */

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import ReceiptView, {
  type ReceiptTransaction,
  type ReceiptItem,
  type ReceiptBranch,
} from "@/components/ReceiptView";
import { printReceipt } from "@/lib/printerHelper";

import { formatCurrency } from "@/constants/config";
import { buildReceiptText, shareToWhatsApp } from "@/lib/shareReceipt";
import ReceiptShareModal from "@/components/ReceiptShareModal";
import type { ReceiptImageData } from "@/components/ReceiptImageView";
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface TxDetail {
  id: string;
  branch_id: string;
  invoice_number: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  payment_method: string;
  payment_amount: number;
  change_amount: number;
  split_payment_detail?: { cashAmount: number; secondMethod: string; secondAmount: number } | null;
  delivery_fee: number;
  notes: string | null;
  status: string;
  created_at: string;
  cashier_name: string;
  branch_name: string;
  branch_address: string | null;
  branch_phone: string | null;
  member_name: string | null;
  points_earned: number | null;
  member_total_points: number | null;
}

interface TxItem {
  product_name: string;
  quantity: number;
  price: number;
  discount_amount: number;
  subtotal: number;
}

function isToday(iso: string): boolean {
  try {
    const d = new Date(iso);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  } catch {
    return false;
  }
}

export default function TransactionDetailScreen() {
  const { id, fromProduct } = useLocalSearchParams<{ id: string; fromProduct?: string }>();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const [tx, setTx] = useState<TxDetail | null>(null);
  const [items, setItems] = useState<TxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: row } = await supabase
        .from('transactions')
        .select('id, branch_id, invoice_number, subtotal, discount_amount, tax_amount, total, payment_method, payment_amount, change_amount, split_payment_detail, delivery_fee, notes, status, created_at, points_earned, users!cashier_id(name), branches!branch_id(name, address, phone), members!member_id(name, points)')
        .eq('id', id)
        .single();

      if (!row) return;

      setTx({
        id: row.id,
        branch_id: row.branch_id,
        invoice_number: row.invoice_number,
        subtotal: row.subtotal,
        discount_amount: row.discount_amount,
        tax_amount: row.tax_amount,
        total: row.total,
        payment_method: row.payment_method,
        payment_amount: row.payment_amount,
        change_amount: row.change_amount,
        split_payment_detail: (row as any).split_payment_detail ?? null,
        delivery_fee: (row as any).delivery_fee ?? 0,
        notes: row.notes,
        status: row.status,
        created_at: row.created_at,
        points_earned: row.points_earned ?? null,
        cashier_name: (row as any).users?.name ?? '',
        branch_name: (row as any).branches?.name ?? '',
        branch_address: (row as any).branches?.address ?? null,
        branch_phone: (row as any).branches?.phone ?? null,
        member_name: (row as any).members?.name ?? null,
        member_total_points: (row as any).members?.points ?? null,
      });

      const { data: txItems } = await supabase
        .from('transaction_items')
        .select('product_name, quantity, price, discount_amount, subtotal')
        .eq('transaction_id', id)
        .order('created_at', { ascending: true });
      setItems(txItems ?? []);
    } catch (e) {
      console.error("[TxDetail] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadDetail();
    }, [loadDetail]),
  );

  const handlePrint = async () => {
    if (!tx) return;
    await printReceipt({
      storeName: tx.branch_name,
      storeAddress: tx.branch_address,
      storePhone: tx.branch_phone,
      cashierName: tx.cashier_name,
      invoiceNumber: tx.invoice_number,
      createdAt: tx.created_at,
      items: items.map((i) => ({
        name: i.product_name,
        qty: i.quantity,
        price: i.price,
        discountAmount: i.discount_amount,
        subtotal: i.subtotal,
      })),
      subtotal: tx.subtotal,
      discountAmount: tx.discount_amount,
      taxAmount: tx.tax_amount,
      total: tx.total,
      paymentMethod: tx.payment_method,
      paymentAmount: tx.payment_amount,
      changeAmount: tx.change_amount,
      notes: tx.notes,
      memberName: tx.member_name,
      pointsEarned: tx.points_earned,
      memberTotalPoints: tx.member_total_points,
    });
  };

  const handleShare = () => setShowShareModal(true);

  const receiptImageData: ReceiptImageData | null = tx ? {
    storeName: tx.branch_name,
    invoiceNumber: tx.invoice_number,
    createdAt: tx.created_at,
    items: items.map((i) => ({
      name: i.product_name,
      qty: i.quantity,
      price: i.price,
      subtotal: i.subtotal,
    })),
    subtotal: tx.subtotal,
    discountAmount: tx.discount_amount,
    taxAmount: tx.tax_amount,
    deliveryFee: tx.delivery_fee,
    total: tx.total,
    paymentMethod: tx.payment_method,
    paymentAmount: tx.payment_amount,
    changeAmount: tx.change_amount,
    memberName: tx.member_name,
    pointsEarned: tx.points_earned,
    splitPayment: tx.split_payment_detail ?? null,
  } : null;

  const handleVoid = async () => {
    if (!tx || !user) return;
    if (!voidReason.trim()) {
      Alert.alert("Alasan diperlukan", "Masukkan alasan pembatalan transaksi.");
      return;
    }

    setVoiding(true);
    try {
      const now = new Date().toISOString();

      const { error: voidErr } = await supabase
        .from('transactions')
        .update({ status: 'void', voided_by: user.id, voided_at: now, notes: voidReason.trim(), updated_at: now })
        .eq('id', tx.id);
      if (voidErr) throw new Error(voidErr.message);

      const { data: txItemsWithProduct } = await supabase
        .from('transaction_items')
        .select('product_id, quantity')
        .eq('transaction_id', tx.id);

      const branchId = tx.branch_id;
      for (const item of txItemsWithProduct ?? []) {
        if (!item.product_id) continue;
        const { data: bp } = await supabase
          .from('branch_products')
          .select('stock')
          .eq('product_id', item.product_id)
          .eq('branch_id', branchId)
          .maybeSingle();
        if (bp !== null) {
          const newStock = (bp?.stock ?? 0) + item.quantity;
          await supabase
            .from('branch_products')
            .upsert(
              { branch_id: branchId, product_id: item.product_id, stock: newStock, updated_at: now },
              { onConflict: 'branch_id,product_id' }
            );
          await supabase.from('stock_movements').insert({
            id: uuid(),
            product_id: item.product_id,
            branch_id: branchId,
            type: 'void',
            quantity: item.quantity,
            qty_before: bp?.stock ?? 0,
            qty_after: newStock,
            reason: `Void transaksi ${tx.invoice_number}: ${voidReason.trim()}`,
            reference_id: tx.id,
            created_by: user.id,
            created_at: now,
          });
        }
      }

      setVoidModalVisible(false);
      setVoidReason("");
      await loadDetail();
      Alert.alert(
        "Berhasil",
        "Transaksi berhasil dibatalkan dan stok telah dikembalikan.",
      );
    } catch (e) {
      console.error("[TxDetail] void error:", e);
      Alert.alert("Gagal", "Terjadi kesalahan saat membatalkan transaksi.");
    } finally {
      setVoiding(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <ActivityIndicator size="large" color="#56B2C1" />
      </View>
    );
  }

  if (!tx) {
    return (
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" />
        <Text style={{ fontSize: 14, color: "#9CA3AF", marginTop: 8 }}>
          Transaksi tidak ditemukan
        </Text>
      </View>
    );
  }

  const receiptTx: ReceiptTransaction = {
    invoice_number: tx.invoice_number,
    created_at: tx.created_at,
    payment_method: tx.payment_method,
    payment_amount: tx.payment_amount,
    change_amount: tx.change_amount,
    split_payment_detail: tx.split_payment_detail,
    delivery_fee: tx.delivery_fee,
    subtotal: tx.subtotal,
    discount_amount: tx.discount_amount,
    tax_amount: tx.tax_amount,
    total: tx.total,
    notes: tx.notes,
    status: tx.status,
    member_name: tx.member_name,
    points_earned: tx.points_earned,
    member_total_points: tx.member_total_points,
  };

  const receiptItems: ReceiptItem[] = items.map((i) => ({
    product_name: i.product_name,
    quantity: i.quantity,
    price: i.price,
    discount_amount: i.discount_amount,
    subtotal: i.subtotal,
  }));

  const receiptBranch: ReceiptBranch = {
    name: tx.branch_name,
    address: tx.branch_address,
    phone: tx.branch_phone,
  };

  const canVoid = tx.status === "completed" && isToday(tx.created_at);
  const canRefund = tx.status === "completed";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => fromProduct ? router.push(`/(owner)/products/${fromProduct}` as any) : router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Detail Transaksi</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 24 },
        ]}
      >
        <ReceiptView
          transaction={receiptTx}
          items={receiptItems}
          branch={receiptBranch}
          cashierName={tx.cashier_name}
          showActions={true}
          onPrint={handlePrint}
          onShare={handleShare}
        />

        {/* Member info card */}
        {!!tx.member_name && (
          <View style={styles.memberCard}>
            <View style={styles.memberCardLeft}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {tx.member_name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={styles.memberCardLabel}>Member</Text>
                <Text style={styles.memberCardName}>{tx.member_name}</Text>
              </View>
            </View>
            {(tx.points_earned ?? 0) > 0 && (
              <View style={styles.pointsBadge}>
                <Ionicons name="star" size={13} color="#D97706" />
                <Text style={styles.pointsBadgeText}>
                  +{tx.points_earned} poin
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Refund button */}
        {canRefund && (
          <TouchableOpacity
            style={styles.refundBtn}
            onPress={() => router.push(`/(cashier)/history/refund?id=${id}` as any)}
          >
            <Ionicons name="return-up-back-outline" size={18} color="#D97706" />
            <Text style={styles.refundBtnText}>Return / Refund</Text>
          </TouchableOpacity>
        )}

        {/* Void button */}
        {canVoid && (
          <TouchableOpacity
            style={styles.voidBtn}
            onPress={() => setVoidModalVisible(true)}
          >
            <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
            <Text style={styles.voidBtnText}>Batalkan Transaksi</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Void confirmation modal */}
      <Modal visible={voidModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Batalkan Transaksi</Text>
            <Text style={styles.modalSub}>
              Transaksi {tx.invoice_number} akan dibatalkan dan stok akan
              dikembalikan.
            </Text>

            <Text style={styles.inputLabel}>Alasan Pembatalan</Text>
            <TextInput
              style={styles.input}
              placeholder="Masukkan alasan..."
              placeholderTextColor="#9CA3AF"
              value={voidReason}
              onChangeText={setVoidReason}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setVoidModalVisible(false);
                  setVoidReason("");
                }}
                disabled={voiding}
              >
                <Text style={styles.modalCancelText}>Tutup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, voiding && { opacity: 0.6 }]}
                onPress={handleVoid}
                disabled={voiding}
              >
                {voiding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Ya, Batalkan</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ReceiptShareModal
        visible={showShareModal}
        data={receiptImageData}
        onClose={() => setShowShareModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  topBarTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },

  scroll: { padding: 16, gap: 12 },

  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#A9DFE9",
  },
  memberCardLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#347385",
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: { fontSize: 18, fontWeight: "800", color: "#fff" },
  memberCardLabel: { fontSize: 11, color: "#9CA3AF", marginBottom: 1 },
  memberCardName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  pointsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFBEB",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  pointsBadgeText: { fontSize: 13, fontWeight: "700", color: "#D97706" },

  refundBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D97706",
    backgroundColor: "#FFFBEB",
    marginTop: 4,
  },
  refundBtnText: { fontSize: 14, fontWeight: "700", color: "#D97706" },

  voidBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
    marginTop: 4,
  },
  voidBtnText: { fontSize: 14, fontWeight: "700", color: "#DC2626" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  modalSub: { fontSize: 13, color: "#6B7280" },
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#374151" },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    textAlignVertical: "top",
    minHeight: 80,
    backgroundColor: "#F9FAFB",
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  modalCancelText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "#DC2626",
    alignItems: "center",
  },
  modalConfirmText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
