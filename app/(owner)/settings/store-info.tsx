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
  store_name: string;
  address: string;
  phone: string;
  tax_percentage: number;
  receipt_footer: string;
}

const DEFAULTS: StoreSettings = {
  store_name: 'QasioPeko', address: '', phone: '',
  tax_percentage: 11, receipt_footer: 'Terima kasih atas kunjungan Anda!',
};

export default function StoreInfoScreen() {
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

  const set = (key: keyof StoreSettings, value: string) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await mmkv.setObject(KEY, settings);
      for (const k of ['store_name', 'address', 'phone'] as const) {
        await supabase.from('settings').upsert({ key: k, value: settings[k] }, { onConflict: 'key' });
      }
      Alert.alert('Tersimpan', 'Informasi toko berhasil disimpan.', [
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
      <OwnerPageHeader title="Informasi Toko" onBack={() => router.back()} onSave={save} saving={saving} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <TabletCenteredView>
          <View style={styles.section}>
            <Field label="Nama Toko" value={settings.store_name}
              onChangeText={(v) => set('store_name', v)} placeholder="QasioPeko" />
            <Field label="Alamat" value={settings.address}
              onChangeText={(v) => set('address', v)} placeholder="Jl. Contoh No. 1" multiline />
            <Field label="No. Telepon" value={settings.phone}
              onChangeText={(v) => set('phone', v)} placeholder="08xxxxxxxxxx" keyboardType="phone-pad" />
          </View>
        </TabletCenteredView>
      </ScrollView>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, keyboardType = 'default' }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: 'default' | 'phone-pad' | 'numeric';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { height: 72, textAlignVertical: 'top' }]}
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor="#9CA3AF" multiline={multiline} keyboardType={keyboardType}
      />
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
  field: { gap: 5 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 11,
    borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14, color: '#111827',
  },
});
