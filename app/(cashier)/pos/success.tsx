/**
 * POS Success Screen
 * Shown after a successful transaction.
 * - Animated checkmark
 * - Invoice info + total
 * - Low stock warnings
 * - Actions: Print, Share, New Transaction
 * - Auto-returns to POS after 5 seconds
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Share, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCurrency } from '@/constants/config';

const AUTO_RETURN_SECONDS = 5;

export default function PosSuccessScreen() {
  const insets = useSafeAreaInsets();
  const {
    invoice = '',
    total = '0',
    change = '0',
    method = 'cash',
    lowStock = '[]',
  } = useLocalSearchParams<{
    invoice: string;
    total: string;
    change: string;
    method: string;
    lowStock: string;
  }>();

  const [countdown, setCountdown] = useState(AUTO_RETURN_SECONDS);

  // Animations
  const circleScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  const lowStockItems: { id: string; name: string; stock: number }[] = (() => {
    try { return JSON.parse(lowStock); } catch { return []; }
  })();

  const totalNum = parseFloat(total) || 0;
  const changeNum = parseFloat(change) || 0;

  const methodLabel: Record<string, string> = {
    cash: 'Tunai',
    transfer: 'Transfer',
    qris: 'QRIS',
  };

  useEffect(() => {
    // Entry animation sequence
    Animated.sequence([
      Animated.spring(circleScale, {
        toValue: 1, useNativeDriver: true,
        damping: 10, stiffness: 120,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1, duration: 200, useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1, duration: 300, useNativeDriver: true,
      }),
    ]).start();

    // Countdown timer
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          router.replace('/(cashier)/pos');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleNewTransaction = () => {
    router.replace('/(cashier)/pos');
  };

  const handleShare = async () => {
    try {
      const lines = [
        '===========================',
        '        STRUK PEMBAYARAN',
        '===========================',
        `Invoice : ${invoice}`,
        `Total   : ${formatCurrency(totalNum)}`,
        `Metode  : ${methodLabel[method] || method}`,
        changeNum > 0 ? `Kembalian: ${formatCurrency(changeNum)}` : '',
        '===========================',
        'Terima kasih telah berbelanja!',
      ].filter(Boolean);

      await Share.share({ message: lines.join('\n') });
    } catch {}
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>

      {/* ── Checkmark animation ── */}
      <Animated.View style={[styles.circle, { transform: [{ scale: circleScale }] }]}>
        <Animated.View style={{ opacity: checkOpacity }}>
          <Ionicons name="checkmark" size={72} color="#fff" />
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.content, { opacity: contentOpacity }]}>
        <Text style={styles.successTitle}>Transaksi Berhasil!</Text>
        <Text style={styles.invoiceText}>{invoice}</Text>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Bayar</Text>
            <Text style={styles.summaryValueBig}>{formatCurrency(totalNum)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Metode</Text>
            <View style={styles.methodChip}>
              <Text style={styles.methodChipText}>{methodLabel[method] || method}</Text>
            </View>
          </View>
          {changeNum > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Kembalian</Text>
              <Text style={[styles.summaryValue, { color: '#22C55E', fontWeight: '700' }]}>
                {formatCurrency(changeNum)}
              </Text>
            </View>
          )}
        </View>

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

        {/* Countdown */}
        <Text style={styles.countdownText}>
          Kembali otomatis dalam {countdown} detik…
        </Text>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionShare} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={18} color="#347385" />
            <Text style={styles.actionShareText}>Bagikan Struk</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionNew} onPress={handleNewTransaction}>
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={styles.actionNewText}>Transaksi Baru</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
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
  content: { width: '100%', alignItems: 'center', gap: 12 },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#14532D' },
  invoiceText: { fontSize: 14, color: '#16A34A', fontWeight: '600' },

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
    backgroundColor: '#EEF8FA', paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 20,
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
