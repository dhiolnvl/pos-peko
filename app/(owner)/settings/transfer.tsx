import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { transferService } from '@/lib/transferService';

export default function TransferSettingScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasActive, setHasActive] = useState(false);

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await transferService.getActive();
      if (data) {
        setHasActive(true);
        setBankName(data.bank_name);
        setAccountNumber(data.account_number);
        setAccountName(data.account_name);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!bankName.trim()) return Alert.alert('Perlu diisi', 'Nama bank tidak boleh kosong');
    if (!accountNumber.trim()) return Alert.alert('Perlu diisi', 'Nomor rekening tidak boleh kosong');
    if (!accountName.trim()) return Alert.alert('Perlu diisi', 'Nama pemilik rekening tidak boleh kosong');

    setSaving(true);
    try {
      await transferService.save({
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        account_name: accountName.trim(),
      });
      setHasActive(true);
      Alert.alert('Berhasil', 'Info transfer tersimpan');
    } catch (e: any) {
      Alert.alert('Gagal', e.message ?? 'Terjadi kesalahan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Hapus Info Transfer', 'Yakin ingin menghapus info transfer ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await transferService.delete();
            setHasActive(false);
            setBankName('');
            setAccountNumber('');
            setAccountName('');
          } catch (e: any) {
            Alert.alert('Gagal', e.message ?? 'Terjadi kesalahan');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Info Transfer</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#347385" />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 32 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <TabletCenteredView>
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={18} color="#347385" />
                <Text style={styles.infoText}>
                  Info rekening ini akan ditampilkan kepada kasir saat pelanggan memilih metode pembayaran Transfer.
                </Text>
              </View>

              {hasActive && (
                <View style={styles.activeCard}>
                  <View style={styles.activeCardHeader}>
                    <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                    <Text style={styles.activeCardTitle}>Info Transfer Aktif</Text>
                  </View>
                  <View style={styles.activeRow}>
                    <Text style={styles.activeLabel}>Bank</Text>
                    <Text style={styles.activeValue}>{bankName}</Text>
                  </View>
                  <View style={styles.activeRow}>
                    <Text style={styles.activeLabel}>No. Rekening</Text>
                    <Text style={styles.activeValue}>{accountNumber}</Text>
                  </View>
                  <View style={styles.activeRow}>
                    <Text style={styles.activeLabel}>Atas Nama</Text>
                    <Text style={styles.activeValue}>{accountName}</Text>
                  </View>
                </View>
              )}

              <View style={styles.form}>
                <Text style={styles.formTitle}>{hasActive ? 'Ubah Info Transfer' : 'Tambah Info Transfer'}</Text>

                <View style={styles.field}>
                  <Text style={styles.label}>Nama Bank</Text>
                  <TextInput
                    style={styles.input}
                    value={bankName}
                    onChangeText={setBankName}
                    placeholder="Contoh: BCA, Mandiri, BRI, BSI"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="characters"
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Nomor Rekening</Text>
                  <TextInput
                    style={styles.input}
                    value={accountNumber}
                    onChangeText={setAccountNumber}
                    placeholder="Contoh: 1234567890"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Atas Nama</Text>
                  <TextInput
                    style={styles.input}
                    value={accountName}
                    onChangeText={setAccountName}
                    placeholder="Nama pemilik rekening"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={18} color="#fff" />
                      <Text style={styles.saveBtnText}>Simpan</Text>
                    </>
                  )}
                </TouchableOpacity>

                {hasActive && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={handleDelete}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    <Text style={styles.deleteBtnText}>Hapus Info Transfer</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TabletCenteredView>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#EEF8FA', borderRadius: 12, padding: 14,
    margin: 16, borderWidth: 1, borderColor: '#A9DFE9',
  },
  infoText: { flex: 1, fontSize: 13, color: '#347385', lineHeight: 19 },

  activeCard: {
    backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 16, marginBottom: 8,
    padding: 16, borderWidth: 1, borderColor: '#BBF7D0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  activeCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12,
  },
  activeCardTitle: { fontSize: 14, fontWeight: '700', color: '#16A34A' },
  activeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F0FDF4',
  },
  activeLabel: { fontSize: 13, color: '#6B7280' },
  activeValue: { fontSize: 13, fontWeight: '700', color: '#111827', textAlign: 'right', flex: 1, marginLeft: 16 },

  form: {
    backgroundColor: '#fff', borderRadius: 14, margin: 16,
    padding: 16, borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  formTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 16 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#111827', backgroundColor: '#FAFAFA',
  },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#347385', borderRadius: 12, paddingVertical: 13, marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, paddingVertical: 12, marginTop: 10,
    backgroundColor: '#FEF2F2',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: '#DC2626' },
});
