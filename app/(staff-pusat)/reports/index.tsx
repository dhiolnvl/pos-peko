/**
 * Laporan Staff Pusat - Pilih jenis laporan
 */

import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { OwnerPageHeader } from '@/components/OwnerHeader';

interface ReportItem {
  title: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
  route: string;
}

const REPORT_ITEMS: ReportItem[] = [
  {
    title: 'Laporan Penjualan',
    description: 'Total penjualan, HPP, dan laba kotor semua cabang',
    icon: 'cash-outline',
    color: '#347385',
    bg: '#EEF8FA',
    route: '/(staff-pusat)/reports/sales',
  },
  {
    title: 'Laporan Stok',
    description: 'Stok produk per cabang dengan highlight kritis dan rendah',
    icon: 'cube-outline',
    color: '#F59E0B',
    bg: '#FFFBEB',
    route: '/(staff-pusat)/reports/stock',
  },
  {
    title: 'Laporan Distribusi',
    description: 'Riwayat pengiriman stok ke cabang dari gudang pusat',
    icon: 'swap-horizontal-outline',
    color: '#22C55E',
    bg: '#F0FDF4',
    route: '/(staff-pusat)/reports/transfers',
  },
  {
    title: 'Laporan Presensi',
    description: 'Jam masuk/keluar karyawan, durasi kerja, dan rekap per periode',
    icon: 'finger-print-outline',
    color: '#7C3AED',
    bg: '#F5F3FF',
    route: '/(staff-pusat)/reports/attendance',
  },
  {
    title: 'Laporan Per Produk',
    description: 'Qty terjual, rata-rata harga, dan total pendapatan per produk',
    icon: 'pricetag-outline',
    color: '#0891B2',
    bg: '#ECFEFF',
    route: '/(staff-pusat)/reports/per-product',
  },
];

function todayLabel() {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function StaffPusatReportsIndex() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  return (
    <View style={styles.container}>
      <OwnerPageHeader title="Laporan" subtitle={todayLabel()} />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <TabletCenteredView>
          <Text style={styles.sectionLabel}>Pilih Jenis Laporan</Text>
          <View style={[styles.grid, isTablet && styles.gridTablet]}>
            {REPORT_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.title}
                style={[styles.card, isTablet && styles.cardTablet]}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.8}
              >
                <View style={[styles.iconWrap, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.icon as any} size={28} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardDesc}>{item.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
              </TouchableOpacity>
            ))}
          </View>
        </TabletCenteredView>
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

  iconWrap: {
    width: 52, height: 52, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 3 },
  cardDesc: { fontSize: 12, color: '#6B7280', lineHeight: 16 },
});
