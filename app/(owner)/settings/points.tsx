import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEFAULT = 10_000;
const PRESETS = [5000, 10000, 20000, 50000];

export default function PointsScreen() {
  const insets = useSafeAreaInsets();
  const [pointsPerRupiah, setPointsPerRupiah] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('settings').select('value').eq('key', 'points_per_rupiah').single()
      .then(({ data }) => {
        if (data?.value) {
          const parsed = parseInt(data.value, 10);
          if (!isNaN(parsed) && parsed > 0) setPointsPerRupiah(parsed);
        }
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from('settings').upsert(
        { key: 'points_per_rupiah', value: String(pointsPerRupiah) },
        { onConflict: 'key' }
      );
      Alert.alert('Tersimpan', 'Program poin berhasil disimpan.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' }}>
        <ActivityIndicator size="large" color="#56B2C1" />
      </View>
    );
  }

  const isCustom = !PRESETS.includes(pointsPerRupiah);

  return (
    <View style={styles.container}>
      <OwnerPageHeader title="Program Member & Poin" onBack={() => router.back()} onSave={save} saving={saving} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <TabletCenteredView>
          <View style={styles.section}>
            <Text style={styles.label}>Nominal per Poin</Text>
            <Text style={styles.hint}>Pelanggan mendapat 1 poin setiap belanja kelipatan nominal ini.</Text>

            <View style={styles.chipRow}>
              {PRESETS.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.chip, pointsPerRupiah === v && styles.chipActive]}
                  onPress={() => setPointsPerRupiah(v)}
                >
                  <Text style={[styles.chipText, pointsPerRupiah === v && styles.chipTextActive]}>
                    {`${v / 1000}rb`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.customWrap}>
              <Text style={styles.label}>Atau masukkan nominal sendiri</Text>
              <TextInput
                style={styles.input}
                value={isCustom ? String(pointsPerRupiah) : ''}
                onChangeText={(v) => {
                  const num = parseInt(v.replace(/\D/g, ''), 10);
                  if (!isNaN(num) && num > 0) setPointsPerRupiah(num);
                }}
                placeholder="cth: 15000"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.preview}>
              <Ionicons name="star" size={14} color="#D97706" />
              <Text style={styles.previewText}>
                Belanja Rp {(pointsPerRupiah * 5).toLocaleString('id-ID')} = 5 poin
              </Text>
            </View>
          </View>
        </TabletCenteredView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  section: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 14,
    borderRadius: 14, padding: 16, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  hint: { fontSize: 11, color: '#9CA3AF' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
  chipActive: { backgroundColor: '#56B2C1' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },
  customWrap: { gap: 6 },
  input: {
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 11,
    borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14, color: '#111827',
  },
  preview: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFBEB', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  previewText: { fontSize: 12, color: '#92400E', fontWeight: '600' },
});
