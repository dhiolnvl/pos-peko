/**
 * Manajemen Cabang
 * List semua cabang, tambah/edit, toggle aktif/nonaktif
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, Alert, Switch, useWindowDimensions,
  Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { useBackFromDashboard } from '@/hooks/useBackFromDashboard';
import { supabase, getAllBranchesOwner } from '@/lib/supabase';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import type { Branch } from '@/types';

// ─── Branch form modal ────────────────────────────────────────────────────────

interface BranchFormProps {
  branch: Partial<Branch> | null;
  onClose: () => void;
  onSaved: () => void;
}

function BranchForm({ branch, onClose, onSaved }: BranchFormProps) {
  const insets = useSafeAreaInsets();
  const isEdit = !!branch?.id;

  const [name, setName] = useState(branch?.name ?? '');
  const [address, setAddress] = useState(branch?.address ?? '');
  const [phone, setPhone] = useState(branch?.phone ?? '');
  const [seedProducts, setSeedProducts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) { setError('Nama cabang wajib diisi'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (isEdit) {
        const { error: e } = await supabase.from('branches').update(payload).eq('id', branch!.id!);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase
          .from('branches')
          .insert({ ...payload, is_active: true, created_at: new Date().toISOString() })
          .select('id')
          .single();
        if (e) throw e;

        if (seedProducts && data?.id) {
          await supabase.rpc('init_branch_products', { p_branch_id: data.id });
        }
      }
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <View style={[fmStyles.container, { paddingTop: insets.top }]}>
        <View style={fmStyles.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={fmStyles.title}>{isEdit ? 'Edit Cabang' : 'Tambah Cabang'}</Text>
          <TouchableOpacity onPress={save} disabled={saving} style={fmStyles.saveBtn}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={fmStyles.saveBtnText}>Simpan</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          {!!error && (
            <View style={fmStyles.errorBox}>
              <Text style={{ color: '#DC2626', fontSize: 13 }}>{error}</Text>
            </View>
          )}

          <View style={fmStyles.field}>
            <Text style={fmStyles.label}>Nama Cabang *</Text>
            <TextInput
              style={fmStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="Contoh: Cabang Utama"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={fmStyles.field}>
            <Text style={fmStyles.label}>Alamat</Text>
            <TextInput
              style={[fmStyles.input, { height: 80, textAlignVertical: 'top' }]}
              value={address}
              onChangeText={setAddress}
              placeholder="Alamat lengkap cabang"
              placeholderTextColor="#9CA3AF"
              multiline
            />
          </View>

          <View style={fmStyles.field}>
            <Text style={fmStyles.label}>No. Telepon</Text>
            <TextInput
              style={fmStyles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="08xxxxxxxxxx"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
            />
          </View>

          {!isEdit && (
            <TouchableOpacity
              style={fmStyles.checkRow}
              onPress={() => setSeedProducts((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={[fmStyles.checkbox, seedProducts && fmStyles.checkboxChecked]}>
                {seedProducts && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fmStyles.checkLabel}>Daftarkan semua produk ke cabang ini</Text>
                <Text style={fmStyles.checkSub}>Semua produk akan otomatis tersedia dengan stok 0</Text>
              </View>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BranchesManagement() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const goBack = useBackFromDashboard();
  const isTablet = width >= 768;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [formBranch, setFormBranch] = useState<Partial<Branch> | null | false>(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllBranchesOwner();
      setBranches(data as Branch[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (branch: Branch) => {
    setToggling(branch.id);
    try {
      const { error } = await supabase
        .from('branches')
        .update({ is_active: !branch.is_active, updated_at: new Date().toISOString() })
        .eq('id', branch.id);
      if (error) throw error;
      setBranches((prev) =>
        prev.map((b) => b.id === branch.id ? { ...b, is_active: !b.is_active } : b)
      );
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Gagal mengubah status');
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = (branch: Branch) => {
    Alert.alert(
      'Nonaktifkan Cabang',
      `Nonaktifkan "${branch.name}"? Cabang tidak akan bisa login.`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Nonaktifkan', style: 'destructive', onPress: () => toggleActive(branch) },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <OwnerPageHeader
        title="Manajemen Cabang"
        onBack={goBack}
        onAdd={() => setFormBranch({})}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <TabletCenteredView>
          {loading ? (
            <View style={{ paddingTop: 48, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#56B2C1" />
            </View>
          ) : (
            <View style={[styles.list, isTablet && styles.listTablet]}>
              {branches.length === 0 && (
                <Text style={styles.empty}>Belum ada cabang</Text>
              )}
              {branches.map((branch) => (
                <View key={branch.id} style={[styles.card, isTablet && styles.cardTablet]}>
                  <View style={[styles.statusDot, { backgroundColor: branch.is_active ? '#22C55E' : '#D1D5DB' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.branchName}>{branch.name}</Text>
                    {!!branch.address && (
                      <Text style={styles.branchSub} numberOfLines={1}>{branch.address}</Text>
                    )}
                    {!!branch.phone && (
                      <Text style={styles.branchSub}>{branch.phone}</Text>
                    )}
                    <Text style={[styles.statusText, { color: branch.is_active ? '#22C55E' : '#9CA3AF' }]}>
                      {branch.is_active ? 'Aktif' : 'Nonaktif'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => setFormBranch(branch)}
                    >
                      <Ionicons name="pencil-outline" size={17} color="#347385" />
                    </TouchableOpacity>
                    {toggling === branch.id ? (
                      <ActivityIndicator size="small" color="#9CA3AF" />
                    ) : (
                      <Switch
                        value={branch.is_active}
                        onValueChange={() =>
                          branch.is_active ? handleDelete(branch) : toggleActive(branch)
                        }
                        trackColor={{ false: '#E5E7EB', true: '#56B2C1' }}
                        thumbColor="#fff"
                      />
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </TabletCenteredView>
      </ScrollView>

      {formBranch !== false && (
        <BranchForm
          branch={formBranch}
          onClose={() => setFormBranch(false)}
          onSaved={() => { setFormBranch(false); load(); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  list: { padding: 16, gap: 10 },
  listTablet: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardTablet: { width: '48%' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  branchName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  branchSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statusText: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  editBtn: {
    width: 34, height: 34, borderRadius: 8, backgroundColor: '#EEF8FA',
    justifyContent: 'center', alignItems: 'center',
  },
  empty: { color: '#9CA3AF', textAlign: 'center', paddingVertical: 40 },
});

const fmStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  saveBtn: {
    backgroundColor: '#56B2C1', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 10, minWidth: 72, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151' },
  input: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14, color: '#111827',
  },
  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#F0FAFA', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#C8E9EE',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#9CA3AF',
    justifyContent: 'center', alignItems: 'center', marginTop: 1, flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: '#347385', borderColor: '#347385' },
  checkLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  checkSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
});
