import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
  TextInput, ActivityIndicator, Modal, ScrollView, RefreshControl,
  useWindowDimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';
import {
  fetchMembersFromSupabase,
  createMemberInSupabase,
  deleteMemberFromSupabase,
  getMemberTransactionsFromSupabase,
  getMemberPointLogsFromSupabase,
  type Member,
  type PointLog,
} from '@/lib/memberQueries';
import RedeemPointModal from '@/components/RedeemPointModal';
import MemberReportButton from '@/components/MemberReportButton';
import { formatCurrency } from '@/constants/config';
import ReceiptView, { type ReceiptTransaction, type ReceiptItem, type ReceiptBranch } from '@/components/ReceiptView';
import { router } from 'expo-router';
import { printReceipt } from '@/lib/printerHelper';
import { supabase } from '@/lib/supabase';

interface MemberTx {
  id: string;
  invoice_number: string;
  total: number;
  payment_method: string;
  created_at: string;
  status: string;
}

const METHOD_LABEL: Record<string, string> = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS' };

interface TxDetail {
  id: string;
  invoice_number: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  payment_method: string;
  payment_amount: number;
  change_amount: number;
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

interface TxDetailItem {
  product_name: string;
  quantity: number;
  price: number;
  discount_amount: number;
  subtotal: number;
}

async function getTxDetail(txId: string): Promise<{ tx: TxDetail; items: TxDetailItem[] } | null> {
  const { data: txData, error: txError } = await supabase
    .from('transactions')
    .select(`
      id, invoice_number, subtotal, discount_amount, tax_amount,
      total, payment_method, payment_amount, change_amount, notes,
      status, created_at, points_earned,
      users(name),
      branches(name, address, phone),
      members(name, points)
    `)
    .eq('id', txId)
    .single();

  if (txError || !txData) return null;

  const tx: TxDetail = {
    id: txData.id,
    invoice_number: txData.invoice_number,
    subtotal: txData.subtotal,
    discount_amount: txData.discount_amount,
    tax_amount: txData.tax_amount,
    total: txData.total,
    payment_method: txData.payment_method,
    payment_amount: txData.payment_amount,
    change_amount: txData.change_amount,
    notes: txData.notes,
    status: txData.status,
    created_at: txData.created_at,
    points_earned: txData.points_earned,
    cashier_name: (txData as any).users?.name ?? '-',
    branch_name: (txData as any).branches?.name ?? '-',
    branch_address: (txData as any).branches?.address ?? null,
    branch_phone: (txData as any).branches?.phone ?? null,
    member_name: (txData as any).members?.name ?? null,
    member_total_points: (txData as any).members?.points ?? null,
  };

  const { data: itemsData } = await supabase
    .from('transaction_items')
    .select('product_name, quantity, price, discount_amount, subtotal')
    .eq('transaction_id', txId)
    .order('created_at', { ascending: true });

  return { tx, items: itemsData ?? [] };
}

function TxDetailModal({ txId, onClose }: { txId: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<{ tx: TxDetail; items: TxDetailItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getTxDetail(txId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [txId]);

  useEffect(() => { load(); }, [load]);

  const tx = data?.tx ?? null;
  const items = data?.items ?? [];

  const isToday = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };

  const canVoid = !!tx && tx.status === 'completed' && isToday(tx.created_at);
  const canRefund = !!tx && tx.status === 'completed';

  const handlePrint = async () => {
    if (!tx) return;
    printReceipt({
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
    }).catch(() => {});
  };

  const handleVoid = async () => {
    if (!tx || !user) return;
    if (!voidReason.trim()) {
      Alert.alert('Alasan diperlukan', 'Masukkan alasan pembatalan transaksi.');
      return;
    }
    setVoiding(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('transactions')
        .update({ status: 'void', voided_by: user.id, voided_at: now, notes: voidReason.trim(), updated_at: now })
        .eq('id', tx.id);
      if (error) throw error;

      const branchId = user.branch_id ?? '';
      for (const item of items) {
        const { data: productRow } = await supabase
          .from('transaction_items')
          .select('product_id')
          .eq('transaction_id', tx.id)
          .eq('product_name', item.product_name)
          .single();

        if (productRow?.product_id) {
          const { data: bp } = await supabase
            .from('branch_products')
            .select('stock')
            .eq('product_id', productRow.product_id)
            .eq('branch_id', branchId)
            .maybeSingle();

          if (bp !== null) {
            const newStock = (bp?.stock ?? 0) + item.quantity;
            await supabase
              .from('branch_products')
              .upsert(
                { branch_id: branchId, product_id: productRow.product_id, stock: newStock, updated_at: now },
                { onConflict: 'branch_id,product_id' }
              );

            await supabase.from('stock_movements').insert({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              product_id: productRow.product_id,
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
      }

      setVoidModalVisible(false);
      setVoidReason('');
      load();
      Alert.alert('Berhasil', 'Transaksi berhasil dibatalkan dan stok telah dikembalikan.');
    } catch {
      Alert.alert('Gagal', 'Terjadi kesalahan saat membatalkan transaksi.');
    } finally {
      setVoiding(false);
    }
  };

  const receiptTx: ReceiptTransaction | null = tx ? {
    invoice_number: tx.invoice_number,
    created_at: tx.created_at,
    payment_method: tx.payment_method,
    payment_amount: tx.payment_amount,
    change_amount: tx.change_amount,
    subtotal: tx.subtotal,
    discount_amount: tx.discount_amount,
    tax_amount: tx.tax_amount,
    total: tx.total,
    notes: tx.notes,
    status: tx.status,
    member_name: tx.member_name,
    points_earned: tx.points_earned,
    member_total_points: tx.member_total_points,
  } : null;

  const receiptItems: ReceiptItem[] = items.map((i) => ({
    product_name: i.product_name,
    quantity: i.quantity,
    price: i.price,
    discount_amount: i.discount_amount,
    subtotal: i.subtotal,
  }));

  const receiptBranch: ReceiptBranch | null = tx ? {
    name: tx.branch_name,
    address: tx.branch_address,
    phone: tx.branch_phone,
  } : null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[txDetailStyles.container, { paddingTop: insets.top }]}>
        <View style={txDetailStyles.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={txDetailStyles.headerTitle}>Detail Transaksi</Text>
          <View style={{ width: 30 }} />
        </View>

        {loading ? (
          <View style={txDetailStyles.centered}>
            <ActivityIndicator size="large" color="#56B2C1" />
          </View>
        ) : !receiptTx || !receiptBranch ? (
          <View style={txDetailStyles.centered}>
            <Text style={txDetailStyles.errorText}>Transaksi tidak ditemukan</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[txDetailStyles.scroll, { paddingBottom: insets.bottom + 24 }]}>
            <ReceiptView
              transaction={receiptTx}
              items={receiptItems}
              branch={receiptBranch}
              cashierName={tx!.cashier_name}
              showActions
              onPrint={handlePrint}
            />

            {canRefund && (
              <TouchableOpacity
                style={txDetailStyles.refundBtn}
                onPress={() => { onClose(); router.push(`/(cashier)/history/refund?id=${tx!.id}` as any); }}
              >
                <Ionicons name="return-up-back-outline" size={18} color="#D97706" />
                <Text style={txDetailStyles.refundBtnText}>Return / Refund</Text>
              </TouchableOpacity>
            )}

            {canVoid && (
              <TouchableOpacity
                style={txDetailStyles.voidBtn}
                onPress={() => setVoidModalVisible(true)}
              >
                <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                <Text style={txDetailStyles.voidBtnText}>Batalkan Transaksi</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>

      <Modal visible={voidModalVisible} transparent animationType="fade">
        <View style={txDetailStyles.modalOverlay}>
          <View style={txDetailStyles.modalCard}>
            <Text style={txDetailStyles.modalTitle}>Batalkan Transaksi</Text>
            <Text style={txDetailStyles.modalSub}>
              Transaksi {tx?.invoice_number} akan dibatalkan dan stok akan dikembalikan.
            </Text>
            <Text style={txDetailStyles.inputLabel}>Alasan Pembatalan</Text>
            <TextInput
              style={txDetailStyles.input}
              placeholder="Masukkan alasan..."
              placeholderTextColor="#9CA3AF"
              value={voidReason}
              onChangeText={setVoidReason}
              multiline
              numberOfLines={3}
            />
            <View style={txDetailStyles.modalActions}>
              <TouchableOpacity
                style={txDetailStyles.modalCancelBtn}
                onPress={() => { setVoidModalVisible(false); setVoidReason(''); }}
                disabled={voiding}
              >
                <Text style={txDetailStyles.modalCancelText}>Tutup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[txDetailStyles.modalConfirmBtn, voiding && { opacity: 0.6 }]}
                onPress={handleVoid}
                disabled={voiding}
              >
                {voiding
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={txDetailStyles.modalConfirmText}>Ya, Batalkan</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

function fmtPoints(p: number) { return p.toLocaleString('id-ID') + ' poin'; }
function fmtMoney(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

// ─── Member Detail Modal ──────────────────────────────────────────────────────

function MemberDetailModal({ member, onClose, onPointsUpdated, onDeleted }: {
  member: Member;
  onClose: () => void;
  onPointsUpdated: (memberId: string, newPoints: number) => void;
  onDeleted: (memberId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'points' | 'transactions'>('points');
  const [logs, setLogs] = useState<PointLog[]>([]);
  const [transactions, setTransactions] = useState<MemberTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPoints, setCurrentPoints] = useState(member.points);
  const [showRedeem, setShowRedeem] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getMemberPointLogsFromSupabase(member.id),
      getMemberTransactionsFromSupabase(member.id),
    ])
      .then(([pointLogs, txs]) => {
        setLogs(pointLogs);
        setTransactions(txs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [member.id]);

  const handleDelete = () => {
    Alert.alert(
      'Nonaktifkan Member',
      `Apakah Anda yakin ingin menonaktifkan member "${member.name}"? Data tidak akan terhapus permanen.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Nonaktifkan',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteMemberFromSupabase(member.id);
              onDeleted(member.id);
              onClose();
            } catch (e: any) {
              Alert.alert('Gagal', e?.message ?? 'Terjadi kesalahan.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const memberWithCurrentPoints = { ...member, points: currentPoints };

  const handleRedeemed = (newPoints: number) => {
    setCurrentPoints(newPoints);
    onPointsUpdated(member.id, newPoints);
    getMemberPointLogsFromSupabase(member.id).then(setLogs).catch(() => {});
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[detailStyles.container, { paddingTop: insets.top }]}>
        <View style={detailStyles.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={detailStyles.headerTitle} numberOfLines={1}>{member.name}</Text>
          {!member.is_active ? (
            <View style={detailStyles.inactiveBadge}>
              <Text style={detailStyles.inactiveBadgeText}>NONAKTIF</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={handleDelete} disabled={deleting} style={{ padding: 4 }}>
              {deleting
                ? <ActivityIndicator size="small" color="#DC2626" />
                : <Ionicons name="trash-outline" size={20} color="#DC2626" />
              }
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={detailStyles.scroll}>
          {/* Avatar & info */}
          <View style={detailStyles.profileCard}>
            <View style={detailStyles.avatar}>
              <Text style={detailStyles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={detailStyles.name}>{member.name}</Text>
            {!!member.phone && (
              <View style={detailStyles.infoRow}>
                <Ionicons name="call-outline" size={14} color="#6B7280" />
                <Text style={detailStyles.infoText}>{member.phone}</Text>
              </View>
            )}
            {!!member.address && (
              <View style={detailStyles.infoRow}>
                <Ionicons name="location-outline" size={14} color="#6B7280" />
                <Text style={detailStyles.infoText}>{member.address}</Text>
              </View>
            )}
            {!!member.branch_name && (
              <View style={detailStyles.registeredRow}>
                <Ionicons name="business-outline" size={12} color="#9CA3AF" />
                <Text style={detailStyles.registeredText}>Daftar di {member.branch_name}</Text>
              </View>
            )}
          </View>

          {/* Stats */}
          <View style={detailStyles.statsRow}>
            <View style={detailStyles.statBox}>
              <Ionicons name="star" size={20} color="#D97706" />
              <Text style={[detailStyles.statValue, { color: '#D97706' }]}>{currentPoints.toLocaleString('id-ID')}</Text>
              <Text style={detailStyles.statLabel}>Poin</Text>
            </View>
            <View style={detailStyles.statDivider} />
            <View style={detailStyles.statBox}>
              <Ionicons name="receipt-outline" size={20} color="#347385" />
              <Text style={[detailStyles.statValue, { color: '#347385' }]}>{fmtMoney(member.total_spent)}</Text>
              <Text style={detailStyles.statLabel}>Total Belanja</Text>
            </View>
            <View style={detailStyles.statDivider} />
            <View style={detailStyles.statBox}>
              <Ionicons name="layers-outline" size={20} color="#7C3AED" />
              <Text style={[detailStyles.statValue, { color: '#7C3AED' }]}>{transactions.length}</Text>
              <Text style={detailStyles.statLabel}>Transaksi</Text>
            </View>
          </View>

          {/* Tukar Poin */}
          {!!member.is_active && currentPoints > 0 && (
            <TouchableOpacity style={detailStyles.redeemBtn} onPress={() => setShowRedeem(true)} activeOpacity={0.85}>
              <Ionicons name="gift-outline" size={17} color="#fff" />
              <Text style={detailStyles.redeemBtnText}>Tukar Poin</Text>
              <View style={detailStyles.redeemPointsBadge}>
                <Ionicons name="star" size={11} color="#D97706" />
                <Text style={detailStyles.redeemPointsCount}>{currentPoints.toLocaleString('id-ID')}</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Tab */}
          <View style={detailStyles.tabRow}>
            <TouchableOpacity
              style={[detailStyles.tabBtn, activeTab === 'points' && detailStyles.tabBtnActive]}
              onPress={() => setActiveTab('points')}
            >
              <Ionicons name="star-outline" size={14} color={activeTab === 'points' ? '#347385' : '#9CA3AF'} />
              <Text style={[detailStyles.tabBtnText, activeTab === 'points' && detailStyles.tabBtnTextActive]}>
                Riwayat Poin
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[detailStyles.tabBtn, activeTab === 'transactions' && detailStyles.tabBtnActive]}
              onPress={() => setActiveTab('transactions')}
            >
              <Ionicons name="receipt-outline" size={14} color={activeTab === 'transactions' ? '#347385' : '#9CA3AF'} />
              <Text style={[detailStyles.tabBtnText, activeTab === 'transactions' && detailStyles.tabBtnTextActive]}>
                Riwayat Transaksi
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color="#56B2C1" style={{ marginTop: 16 }} />
          ) : activeTab === 'points' ? (
            logs.length === 0 ? (
              <Text style={detailStyles.emptyLogs}>Belum ada riwayat poin</Text>
            ) : (
              logs.map((log) => (
                <View key={log.id} style={detailStyles.logItem}>
                  <View style={[detailStyles.logIconWrap, log.points < 0 && detailStyles.logIconWrapMinus]}>
                    <Ionicons name={log.points < 0 ? 'gift-outline' : 'star'} size={14} color={log.points < 0 ? '#347385' : '#D97706'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={detailStyles.logDesc}>{log.description ?? 'Poin transaksi'}</Text>
                    <Text style={detailStyles.logDate}>
                      {new Date(log.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text style={[detailStyles.logPoints, log.points < 0 && detailStyles.logPointsMinus]}>
                    {log.points > 0 ? '+' : ''}{log.points}
                  </Text>
                </View>
              ))
            )
          ) : (
            transactions.length === 0 ? (
              <Text style={detailStyles.emptyLogs}>Belum ada riwayat transaksi</Text>
            ) : (
              transactions.map((tx) => (
                <TouchableOpacity key={tx.id} style={detailStyles.txItem} onPress={() => setSelectedTxId(tx.id)} activeOpacity={0.7}>
                  <View style={detailStyles.txIconWrap}>
                    <Ionicons name="receipt-outline" size={14} color="#347385" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={detailStyles.txInvoice}>{tx.invoice_number}</Text>
                    <View style={detailStyles.txMetaRow}>
                      <Text style={detailStyles.txMethod}>{METHOD_LABEL[tx.payment_method] ?? tx.payment_method}</Text>
                      <Text style={detailStyles.txDate}>
                        {new Date(tx.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={detailStyles.txTotal}>{formatCurrency(tx.total)}</Text>
                    {tx.status === 'void' && (
                      <View style={detailStyles.voidBadge}>
                        <Text style={detailStyles.voidBadgeText}>VOID</Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
                </TouchableOpacity>
              ))
            )
          )}
        </ScrollView>
      </View>

      <RedeemPointModal
        visible={showRedeem}
        member={memberWithCurrentPoints}
        onRedeemed={handleRedeemed}
        onClose={() => setShowRedeem(false)}
      />
      {!!selectedTxId && (
        <TxDetailModal txId={selectedTxId} onClose={() => setSelectedTxId(null)} />
      )}
    </Modal>
  );
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────

function AddMemberModal({
  branchId,
  onSaved,
  onClose,
}: {
  branchId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) { setError('Nama wajib diisi'); return; }
    setSaving(true);
    setError('');
    try {
      await createMemberInSupabase({ name, phone, address, branch_id: branchId });
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={addStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={addStyles.card} activeOpacity={1} onPress={() => {}}>
          <View style={addStyles.cardHeader}>
            <Text style={addStyles.cardTitle}>Daftarkan Member Baru</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          {!!error && (
            <View style={addStyles.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
              <Text style={addStyles.errorText}>{error}</Text>
            </View>
          )}

          <View style={addStyles.field}>
            <Text style={addStyles.label}>Nama *</Text>
            <View style={addStyles.inputWrap}>
              <Ionicons name="person-outline" size={15} color="#9CA3AF" style={{ marginHorizontal: 10 }} />
              <TextInput
                style={addStyles.input}
                value={name}
                onChangeText={setName}
                placeholder="Nama lengkap"
                placeholderTextColor="#9CA3AF"
                autoFocus
              />
            </View>
          </View>

          <View style={addStyles.field}>
            <Text style={addStyles.label}>No. HP</Text>
            <View style={addStyles.inputWrap}>
              <Ionicons name="call-outline" size={15} color="#9CA3AF" style={{ marginHorizontal: 10 }} />
              <TextInput
                style={addStyles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="08xxxxxxxx"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={addStyles.field}>
            <Text style={addStyles.label}>Alamat</Text>
            <View style={addStyles.inputWrap}>
              <Ionicons name="location-outline" size={15} color="#9CA3AF" style={{ marginHorizontal: 10 }} />
              <TextInput
                style={[addStyles.input, { paddingVertical: 9 }]}
                value={address}
                onChangeText={setAddress}
                placeholder="opsional"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={2}
              />
            </View>
          </View>

          <TouchableOpacity style={addStyles.saveBtn} onPress={save} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={addStyles.saveBtnText}>Daftarkan Member</Text>
            }
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({ member, isTablet, onPress }: { member: Member; isTablet: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[cardStyles.card, isTablet && cardStyles.cardTablet, !member.is_active && cardStyles.inactive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={cardStyles.avatar}>
        <Text style={cardStyles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={cardStyles.nameRow}>
          <Text style={cardStyles.name} numberOfLines={1}>{member.name}</Text>
          {!member.is_active && (
            <View style={cardStyles.inactiveBadge}>
              <Text style={cardStyles.inactiveBadgeText}>NONAKTIF</Text>
            </View>
          )}
        </View>
        {!!member.phone && <Text style={cardStyles.sub} numberOfLines={1}>{member.phone}</Text>}
        <View style={cardStyles.meta}>
          <View style={cardStyles.pointsPill}>
            <Ionicons name="star" size={11} color="#D97706" />
            <Text style={cardStyles.pointsText}>{fmtPoints(member.points)}</Text>
          </View>
          <Text style={cardStyles.spent}>{fmtMoney(member.total_spent)}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CashierMembersScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const branchId = useAuthStore((s) => s.currentBranch?.id ?? '');
  const branchName = useAuthStore((s) => s.currentBranch?.name ?? '');
  const userName = useAuthStore((s) => s.user?.name ?? '');
  const storeName = useAuthStore((s) => s.currentBranch?.name ?? '');

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'mine' | 'other'>('all');
  const [selected, setSelected] = useState<Member | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(async (opts: {
    pageNum: number;
    searchVal: string;
    filter: 'all' | 'mine' | 'other';
    append: boolean;
    silent?: boolean;
  }) => {
    if (!opts.silent && !opts.append) setLoading(true);
    if (opts.append) setLoadingMore(true);
    try {
      const result = await fetchMembersFromSupabase({
        page: opts.pageNum,
        search: opts.searchVal,
        branchFilter: opts.filter,
        branchId,
      });
      setMembers((prev) => opts.append ? [...prev, ...result.data] : result.data);
      setHasMore(result.hasMore);
      setTotal(result.total);
      setPage(opts.pageNum);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [branchId]);

  // Reset ke page 0 saat search atau filter berubah
  useEffect(() => {
    fetchPage({ pageNum: 0, searchVal: debouncedSearch, filter: tabFilter, append: false });
  }, [debouncedSearch, tabFilter, fetchPage]);

  // Debounce search input 400ms
  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(text), 400);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPage({ pageNum: 0, searchVal: debouncedSearch, filter: tabFilter, append: false, silent: true });
  }, [fetchPage, debouncedSearch, tabFilter]);

  const onLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    fetchPage({ pageNum: page + 1, searchVal: debouncedSearch, filter: tabFilter, append: true });
  }, [hasMore, loadingMore, loading, page, debouncedSearch, tabFilter, fetchPage]);

  useFocusEffect(useCallback(() => {
    fetchPage({ pageNum: 0, searchVal: debouncedSearch, filter: tabFilter, append: false });
  }, [fetchPage]));

  const activeCount = useMemo(() => members.filter((m) => m.is_active).length, [members]);
  const totalPoints = useMemo(() => members.reduce((a, m) => a + m.points, 0), [members]);
  const totalSpent = useMemo(() => members.reduce((a, m) => a + m.total_spent, 0), [members]);

  const numColumns = isTablet ? 2 : 1;

  const TAB_OPTIONS = [
    { key: 'all' as const, label: 'Semua' },
    { key: 'mine' as const, label: 'Cabang Saya' },
    { key: 'other' as const, label: 'Cabang Lain' },
  ];

  const ListHeader = (
    <View>
      {/* Tab filter */}
      <View style={styles.tabRow}>
        {TAB_OPTIONS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabChip, tabFilter === t.key && styles.tabChipActive]}
            onPress={() => { setMembers([]); setTabFilter(t.key); }}
          >
            <Text style={[styles.tabChipText, tabFilter === t.key && styles.tabChipTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statPill, { borderColor: '#56B2C133', backgroundColor: '#EEF8FA' }]}>
          <Text style={[styles.statValue, { color: '#347385' }]}>{activeCount}</Text>
          <Text style={[styles.statLabel, { color: '#347385' }]}>Aktif</Text>
        </View>
        <View style={[styles.statPill, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
          <Text style={[styles.statValue, { color: '#D97706' }]}>{totalPoints.toLocaleString('id-ID')}</Text>
          <Text style={[styles.statLabel, { color: '#D97706' }]}>Total Poin</Text>
        </View>
        <View style={[styles.statPill, { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' }]}>
          <Text style={[styles.statValue, { color: '#16A34A', fontSize: 13 }]}>{fmtMoney(totalSpent)}</Text>
          <Text style={[styles.statLabel, { color: '#16A34A' }]}>Total Belanja</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#9CA3AF" style={{ marginLeft: 14 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari nama atau no. HP..."
          value={search}
          onChangeText={handleSearchChange}
          placeholderTextColor="#9CA3AF"
        />
        {!!search && (
          <TouchableOpacity onPress={() => { handleSearchChange(''); setDebouncedSearch(''); }} style={{ paddingHorizontal: 12 }}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {total > 0 && (
        <Text style={styles.listCount}>{total} member</Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Member</Text>
        <View style={styles.headerActions}>
          <MemberReportButton
            storeName={storeName}
            branchName={branchName}
            printerName={userName}
          />
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <Ionicons name="person-add-outline" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Tambah</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#56B2C1" />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          numColumns={numColumns}
          key={numColumns}
          renderItem={({ item }) => (
            <View style={[styles.cardWrap, isTablet && styles.cardWrapTablet]}>
              <MemberCard member={item} isTablet={isTablet} onPress={() => setSelected(item)} />
            </View>
          )}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
          columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={25}
          maxToRenderPerBatch={25}
          windowSize={5}
          removeClippedSubviews
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#56B2C1']}
              tintColor="#56B2C1"
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#56B2C1" />
              </View>
            ) : hasMore ? (
              <View style={{ paddingVertical: 8 }} />
            ) : members.length > 0 ? (
              <Text style={styles.endText}>Semua {total} member ditampilkan</Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>Belum ada member</Text>
              <Text style={styles.emptySub}>
                {search ? 'Coba kata kunci lain' : 'Tap tombol Tambah untuk daftarkan member baru'}
              </Text>
            </View>
          }
        />
      )}

      {selected && (
        <MemberDetailModal
          member={selected}
          onClose={() => setSelected(null)}
          onPointsUpdated={(memberId, newPoints) => {
            setMembers((prev) =>
              prev.map((m) => (m.id === memberId ? { ...m, points: newPoints } : m))
            );
            setSelected((prev) => (prev && prev.id === memberId ? { ...prev, points: newPoints } : prev));
          }}
          onDeleted={(memberId) => {
            setMembers((prev) => prev.filter((m) => m.id !== memberId));
            setSelected(null);
          }}
        />
      )}

      {showAdd && (
        <AddMemberModal
          branchId={branchId}
          onSaved={() => {
            setShowAdd(false);
            fetchPage({ pageNum: 0, searchVal: debouncedSearch, filter: tabFilter, append: false, silent: true });
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const detailStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827' },
  inactiveBadge: {
    backgroundColor: '#F3F4F6', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  inactiveBadgeText: { fontSize: 10, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.5 },
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  profileCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    alignItems: 'center', gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  avatar: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  registeredRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  registeredText: { fontSize: 11, color: '#9CA3AF' },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#347385' },
  name: { fontSize: 18, fontWeight: '800', color: '#111827' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, color: '#6B7280' },
  statsRow: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyLogs: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
  },
  logIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center',
  },
  logIconWrapMinus: { backgroundColor: '#EEF8FA' },
  logDesc: { fontSize: 13, fontWeight: '600', color: '#111827' },
  logDate: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  logPoints: { fontSize: 15, fontWeight: '800', color: '#D97706' },
  logPointsMinus: { color: '#347385' },
  redeemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#347385', borderRadius: 14, paddingVertical: 13,
  },
  redeemBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  redeemPointsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  redeemPointsCount: { fontSize: 12, fontWeight: '700', color: '#FEF3C7' },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 9, borderRadius: 10,
  },
  tabBtnActive: { backgroundColor: '#fff' },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  tabBtnTextActive: { color: '#347385' },

  txItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
  },
  txIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  txInvoice: { fontSize: 13, fontWeight: '600', color: '#111827' },
  txMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  txMethod: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  txDate: { fontSize: 11, color: '#9CA3AF' },
  txTotal: { fontSize: 13, fontWeight: '700', color: '#347385' },
  voidBadge: {
    backgroundColor: '#FEE2E2', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  voidBadgeText: { fontSize: 9, fontWeight: '800', color: '#DC2626' },
});

const txDetailStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 14, color: '#9CA3AF' },
  scroll: { padding: 16, gap: 12 },
  refundBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#D97706', backgroundColor: '#FFFBEB',
  },
  refundBtnText: { fontSize: 14, fontWeight: '700', color: '#D97706' },
  voidBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#DC2626', backgroundColor: '#FEF2F2',
  },
  voidBtnText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    width: '100%', maxWidth: 420, gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalSub: { fontSize: 13, color: '#6B7280' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#111827',
    textAlignVertical: 'top', minHeight: 80, backgroundColor: '#F9FAFB',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  modalConfirmBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    backgroundColor: '#DC2626', alignItems: 'center',
  },
  modalConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

const addStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    width: '88%', maxWidth: 400, gap: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10,
  },
  errorText: { color: '#DC2626', fontSize: 12, flex: 1 },
  field: { gap: 5 },
  label: { fontSize: 12, fontWeight: '600', color: '#374151' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  input: { flex: 1, paddingVertical: 11, paddingRight: 12, fontSize: 14, color: '#111827' },
  saveBtn: {
    backgroundColor: '#56B2C1', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 5 },
      android: { elevation: 2 },
    }),
  },
  cardTablet: { flex: 1 },
  inactive: { opacity: 0.55 },
  avatar: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#347385' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '700', color: '#111827', flexShrink: 1 },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  inactiveBadge: {
    backgroundColor: '#F3F4F6', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },
  inactiveBadgeText: { fontSize: 9, color: '#9CA3AF', fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  pointsPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FFFBEB', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  pointsText: { fontSize: 11, fontWeight: '700', color: '#D97706' },
  spent: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#56B2C1', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  tabChip: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabChipActive: { borderBottomColor: '#56B2C1' },
  tabChipText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  tabChipTextActive: { color: '#56B2C1' },

  statsRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingTop: 14,
  },
  statPill: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, gap: 2,
  },
  statValue: { fontSize: 15, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', opacity: 0.8 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12,
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, paddingVertical: 10, paddingRight: 4, fontSize: 14, color: '#111827' },
  listCount: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', paddingHorizontal: 16, paddingTop: 8 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingBottom: 40 },
  cardWrap: { paddingHorizontal: 16, paddingTop: 10 },
  cardWrapTablet: { flex: 1 },
  columnWrapper: { paddingHorizontal: 16, paddingTop: 10, gap: 10 },

  emptyBox: { paddingTop: 60, alignItems: 'center', gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 4 },
  endText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingVertical: 16 },
});
