import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { router } from 'expo-router';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { mmkv } from '@/lib/mmkvStorage';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const KEY = 'settings.store';

interface StoreSettings {
  store_name: string; address: string; phone: string;
  tax_percentage: number; receipt_footer: string;
}

const DEFAULTS: StoreSettings = {
  store_name: 'QasioPeko', address: '', phone: '',
  tax_percentage: 11, receipt_footer: 'Terima kasih atas kunjungan Anda!',
};

export default function TaxScreen() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<StoreSettings>(DEFAULTS);
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mmkv.getObject<StoreSettings>(KEY).then((saved) => {
      if (saved) {
        setSettings(saved);
        setTaxEnabled(saved.tax_percentage > 0);
      }
      setLoading(false);
    });
  }, []);

  const handleTaxToggle = (val: boolean) => {
    setTaxEnabled(val);
    setSettings((prev) => ({ ...prev, tax_percentage: val ? 11 : 0 }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await mmkv.setObject(KEY, settings);
      await supabase.from('settings').upsert(
        { key: 'tax_percentage', value: String(settings.tax_percentage) },
        { onConflict: 'key' }
      );
      Alert.alert('Tersimpan', 'Pengaturan pajak berhasil disimpan.', [
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

  return (
    <View style={styles.container}>
      <OwnerPageHeader title="Pajak (PPN)" onBack={() => router.back()} onSave={save} saving={saving} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <TabletCenteredView>
          <View style={styles.section}>
            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.label}>Aktifkan PPN</Text>
                <Text style={styles.hint}>{taxEnabled ? `PPN ${settings.tax_percentage}%` : 'Tanpa pajak'}</Text>
              </View>
              <Switch
                value={taxEnabled}
                onValueChange={handleTaxToggle}
                trackColor={{ false: '#E5E7EB', true: '#56B2C1' }}
                thumbColor="#fff"
              />
            </View>

            {taxEnabled && (
              <>
                <Text style={styles.label}>Persentase Pajak</Text>
                <View style={styles.chipRow}>
                  {[0, 5, 10, 11, 12].map((pct) => (
                    <TouchableOpacity
                      key={pct}
                      style={[styles.chip, settings.tax_percentage === pct && styles.chipActive]}
                      onPress={() => setSettings((prev) => ({ ...prev, tax_percentage: pct }))}
                    >
                      <Text style={[styles.chipText, settings.tax_percentage === pct && styles.chipTextActive]}>
                        {pct}%
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
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
    borderRadius: 14, padding: 16, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
  chipActive: { backgroundColor: '#56B2C1' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },
});
