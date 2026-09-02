/**
 * Approval Opname
 * List stok opname berstatus 'submitted'
 * Tap → detail review item per item
 * Tombol Setujui → applyOpname()
 * Tombol Tolak → rejectOpname() kembali ke draft
 */

import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, TextInput, Alert, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import {
  getPendingOpnames, getOpnameDetail, fmtCurrency,
  type PendingOpname,
} from '@/lib/ownerQueries';
import { applyOpname, rejectOpname } from '@/lib/stockHelper';
import { useAuth } from '@/hooks/useAuth';
import { TabletCenteredView } from '@/components/TabletCenteredView';

// ─── Opname detail modal ──────────────────────────────────────────────────────

interface OpnameItem {
  id: string;
  product_id: string;
  product_name: string;
  system_stock: number;
  physical_stock: number;
  difference: number;
  notes: string | null;
}

interface OpnameHeader {
  id: string;
  branch_id: string;
  branch_name: string;
  status: string;
  created_by_name: string;
  notes: string | null;
  created_at: string;
}

function DetailModal({
  opname,
  userId,
  onClose,
  onApproved,
}: {
  opname: PendingOpname;
  userId: string;
  onClose: () => void;
  onApproved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [header, setHeader] = useState<OpnameHeader | null>(null);
  const [items, setItems] = useState<OpnameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { header: h, items: it } = await getOpnameDetail(opname.id);
      setHeader(h as OpnameHeader);
      setItems(it as OpnameItem[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [opname.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleApprove = () => {
    Alert.alert(
      'Setujui Opname',
      `Setujui opname dari ${opname.branch_name}? Stok akan diperbarui.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Setujui',
          onPress: async () => {
            setProcessing(true);
            try {
              const result = await applyOpname(opname.id, userId);
              Alert.alert(
                'Berhasil',
                `${result.itemsChanged} produk diperbarui, ${result.itemsSkipped} produk tidak berubah.`,
                [{ text: 'OK', onPress: onApproved }]
              );
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Gagal menyetujui opname');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) {
      Alert.alert('Perlu Catatan', 'Masukkan alasan penolakan');
      return;
    }
    setProcessing(true);
    try {
      await rejectOpname(opname.id, rejectNote.trim());
      Alert.alert('Ditolak', 'Opname dikembalikan ke status draft', [
        { text: 'OK', onPress: onApproved },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Gagal menolak opname');
    } finally {
      setProcessing(false);
    }
  };

  const changedItems = items.filter((it) => it.difference !== 0);
  const unchangedItems = items.filter((it) => it.difference === 0);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[dlStyles.container, { paddingTop: insets.top }]}>
        <View style={dlStyles.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={dlStyles.headerTitle} numberOfLines={1}>
              {opname.branch_name}
            </Text>
            <Text style={dlStyles.headerSub}>
              Oleh {opname.created_by_name}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#56B2C1" />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
              {/* Summary */}
              <View style={dlStyles.summaryRow}>
                {[
                  { label: 'Total Item', value: items.length.toString(), color: '#347385' },
                  { label: 'Ada Perubahan', value: changedItems.length.toString(), color: '#F59E0B' },
                  {
                    label: 'Total Selisih',
                    value: opname.total_difference.toString(),
                    color: opname.total_difference > 0 ? '#22C55E' : '#EF4444',
                  },
                ].map((m) => (
                  <View key={m.label} style={dlStyles.summaryCard}>
                    <Text style={[dlStyles.summaryValue, { color: m.color }]}>{m.value}</Text>
                    <Text style={dlStyles.summaryLabel}>{m.label}</Text>
                  </View>
                ))}
              </View>

              {/* Changed items */}
              {changedItems.length > 0 && (
                <>
                  <Text style={dlStyles.sectionTitle}>Produk Berubah ({changedItems.length})</Text>
                  {changedItems.map((item) => (
                    <View key={item.id} style={dlStyles.itemCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={dlStyles.productName}>{item.product_name}</Text>
                        {!!item.notes && (
                          <Text style={dlStyles.itemNotes}>{item.notes}</Text>
                        )}
                      </View>
                      <View style={dlStyles.stockInfo}>
                        <Text style={dlStyles.stockLabel}>Sistem</Text>
                        <Text style={dlStyles.stockNum}>{item.system_stock}</Text>
                      </View>
                      <Ionicons name="arrow-forward" size={14} color="#9CA3AF" />
                      <View style={dlStyles.stockInfo}>
                        <Text style={dlStyles.stockLabel}>Fisik</Text>
                        <Text style={dlStyles.stockNum}>{item.physical_stock}</Text>
                      </View>
                      <View style={[
                        dlStyles.diffBadge,
                        { backgroundColor: item.difference > 0 ? '#F0FDF4' : '#FEF2F2' },
                      ]}>
                        <Text style={[
                          dlStyles.diffText,
                          { color: item.difference > 0 ? '#16A34A' : '#DC2626' },
                        ]}>
                          {item.difference > 0 ? '+' : ''}{item.difference}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* Unchanged items (collapsed count) */}
              {unchangedItems.length > 0 && (
                <Text style={dlStyles.unchangedNote}>
                  {unchangedItems.length} produk lain tidak ada perubahan stok
                </Text>
              )}

              {/* Reject note input */}
              {showRejectInput && (
                <View style={dlStyles.rejectBox}>
                  <Text style={dlStyles.rejectLabel}>Alasan Penolakan</Text>
                  <TextInput
                    style={dlStyles.rejectInput}
                    value={rejectNote}
                    onChangeText={setRejectNote}
                    placeholder="Masukkan alasan penolakan..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    numberOfLines={3}
                  />
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <TouchableOpacity
                      style={dlStyles.cancelBtn}
                      onPress={() => { setShowRejectInput(false); setRejectNote(''); }}
                    >
                      <Text style={{ color: '#6B7280', fontWeight: '600' }}>Batal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={dlStyles.rejectConfirmBtn}
                      onPress={handleReject}
                      disabled={processing}
                    >
                      {processing ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Konfirmasi Tolak</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Action buttons */}
            {!showRejectInput && (
              <View style={[dlStyles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
                <TouchableOpacity
                  style={dlStyles.rejectBtn}
                  onPress={() => setShowRejectInput(true)}
                  disabled={processing}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
                  <Text style={dlStyles.rejectBtnText}>Tolak</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={dlStyles.approveBtn}
                  onPress={handleApprove}
                  disabled={processing}
                >
                  {processing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={dlStyles.approveBtnText}>Setujui</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ApprovalsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { user } = useAuth();

  const [opnames, setOpnames] = useState<PendingOpname[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingOpname | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPendingOpnames();
      setOpnames(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  return (
    <View style={styles.container}>
      <OwnerPageHeader
        title="Persetujuan Opname"
        subtitle={new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        badgeCount={opnames.length}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <TabletCenteredView>
          {loading ? (
            <View style={{ paddingTop: 48, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#56B2C1" />
            </View>
          ) : opnames.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={56} color="#22C55E" />
              <Text style={styles.emptyTitle}>Semua Beres</Text>
              <Text style={styles.emptySub}>Tidak ada opname yang menunggu persetujuan</Text>
            </View>
          ) : (
            <View style={[styles.list, isTablet && styles.listTablet]}>
              {opnames.map((op) => (
                <TouchableOpacity
                  key={op.id}
                  style={[styles.card, isTablet && styles.cardTablet]}
                  onPress={() => setSelected(op)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardTop}>
                    <View style={styles.branchTag}>
                      <Ionicons name="business-outline" size={12} color="#347385" />
                      <Text style={styles.branchTagText} numberOfLines={1}>{op.branch_name}</Text>
                    </View>
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Menunggu</Text>
                    </View>
                  </View>

                  <View style={styles.cardMeta}>
                    <Ionicons name="person-outline" size={13} color="#9CA3AF" />
                    <Text style={styles.metaText}>{op.created_by_name}</Text>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.metaText}>{formatDate(op.created_at)}</Text>
                  </View>

                  <View style={styles.cardStats}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{op.item_count}</Text>
                      <Text style={styles.statLabel}>Item</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Text style={[
                        styles.statValue,
                        { color: op.total_difference > 0 ? '#22C55E' : op.total_difference < 0 ? '#EF4444' : '#111827' },
                      ]}>
                        {op.total_difference > 0 ? '+' : ''}{op.total_difference}
                      </Text>
                      <Text style={styles.statLabel}>Total Selisih</Text>
                    </View>
                    {op.notes && (
                      <>
                        <View style={styles.statDivider} />
                        <View style={[styles.statItem, { flex: 2 }]}>
                          <Text style={styles.metaText} numberOfLines={2}>{op.notes}</Text>
                        </View>
                      </>
                    )}
                  </View>

                  <View style={styles.cardAction}>
                    <Text style={styles.reviewText}>Tap untuk review</Text>
                    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </TabletCenteredView>
      </ScrollView>

      {selected && user && (
        <DetailModal
          opname={selected}
          userId={user.id}
          onClose={() => setSelected(null)}
          onApproved={() => { setSelected(null); load(); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  list: { padding: 16, gap: 12 },
  listTablet: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  cardTablet: { width: '48%' },

  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  branchTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EEF8FA', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  branchTagText: { fontSize: 12, fontWeight: '700', color: '#347385' },
  pendingBadge: {
    backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: '700', color: '#D97706' },

  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#6B7280' },
  metaDot: { color: '#D1D5DB' },

  cardStats: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: '#E5E7EB' },

  cardAction: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  reviewText: { fontSize: 12, color: '#9CA3AF' },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
});

const dlStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },

  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  summaryValue: { fontSize: 18, fontWeight: '800' },
  summaryLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 2, textAlign: 'center' },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 4 },

  itemCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6,
  },
  productName: { fontSize: 13, fontWeight: '600', color: '#111827' },
  itemNotes: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  stockInfo: { alignItems: 'center', gap: 2 },
  stockLabel: { fontSize: 9, color: '#9CA3AF', textTransform: 'uppercase' },
  stockNum: { fontSize: 15, fontWeight: '700', color: '#374151' },
  diffBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: 40, alignItems: 'center' },
  diffText: { fontSize: 13, fontWeight: '700' },

  unchangedNote: {
    fontSize: 12, color: '#9CA3AF', textAlign: 'center',
    paddingVertical: 10, fontStyle: 'italic',
  },

  rejectBox: {
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, marginTop: 8,
  },
  rejectLabel: { fontSize: 13, fontWeight: '700', color: '#DC2626', marginBottom: 8 },
  rejectInput: {
    backgroundColor: '#fff', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: '#FECACA', fontSize: 14, color: '#111827',
    textAlignVertical: 'top',
  },
  cancelBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
  },
  rejectConfirmBtn: {
    flex: 2, backgroundColor: '#EF4444', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },

  actionBar: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB',
    position: 'absolute', bottom: 0, left: 0, right: 0,
  },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 12, borderWidth: 1.5, borderColor: '#EF4444',
    paddingVertical: 12,
  },
  rejectBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 15 },
  approveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 12, backgroundColor: '#22C55E', paddingVertical: 12,
  },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
