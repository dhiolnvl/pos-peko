import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackofficeHeader } from '@/components/BackofficeHeader';

const ITEMS = [
  { title: 'Laporan Penjualan', description: 'Ringkasan penjualan, metode bayar, dan transaksi harian', icon: 'cash-outline', color: '#22C55E', bg: '#F0FDF4', route: '/(backoffice)/reports/sales' },
  { title: 'Laporan Per Produk', description: 'Qty terjual, rata-rata harga, dan total pendapatan per produk', icon: 'pricetag-outline', color: '#0891B2', bg: '#ECFEFF', route: '/(backoffice)/reports/per-product' },
  { title: 'Laporan Stok', description: 'Stok produk cabang dengan highlight stok kritis', icon: 'cube-outline', color: '#F59E0B', bg: '#FFFBEB', route: '/(backoffice)/reports/stock' },
  { title: 'Laporan Shift', description: 'Ringkasan shift kasir dan total penjualan per shift', icon: 'time-outline', color: '#347385', bg: '#EEF8FA', route: '/(backoffice)/reports/shifts' },
  { title: 'Pengeluaran', description: 'Catatan pengeluaran operasional cabang', icon: 'receipt-outline', color: '#EF4444', bg: '#FEF2F2', route: '/(backoffice)/reports/expenses' },
];

export default function ReportsIndex() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <BackofficeHeader title="Laporan" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Text style={styles.sectionLabel}>Pilih Jenis Laporan</Text>
        <View style={[styles.grid, isTablet && styles.gridTablet]}>
          {ITEMS.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={[styles.card, isTablet && styles.cardTablet]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.8}
            >
              <View style={[styles.iconWrap, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon as any} size={26} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDesc}>{item.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#9CA3AF',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  grid: { paddingHorizontal: 16, gap: 10 },
  gridTablet: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardTablet: { width: '48%' },
  iconWrap: { width: 50, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 3 },
  cardDesc: { fontSize: 12, color: '#6B7280', lineHeight: 16 },
});
