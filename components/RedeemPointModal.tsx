import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { type Member } from '@/lib/memberQueries';
import { type RewardItem, getActiveRewardItems, redeemPoints } from '@/lib/rewardQueries';
import { printRedeemReceipt } from '@/lib/printerHelper';

interface Props {
  visible: boolean;
  member: Member;
  transactionId?: string;
  onRedeemed: (updatedPoints: number) => void;
  onClose: () => void;
}

export default function RedeemPointModal({ visible, member, transactionId, onRedeemed, onClose }: Props) {
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [currentPoints, setCurrentPoints] = useState(member.points);

  const currentBranch = useAuthStore((s) => s.currentBranch);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!visible) return;
    setCurrentPoints(member.points);
    setLoading(true);
    getActiveRewardItems()
      .then(setRewards)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, member]);

  const handleRedeem = (item: RewardItem) => {
    if (currentPoints < item.points_required) {
      Alert.alert('Poin Tidak Cukup', 'Poin member tidak cukup untuk reward ini.');
      return;
    }
    const productList = (item.products ?? [])
      .map((p) => `• ${p.product_name} x${p.qty}`)
      .join('\n');
    Alert.alert(
      'Tukar Poin',
      `Tukar ${item.points_required.toLocaleString('id-ID')} poin untuk:\n${productList}`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Tukar',
          onPress: async () => {
            setRedeeming(item.id);
            try {
              await redeemPoints({
                memberId: member.id,
                rewardItemId: item.id,
                rewardName: item.name,
                pointsUsed: item.points_required,
                transactionId,
              });
              const newPoints = currentPoints - item.points_required;
              setCurrentPoints(newPoints);
              onRedeemed(newPoints);

              printRedeemReceipt({
                storeName: currentBranch?.name ?? 'Toko',
                storeAddress: currentBranch?.address,
                storePhone: currentBranch?.phone,
                cashierName: user?.name ?? 'Kasir',
                memberName: member.name,
                remainingPoints: newPoints,
                pointsUsed: item.points_required,
                rewardName: item.name,
                products: (item.products ?? []).map((p) => ({
                  product_name: p.product_name,
                  qty: p.qty,
                })),
                createdAt: new Date().toISOString(),
              }).catch(() => {});
            } catch (e: any) {
              Alert.alert('Gagal', e.message);
            } finally {
              setRedeeming(null);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.box} activeOpacity={1}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Tukar Poin</Text>
              <Text style={styles.memberName}>{member.name}</Text>
            </View>
            <View style={styles.pointsBadge}>
              <Ionicons name="star" size={14} color="#D97706" />
              <Text style={styles.pointsValue}>{currentPoints.toLocaleString('id-ID')}</Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#56B2C1" style={{ paddingVertical: 32 }} />
          ) : rewards.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="gift-outline" size={40} color="#D1D5DB" />
              <Text style={styles.emptyText}>Belum ada reward yang tersedia</Text>
            </View>
          ) : (
            <FlatList
              data={rewards}
              keyExtractor={(i) => i.id}
              style={{ maxHeight: 380 }}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => {
                const canRedeem = currentPoints >= item.points_required;
                return (
                  <View style={[styles.rewardCard, !canRedeem && styles.rewardCardDisabled]}>
                    {/* Header reward */}
                    <View style={styles.rewardHeader}>
                      <View style={styles.rewardIcon}>
                        <Ionicons name="gift-outline" size={18} color={canRedeem ? '#347385' : '#9CA3AF'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rewardName, !canRedeem && styles.textDisabled]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <View style={styles.rewardPointsRow}>
                          <Ionicons name="star" size={11} color={canRedeem ? '#D97706' : '#9CA3AF'} />
                          <Text style={[styles.rewardPointsText, !canRedeem && styles.textDisabled]}>
                            {item.points_required.toLocaleString('id-ID')} poin
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.redeemBtn, !canRedeem && styles.redeemBtnDisabled]}
                        onPress={() => handleRedeem(item)}
                        disabled={!canRedeem || redeeming === item.id}
                      >
                        {redeeming === item.id
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.redeemBtnText}>Tukar</Text>
                        }
                      </TouchableOpacity>
                    </View>

                    {/* Daftar produk yang didapat */}
                    {(item.products ?? []).length > 0 && (
                      <View style={styles.productList}>
                        {(item.products ?? []).map((p, idx) => (
                          <View key={idx} style={styles.productItem}>
                            <Ionicons name="checkmark-circle-outline" size={12} color={canRedeem ? '#347385' : '#9CA3AF'} />
                            <Text style={[styles.productItemText, !canRedeem && styles.textDisabled]} numberOfLines={1}>
                              {p.product_name} <Text style={styles.productItemQty}>x{p.qty}</Text>
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Tutup</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  box: { backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '90%', maxWidth: 420, gap: 14 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 17, fontWeight: '800', color: '#111827' },
  memberName: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  pointsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },
  pointsValue: { fontSize: 15, fontWeight: '800', color: '#D97706' },

  empty: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyText: { fontSize: 13, color: '#9CA3AF' },

  rewardCard: {
    borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#fff', padding: 12, gap: 8,
  },
  rewardCardDisabled: { backgroundColor: '#F9FAFB', borderColor: '#F3F4F6' },

  rewardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rewardIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  rewardName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  rewardPointsRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  rewardPointsText: { fontSize: 12, fontWeight: '700', color: '#D97706' },
  textDisabled: { color: '#9CA3AF' },

  redeemBtn: {
    backgroundColor: '#347385', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 8, minWidth: 56, alignItems: 'center',
  },
  redeemBtnDisabled: { backgroundColor: '#E5E7EB' },
  redeemBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  productList: { gap: 4, paddingLeft: 4, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 6 },
  productItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  productItemText: { fontSize: 12, color: '#374151', flex: 1 },
  productItemQty: { fontWeight: '700', color: '#347385' },

  closeBtn: {
    paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center',
  },
  closeBtnText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
});
