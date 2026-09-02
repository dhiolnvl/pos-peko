import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { attendanceService, type Employee } from '@/lib/attendanceService';
import { supabase } from '@/lib/supabase';

interface Branch { id: string; name: string; }

export default function EmployeesScreen() {
  const insets = useSafeAreaInsets();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);

  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [branchId, setBranchId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [emps, { data: brs }] = await Promise.all([
        attendanceService.getAllEmployees(),
        supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
      ]);
      setEmployees(emps);
      setBranches(brs ?? []);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const openAdd = () => {
    setEditTarget(null);
    setName(''); setPosition(''); setPin(''); setPinConfirm(''); setBranchId(null);
    setShowModal(true);
  };

  const openEdit = (emp: Employee) => {
    setEditTarget(emp);
    setName(emp.name);
    setPosition(emp.position ?? '');
    setPin(emp.pin);
    setPinConfirm(emp.pin);
    setBranchId(emp.branch_id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Perlu diisi', 'Nama karyawan tidak boleh kosong');
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return Alert.alert('PIN tidak valid', 'PIN harus 4 digit angka');
    if (pin !== pinConfirm) return Alert.alert('PIN tidak cocok', 'Konfirmasi PIN tidak sesuai');

    setSaving(true);
    try {
      if (editTarget) {
        await attendanceService.updateEmployee(editTarget.id, {
          name: name.trim(), branch_id: branchId, pin, position: position.trim() || null,
          is_active: editTarget.is_active,
        });
      } else {
        await attendanceService.createEmployee({
          name: name.trim(), branch_id: branchId, pin, position: position.trim() || null,
        });
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      Alert.alert('Gagal', e.message ?? 'Terjadi kesalahan');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = (emp: Employee) => {
    const action = emp.is_active ? 'nonaktifkan' : 'aktifkan';
    Alert.alert(`${emp.is_active ? 'Nonaktifkan' : 'Aktifkan'} Karyawan`, `Yakin ingin ${action} ${emp.name}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: emp.is_active ? 'Nonaktifkan' : 'Aktifkan',
        style: emp.is_active ? 'destructive' : 'default',
        onPress: async () => {
          try {
            await attendanceService.updateEmployee(emp.id, {
              name: emp.name, branch_id: emp.branch_id, pin: emp.pin,
              position: emp.position, is_active: !emp.is_active,
            });
            load();
          } catch (e: any) {
            Alert.alert('Gagal', e.message);
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
        <Text style={styles.headerTitle}>Data Karyawan</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#347385" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <TabletCenteredView>
            {employees.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={52} color="#D1D5DB" />
                <Text style={styles.emptyText}>Belum ada karyawan</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={openAdd}>
                  <Text style={styles.emptyBtnText}>Tambah Karyawan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.list}>
                {employees.map((emp, i) => (
                  <View key={emp.id} style={[styles.card, !emp.is_active && styles.cardInactive, i === employees.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[styles.avatar, !emp.is_active && { backgroundColor: '#F3F4F6' }]}>
                      <Text style={[styles.avatarText, !emp.is_active && { color: '#9CA3AF' }]}>
                        {emp.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.cardInfo}>
                      <View style={styles.cardNameRow}>
                        <Text style={[styles.cardName, !emp.is_active && { color: '#9CA3AF' }]}>{emp.name}</Text>
                        {!emp.is_active && (
                          <View style={styles.inactiveBadge}><Text style={styles.inactiveBadgeText}>Nonaktif</Text></View>
                        )}
                      </View>
                      {emp.position && <Text style={styles.cardPosition}>{emp.position}</Text>}
                      {emp.branch && <Text style={styles.cardBranch}><Ionicons name="business-outline" size={11} /> {(emp.branch as any).name}</Text>}
                      <View style={styles.pinRow}>
                        <Ionicons name="keypad-outline" size={12} color="#9CA3AF" />
                        <Text style={styles.pinText}>PIN: ••••</Text>
                      </View>
                    </View>
                    <View style={styles.cardActions}>
                      <TouchableOpacity onPress={() => openEdit(emp)} style={styles.editBtn}>
                        <Ionicons name="create-outline" size={18} color="#347385" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleToggleActive(emp)} style={styles.toggleBtn}>
                        <Ionicons name={emp.is_active ? 'eye-off-outline' : 'eye-outline'} size={18} color={emp.is_active ? '#EF4444' : '#22C55E'} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </TabletCenteredView>
        </ScrollView>
      )}

      {/* Modal tambah/edit */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editTarget ? 'Edit Karyawan' : 'Tambah Karyawan'}</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.field}>
                  <Text style={styles.label}>Nama Karyawan</Text>
                  <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nama lengkap" placeholderTextColor="#9CA3AF" autoCapitalize="words" />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Jabatan / Posisi (opsional)</Text>
                  <TextInput style={styles.input} value={position} onChangeText={setPosition} placeholder="Contoh: Groomer, Resepsionis" placeholderTextColor="#9CA3AF" autoCapitalize="words" />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Cabang (opsional)</Text>
                  <View style={styles.branchList}>
                    <TouchableOpacity
                      style={[styles.branchChip, branchId === null && styles.branchChipActive]}
                      onPress={() => setBranchId(null)}
                    >
                      <Text style={[styles.branchChipText, branchId === null && styles.branchChipTextActive]}>Semua Cabang</Text>
                    </TouchableOpacity>
                    {branches.map(b => (
                      <TouchableOpacity
                        key={b.id}
                        style={[styles.branchChip, branchId === b.id && styles.branchChipActive]}
                        onPress={() => setBranchId(b.id)}
                      >
                        <Text style={[styles.branchChipText, branchId === b.id && styles.branchChipTextActive]}>{b.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>PIN (4 digit)</Text>
                  <TextInput
                    style={styles.input} value={pin} onChangeText={t => setPin(t.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Contoh: 1234" placeholderTextColor="#9CA3AF"
                    keyboardType="numeric" secureTextEntry maxLength={4}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Konfirmasi PIN</Text>
                  <TextInput
                    style={[styles.input, pinConfirm.length === 4 && pin !== pinConfirm && { borderColor: '#EF4444' }]}
                    value={pinConfirm} onChangeText={t => setPinConfirm(t.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Ulangi PIN" placeholderTextColor="#9CA3AF"
                    keyboardType="numeric" secureTextEntry maxLength={4}
                  />
                  {pinConfirm.length === 4 && pin !== pinConfirm && (
                    <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>PIN tidak cocok</Text>
                  )}
                </View>

                <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>{editTarget ? 'Simpan Perubahan' : 'Tambah Karyawan'}</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111827' },
  addBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#347385',
    justifyContent: 'center', alignItems: 'center',
  },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: '#9CA3AF' },
  emptyBtn: { backgroundColor: '#347385', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
  list: {
    margin: 16, backgroundColor: '#fff', borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2, overflow: 'hidden',
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  cardInactive: { opacity: 0.6 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#347385' },
  cardInfo: { flex: 1, gap: 2 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  inactiveBadge: { backgroundColor: '#FEF2F2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  inactiveBadgeText: { fontSize: 10, color: '#EF4444', fontWeight: '600' },
  cardPosition: { fontSize: 12, color: '#6B7280' },
  cardBranch: { fontSize: 11, color: '#9CA3AF' },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  pinText: { fontSize: 11, color: '#9CA3AF' },
  cardActions: { flexDirection: 'row', gap: 4 },
  editBtn: { padding: 8, borderRadius: 8, backgroundColor: '#EEF8FA' },
  toggleBtn: { padding: 8, borderRadius: 8, backgroundColor: '#F9FAFB' },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  field: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#111827', backgroundColor: '#FAFAFA',
  },
  branchList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  branchChip: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  branchChipActive: { backgroundColor: '#347385', borderColor: '#347385' },
  branchChipText: { fontSize: 13, color: '#374151' },
  branchChipTextActive: { color: '#fff', fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#347385', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8, marginBottom: 20,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
