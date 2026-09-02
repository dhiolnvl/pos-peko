import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet,
  ActivityIndicator, Alert,
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

export default function ReceiptScreen() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<StoreSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mmkv.getObject<StoreSettings>(KEY).then((saved) => {
      if (saved) setSettings(saved);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await mmkv.setObject(KEY, settings);
      await supabase.from('settings').upsert(
        { key: 'receipt_footer', value: settings.receipt_footer },
        { onConflict: 'key' }
      );
      Alert.alert('Tersimpan', 'Pengaturan struk berhasil disimpan.', [
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
      <OwnerPageHeader title="Struk" onBack={() => router.back()} onSave={save} saving={saving} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <TabletCenteredView>
          <View style={styles.section}>
            <Text style={styles.label}>Teks Footer Struk</Text>
            <TextInput
              style={styles.input}
              value={settings.receipt_footer}
              onChangeText={(v) => setSettings((prev) => ({ ...prev, receipt_footer: v }))}
              placeholder="Terima kasih atas kunjungan Anda!"
              placeholderTextColor="#9CA3AF"
              multiline
            />
            <Text style={styles.hint}>Teks ini akan muncul di bagian bawah struk transaksi.</Text>
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
    borderRadius: 14, padding: 16, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  hint: { fontSize: 11, color: '#9CA3AF' },
  input: {
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 11,
    borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14, color: '#111827',
    height: 96, textAlignVertical: 'top',
  },
});
