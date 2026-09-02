/**
 * SupplierPickerSheet → SupplierPickerModal
 * Centered dialog modal for selecting or creating a supplier.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput, FlatList,
  StyleSheet, Dimensions, ActivityIndicator, Alert,
  Platform, ScrollView, Keyboard, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSupplierStore, type Supplier } from '@/store/supplierStore';

interface SupplierPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (supplier: Supplier) => void;
  selectedId?: string | null;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function SupplierPickerSheet({
  visible, onClose, onSelect, selectedId,
}: SupplierPickerSheetProps) {
  const { suppliers, isLoading, loadSuppliers, syncFromSupabase, addSupplier, updateSupplier, deleteSupplier } =
    useSupplierStore();

  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  const nameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setMode('list');
      setSearch('');
      loadSuppliers();
      syncFromSupabase();
    }
  }, [visible]);

  const filtered = suppliers.filter((s) =>
    !search.trim() ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search)
  );

  const openAdd = () => {
    setFormName(search);
    setFormPhone('');
    setFormAddress('');
    setEditingId(null);
    setMode('add');
    setTimeout(() => nameInputRef.current?.focus(), 100);
  };

  const openEdit = (s: Supplier) => {
    setFormName(s.name);
    setFormPhone(s.phone || '');
    setFormAddress(s.address || '');
    setEditingId(s.id);
    setMode('edit');
    setTimeout(() => nameInputRef.current?.focus(), 100);
  };

  const handleSave = async () => {
    if (!formName.trim()) { Alert.alert('Perhatian', 'Nama supplier harus diisi'); return; }
    setFormSaving(true);
    try {
      if (mode === 'add') {
        const newSupplier = await addSupplier({ name: formName, phone: formPhone, address: formAddress });
        onSelect(newSupplier);
        onClose();
      } else if (mode === 'edit' && editingId) {
        await updateSupplier(editingId, { name: formName, phone: formPhone, address: formAddress });
        setMode('list');
      }
    } catch (err: any) {
      Alert.alert('Gagal', err.message);
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = (supplier: Supplier) => {
    Alert.alert('Hapus Supplier', `Yakin hapus "${supplier.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus', style: 'destructive', onPress: async () => {
          await deleteSupplier(supplier.id);
          if (editingId === supplier.id) setMode('list');
        },
      },
    ]);
  };

  /* ─── FORM VIEW ─── */
  const renderForm = () => (
    <>
      {/* Dialog header */}
      <View style={styles.dialogHeader}>
        <TouchableOpacity onPress={() => { Keyboard.dismiss(); setMode('list'); }} style={styles.headerBackBtn}>
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
        </TouchableOpacity>
        <Text style={styles.dialogTitle}>
          {mode === 'add' ? 'Tambah Supplier' : 'Edit Supplier'}
        </Text>
        {mode === 'edit' && editingId ? (
          <TouchableOpacity
            onPress={() => { const s = suppliers.find(s => s.id === editingId); if (s) handleDelete(s); }}
            style={styles.headerActionBtn}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => { Keyboard.dismiss(); onClose(); }} style={styles.headerActionBtn}>
            <Ionicons name="close" size={20} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* Form fields */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.formBody}
      >
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Nama Supplier *</Text>
          <TextInput
            ref={nameInputRef}
            style={styles.fieldInput}
            value={formName}
            onChangeText={setFormName}
            placeholder="Contoh: PT Maju Jaya"
            placeholderTextColor="#9CA3AF"
            returnKeyType="next"
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>No. Telepon</Text>
          <TextInput
            style={styles.fieldInput}
            value={formPhone}
            onChangeText={setFormPhone}
            placeholder="0812-xxxx-xxxx"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Alamat (opsional)</Text>
          <TextInput
            style={[styles.fieldInput, { height: 72, textAlignVertical: 'top' }]}
            value={formAddress}
            onChangeText={setFormAddress}
            placeholder="Alamat supplier..."
            placeholderTextColor="#9CA3AF"
            multiline
          />
        </View>

        <View style={styles.formActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => { Keyboard.dismiss(); setMode('list'); }}>
            <Text style={styles.cancelBtnText}>Batal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, formSaving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={formSaving}
          >
            {formSaving ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>
                  {mode === 'add' ? 'Simpan & Pilih' : 'Simpan'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );

  /* ─── LIST VIEW ─── */
  const renderList = () => (
    <>
      {/* Dialog header */}
      <View style={styles.dialogHeader}>
        <View style={{ width: 32 }} />
        <Text style={styles.dialogTitle}>Pilih Supplier</Text>
        <TouchableOpacity onPress={onClose} style={styles.headerActionBtn}>
          <Ionicons name="close" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari nama atau nomor..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Add new row */}
      <TouchableOpacity style={styles.addNewRow} onPress={openAdd}>
        <View style={styles.addNewIcon}>
          <Ionicons name="add" size={18} color="#22C55E" />
        </View>
        <Text style={styles.addNewText}>
          {search.trim() ? `Tambah "${search}" sebagai supplier baru` : 'Tambah Supplier Baru'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#22C55E" />
      </TouchableOpacity>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Supplier list */}
      {isLoading && suppliers.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#22C55E" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={40} color="#D1D5DB" />
          <Text style={styles.emptyText}>
            {search ? 'Supplier tidak ditemukan' : 'Belum ada supplier'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingBottom: 8 }}
          renderItem={({ item }) => {
            const isSelected = item.id === selectedId;
            return (
              <TouchableOpacity
                style={[styles.supplierRow, isSelected && styles.supplierRowSelected]}
                onPress={() => { onSelect(item); onClose(); }}
                activeOpacity={0.75}
              >
                <View style={styles.supplierAvatar}>
                  <Text style={styles.supplierAvatarText}>
                    {item.name.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.supplierInfo}>
                  <Text style={[styles.supplierName, isSelected && { color: '#22C55E' }]}>
                    {item.name}
                  </Text>
                  {item.phone ? <Text style={styles.supplierPhone}>{item.phone}</Text> : null}
                  {item.address ? <Text style={styles.supplierAddress} numberOfLines={1}>{item.address}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {isSelected && <Ionicons name="checkmark-circle" size={18} color="#22C55E" />}
                  <TouchableOpacity
                    style={styles.editIconBtn}
                    onPress={() => openEdit(item)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="pencil-outline" size={15} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade"
      statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Backdrop */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject}
          onPress={onClose} activeOpacity={1} />

        {/* Centered dialog */}
        <View style={styles.dialog}>
          {mode === 'list' ? renderList() : renderForm()}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 480,
    maxHeight: SCREEN_HEIGHT * 0.78,
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },

  /* Header */
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dialogTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1, textAlign: 'center' },
  headerBackBtn: { padding: 4, width: 32 },
  headerActionBtn: { padding: 4, width: 32, alignItems: 'flex-end' },

  /* Search */
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12, marginBottom: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#F9FAFB', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', paddingVertical: 0 },

  /* Add new */
  addNewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#F0FDF4', borderRadius: 10,
    borderWidth: 1, borderColor: '#86EFAC',
  },
  addNewIcon: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#DCFCE7',
    justifyContent: 'center', alignItems: 'center',
  },
  addNewText: { fontSize: 13, fontWeight: '600', color: '#16A34A', flex: 1 },

  divider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 16, marginBottom: 8 },

  /* Supplier rows */
  supplierRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    marginHorizontal: 16,
  },
  supplierRowSelected: { borderColor: '#22C55E', backgroundColor: '#F0FDF4' },
  supplierAvatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#DCFCE7',
    justifyContent: 'center', alignItems: 'center',
  },
  supplierAvatarText: { fontSize: 13, fontWeight: '800', color: '#16A34A' },
  supplierInfo: { flex: 1 },
  supplierName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  supplierPhone: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  supplierAddress: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  editIconBtn: { padding: 4 },

  centered: { justifyContent: 'center', alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },

  /* Form */
  formBody: { padding: 16, gap: 14 },
  fieldGroup: { gap: 5 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  fieldInput: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111827', backgroundColor: '#F9FAFB',
  },
  formActions: {
    flexDirection: 'row', gap: 10, marginTop: 4,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  saveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#22C55E', borderRadius: 10,
    paddingVertical: 12,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
