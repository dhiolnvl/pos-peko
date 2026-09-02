import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useProductStore, type Category } from '@/store/productStore';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

export default function OwnerCategoriesScreen() {
  const insets = useSafeAreaInsets();
  const { addCategory, updateCategory, deleteCategory } = useProductStore();

  const [categories, setCategories] = useState<Category[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingCats, setLoadingCats] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoadingCats(true);
    try {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      setCategories(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCats(false);
    }
  };

  const openAddModal = () => {
    setEditingCategory(null);
    setName('');
    setShowModal(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Error', 'Nama kategori harus diisi'); return; }
    try {
      setIsLoading(true);
      if (editingCategory) {
        await updateCategory(editingCategory.id, name.trim());
        setCategories((prev) => prev.map((c) => c.id === editingCategory.id ? { ...c, name: name.trim() } : c));
        Alert.alert('Berhasil', 'Kategori berhasil diperbarui');
      } else {
        await addCategory(name.trim());
        loadCategories();
        Alert.alert('Berhasil', 'Kategori berhasil ditambahkan');
      }
      setShowModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Gagal menyimpan kategori');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (cat: Category) => {
    Alert.alert(
      'Konfirmasi',
      `Hapus kategori "${cat.name}"?\n\nKategori hanya bisa dihapus jika tidak ada produk aktif di dalamnya.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus', style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(cat.id);
              setCategories((prev) => prev.filter((c) => c.id !== cat.id));
              Alert.alert('Berhasil', 'Kategori berhasil dihapus');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Gagal menghapus kategori');
            }
          },
        },
      ]
    );
  };

  const renderCategory = ({ item }: { item: Category }) => (
    <View style={styles.categoryItem}>
      <TouchableOpacity style={styles.categoryLeft} onPress={() => openEditModal(item)}>
        <View style={styles.categoryIconBox}>
          <Ionicons name="pricetag-outline" size={20} color="#347385" />
        </View>
        <Text style={styles.categoryName}>{item.name}</Text>
      </TouchableOpacity>
      <View style={styles.categoryActions}>
        <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(item)}>
          <Ionicons name="create-outline" size={16} color="#347385" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
          <Ionicons name="trash-outline" size={16} color="#E53E3E" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <OwnerPageHeader
        title="Kategori Produk"
        onBack={() => router.back()}
        onAdd={openAddModal}
      />

      {loadingCats ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#347385" />
        </View>
      ) : categories.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="apps-outline" size={64} color="#CBD5E0" />
          <Text style={styles.emptyText}>Belum ada kategori</Text>
          <Text style={styles.emptySubtext}>Tap tombol + untuk menambah kategori</Text>
        </View>
      ) : (
        <FlatList
          data={categories}
          renderItem={renderCategory}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        />
      )}

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => !isLoading && setShowModal(false)}>
          <TouchableOpacity style={styles.modalContainer} activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCategory ? 'Edit Kategori' : 'Tambah Kategori'}</Text>
              <TouchableOpacity onPress={() => !isLoading && setShowModal(false)}>
                <Ionicons name="close" size={22} color="#374151" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              <Text style={styles.label}>Nama Kategori <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="Contoh: Makanan Kucing"
                value={name}
                onChangeText={setName}
                autoFocus
                editable={!isLoading}
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setShowModal(false)}
                disabled={isLoading}
              >
                <Text style={styles.buttonSecondaryText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary, isLoading && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={isLoading}
              >
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonPrimaryText}>Simpan</Text>}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  list: { padding: 16 },
  categoryItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0',
  },
  categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  categoryIconBox: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  categoryName: { fontSize: 15, fontWeight: '600', color: '#1A202C', flex: 1 },
  categoryActions: { flexDirection: 'row', gap: 4 },
  editBtn: { padding: 8, borderRadius: 8, backgroundColor: '#EEF8FA' },
  deleteBtn: { padding: 8, borderRadius: 8, backgroundColor: '#FEF2F2' },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#4A5568', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#A0AEC0', marginTop: 8, textAlign: 'center' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalContainer: {
    backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 420,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  modalContent: { padding: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#2D3748', marginBottom: 8 },
  required: { color: '#E53E3E' },
  input: {
    height: 48, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8,
    paddingHorizontal: 12, fontSize: 15, color: '#1A202C', backgroundColor: '#fff',
  },
  modalFooter: {
    flexDirection: 'row', padding: 16, borderTopWidth: 1,
    borderTopColor: '#E2E8F0', gap: 12,
  },
  button: { flex: 1, height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
  buttonSecondaryText: { fontSize: 15, fontWeight: '600', color: '#4A5568' },
  buttonPrimary: { backgroundColor: '#347385' },
  buttonPrimaryText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
