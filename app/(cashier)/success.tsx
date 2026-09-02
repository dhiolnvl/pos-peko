/**
 * POS Success Screen
 * Shown after a successful transaction.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCurrency } from '@/constants/config';
import { buildReceiptText, shareToWhatsApp } from '@/lib/shareReceipt';
import ReceiptShareModal from '@/components/ReceiptShareModal';
import type { ReceiptImageData } from '@/components/ReceiptImageView';
import { useAuthStore } from '@/store/authStore';

const AUTO_RETURN_SECONDS = 5;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONFETTI_COUNT = 36;
const COLORS = ['#56B2C1', '#22C55E', '#347385', '#F59E0B', '#EC4899', '#3B82F6', '#10B981', '#F97316'];

interface ConfettiPiece {
  x: Animated.Value;
  y: Animated.Value;
  rotate: Animated.Value;
  opacity: Animated.Value;
  color: string;
  size: number;
  isCircle: boolean;
  startX: number;
}

function useConfetti() {
  const pieces = useRef<ConfettiPiece[]>(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(0),
      color: COLORS[i % COLORS.length],
      size: (i % 4) + 6,
      isCircle: i % 2 === 0,
      startX: (SCREEN_WIDTH / CONFETTI_COUNT) * i,
    }))
  ).current;

  const start = useCallback(() => {
    pieces.forEach((p, i) => {
      p.x.stopAnimation();
      p.y.stopAnimation();
      p.rotate.stopAnimation();
      p.opacity.stopAnimation();
      p.x.setValue(0);
      p.y.setValue(0);
      p.rotate.setValue(0);
      p.opacity.setValue(1);

      const destX = (((i % 7) - 3) / 3) * SCREEN_WIDTH * 0.6;
      const destY = SCREEN_HEIGHT * 0.5 + (i % 5) * 60;
      const duration = 1000 + (i % 4) * 150;
      const delay = (i % 6) * 50;

      Animated.parallel([
        Animated.timing(p.x, { toValue: destX, duration, delay, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: destY, duration, delay, useNativeDriver: true }),
        Animated.timing(p.rotate, { toValue: (i % 2 === 0 ? 1 : -1) * 360, duration, delay, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(delay + duration * 0.55),
          Animated.timing(p.opacity, { toValue: 0, duration: duration * 0.45, useNativeDriver: true }),
        ]),
      ]).start();
    });
  }, []);

  return { pieces, start };
}

export default function SuccessScreen() {
  const insets = useSafeAreaInsets();
  const confetti = useConfetti();
  const currentBranch = useAuthStore((s) => s.currentBranch);
  const [showShareModal, setShowShareModal] = useState(false);
  const {
    invoice = '',
    total = '0',
    change = '0',
    method = 'cash',
    lowStock = '[]',
    pointsEarned = '0',
    memberName = '',
    isOffline = '0',
    splitPayment = '',
    deliveryFee = '0',
  } = useLocalSearchParams<{
    invoice: string;
    total: string;
    change: string;
    method: string;
    lowStock: string;
    pointsEarned: string;
    memberName: string;
    isOffline: string;
    splitPayment: string;
    deliveryFee: string;
  }>();

  const splitPaymentData: { cashAmount: number; secondMethod: string; secondAmount: number } | null = (() => {
    try { return splitPayment ? JSON.parse(splitPayment) : null; } catch { return null; }
  })();
  const deliveryFeeNum = parseFloat(deliveryFee) || 0;

  const offlineMode = isOffline === '1';

  const [countdown, setCountdown] = useState(AUTO_RETURN_SECONDS);

  const circleScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  const lowStockItems: { id: string; name: string; stock: number }[] = (() => {
    try { return JSON.parse(lowStock); } catch { return []; }
  })();

  const totalNum = parseFloat(total) || 0;
  const changeNum = parseFloat(change) || 0;
  const pointsNum = parseInt(pointsEarned) || 0;
  const methodLabel: Record<string, string> = {
    cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS', split: 'Campuran', delivery: 'Delivery',
  };

  useFocusEffect(
    useCallback(() => {
      // Reset semua nilai animasi
      circleScale.setValue(0);
      checkOpacity.setValue(0);
      contentOpacity.setValue(0);
      setCountdown(AUTO_RETURN_SECONDS);

      // Jalankan animasi
      Animated.sequence([
        Animated.timing(circleScale, { toValue: 1.12, duration: 150, useNativeDriver: true }),
        Animated.timing(circleScale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
        Animated.timing(circleScale, { toValue: 1, duration: 80, useNativeDriver: true }),
      ]).start();

      Animated.sequence([
        Animated.delay(120),
        Animated.timing(checkOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();

      Animated.sequence([
        Animated.delay(220),
        Animated.timing(contentOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();

      confetti.start();

      const interval = setInterval(() => {
        setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
      }, 1000);

      return () => clearInterval(interval);
    }, [])
  );

  useEffect(() => {
    if (countdown === 0) {
      router.replace('/(cashier)');
    }
  }, [countdown]);

  const receiptImageData: ReceiptImageData = {
    storeName: currentBranch?.name ?? 'Toko',
    storeAddress: currentBranch?.address,
    invoiceNumber: invoice,
    createdAt: new Date().toISOString(),
    items: [],
    subtotal: totalNum - deliveryFeeNum,
    discountAmount: 0,
    taxAmount: 0,
    deliveryFee: deliveryFeeNum,
    total: totalNum,
    paymentMethod: method,
    paymentAmount: totalNum,
    changeAmount: changeNum,
    memberName: memberName || null,
    pointsEarned: pointsNum > 0 ? pointsNum : null,
    splitPayment: splitPaymentData,
  };

  const handleShareWA = () => setShowShareModal(true);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      {/* Confetti */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {confetti.pieces.map((p, i) => {
          const rotate = p.rotate.interpolate({
            inputRange: [-360, 360],
            outputRange: ['-360deg', '360deg'],
          });
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: p.startX,
                top: 0,
                width: p.size,
                height: p.isCircle ? p.size : p.size * 1.5,
                borderRadius: p.isCircle ? p.size / 2 : 2,
                backgroundColor: p.color,
                opacity: p.opacity,
                transform: [{ translateX: p.x }, { translateY: p.y }, { rotate }],
              }}
            />
          );
        })}
      </View>
      {/* Checkmark animation */}
      <Animated.View style={[styles.circle, { transform: [{ scale: circleScale }] }]}>
        <Animated.View style={{ opacity: checkOpacity }}>
          <Ionicons name="checkmark" size={72} color="#fff" />
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.content, { opacity: contentOpacity }]}>
        <View style={styles.cardWrapper}>
          <Text style={styles.successTitle}>Transaksi Berhasil!</Text>
          <Text style={styles.invoiceText}>{invoice}</Text>

          {/* Banner offline — transaksi tersimpan di antrian */}
          {offlineMode && (
            <View style={styles.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={16} color="#92400E" />
              <Text style={styles.offlineBannerText}>
                Mode offline — transaksi tersimpan dan akan dikirim saat koneksi pulih
              </Text>
            </View>
          )}

          {/* Summary card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Bayar</Text>
              <Text style={styles.summaryValueBig}>{formatCurrency(totalNum)}</Text>
            </View>
            {splitPaymentData ? (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tunai</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(splitPaymentData.cashAmount)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{methodLabel[splitPaymentData.secondMethod] || splitPaymentData.secondMethod}</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(splitPaymentData.secondAmount)}</Text>
                </View>
                {changeNum > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Kembalian</Text>
                    <Text style={[styles.summaryValue, { color: '#22C55E', fontWeight: '700' }]}>{formatCurrency(changeNum)}</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Metode</Text>
                  <View style={styles.methodChip}>
                    <Text style={styles.methodChipText}>{methodLabel[method] || method}</Text>
                  </View>
                </View>
                {method === 'delivery' && deliveryFeeNum > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Ongkir</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(deliveryFeeNum)}</Text>
                  </View>
                )}
                {changeNum > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Kembalian</Text>
                    <Text style={[styles.summaryValue, { color: '#22C55E', fontWeight: '700' }]}>{formatCurrency(changeNum)}</Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* Poin member */}
          {pointsNum > 0 && !!memberName && (
            <View style={styles.pointsBanner}>
              <View style={styles.pointsIconWrap}>
                <Ionicons name="star" size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pointsTitle}>+{pointsNum} poin untuk {memberName}</Text>
                <Text style={styles.pointsSub}>Poin berhasil ditambahkan ke akun member</Text>
              </View>
            </View>
          )}

          {/* Low stock warnings */}
          {lowStockItems.length > 0 && (
            <View style={styles.warningBox}>
              <View style={styles.warningHeader}>
                <Ionicons name="warning" size={18} color="#D97706" />
                <Text style={styles.warningTitle}>Stok Menipis!</Text>
              </View>
              {lowStockItems.map((item) => (
                <Text key={item.id} style={styles.warningItem}>
                  • {item.name} — sisa {item.stock}
                </Text>
              ))}
            </View>
          )}

          <Text style={styles.countdownText}>
            Kembali otomatis dalam {countdown} detik…
          </Text>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionShare} onPress={handleShareWA}>
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
              <Text style={styles.actionShareText}>Kirim ke WA</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionNew}
              onPress={() => router.replace('/(cashier)')}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.actionNewText}>Transaksi Baru</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      <ReceiptShareModal
        visible={showShareModal}
        data={receiptImageData}
        onClose={() => setShowShareModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#F0FDF4',
    alignItems: 'center', paddingHorizontal: 24,
  },
  circle: {
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: '#22C55E',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#22C55E', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 20, elevation: 10,
  },
  content: { width: '100%', alignItems: 'center' },
  cardWrapper: { width: '100%', maxWidth: 450, alignItems: 'center', gap: 12 },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#14532D' },
  invoiceText: { fontSize: 14, color: '#16A34A', fontWeight: '600' },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    width: '100%', backgroundColor: '#FEF3C7',
    borderWidth: 1, borderColor: '#FCD34D',
    borderRadius: 10, padding: 12,
  },
  offlineBannerText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },

  summaryCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    padding: 16, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14, color: '#6B7280' },
  summaryValueBig: { fontSize: 22, fontWeight: '800', color: '#111827' },
  summaryValue: { fontSize: 15, color: '#374151' },
  methodChip: {
    backgroundColor: '#EEF8FA', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
  },
  methodChipText: { fontSize: 13, fontWeight: '600', color: '#347385' },

  warningBox: {
    width: '100%', backgroundColor: '#FFFBEB',
    borderRadius: 12, padding: 12, gap: 4,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  warningTitle: { fontSize: 14, fontWeight: '700', color: '#D97706' },
  warningItem: { fontSize: 13, color: '#92400E' },

  pointsBanner: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  pointsIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center',
  },
  pointsTitle: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  pointsSub: { fontSize: 12, color: '#B45309', marginTop: 2 },

  countdownText: { fontSize: 12, color: '#9CA3AF' },

  actions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 8 },
  actionShare: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#347385', backgroundColor: '#EEF8FA',
  },
  actionShareText: { fontSize: 14, fontWeight: '700', color: '#347385' },
  actionNew: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 12, backgroundColor: '#56B2C1',
  },
  actionNewText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
