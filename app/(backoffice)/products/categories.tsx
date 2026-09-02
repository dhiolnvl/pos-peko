/**
 * Categories Management Screen
 * Manage product categories
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProductStore, type Category } from '@/store/productStore';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const {
    categories,
    loadCategories,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useProductStore();

  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const openAddModal = () => {
    setEditingCategory(null);
    setName('');
    setShowModal(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setName(category.name);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Nama kategori harus diisi');
      return;
    }

    try {
      setIsLoading(true);

      if (editingCategory) {
        await updateCategory(editingCategory.id, name.trim());
        Alert.alert('Berhasil', 'Kategori berhasil diperbarui');
      } else {
        await addCategory(name.trim());
        Alert.alert('Berhasil', 'Kategori berhasil ditambahkan');
      }

      setShowModal(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Gagal menyimpan kategori');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (category: Category) => {
    Alert.alert(
      'Konfirmasi',
      `Hapus kategori "${category.name}"?\n\nKategori hanya bisa dihapus jika tidak ada produk aktif di dalamnya.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(category.id);
              Alert.alert('Berhasil', 'Kategori berhasil dihapus');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Gagal menghapus kategori');
            }
          },
        },
      ]
    );
  };

  const renderRightActions = (category: Category) => {
    return (
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDelete(category)}
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
        <Text style={styles.deleteButtonText}>Hapus</Text>
      </TouchableOpacity>
    );
  };

  const renderCategory = ({ item }: { item: Category }) => {
    return (
      <Swipeable
        renderRightActions={() => renderRightActions(item)}
        overshootRight={false}
      >
        <TouchableOpacity
          style={styles.categoryItem}
          onPress={() => openEditModal(item)}
        >
          <View style={styles.categoryLeft}>
            <View style={styles.categoryIconBox}>
              <Ionicons name="pricetag-outline" size={20} color="#56B2C1" />
            </View>
            <View>
              <Text style={styles.categoryName}>{item.name}</Text>
              <Text style={styles.categoryCount}>- produk</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#A0AEC0" />
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kategori</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Category List */}
      {categories.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="apps-outline" size={64} color="#CBD5E0" />
          <Text style={styles.emptyText}>Belum ada kategori</Text>
          <Text style={styles.emptySubtext}>
            Tap tombol + untuk menambah kategori
          </Text>
        </View>
      ) : (
        <FlatList
          data={categories}
          renderItem={renderCategory}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCategory ? 'Edit Kategori' : 'Tambah Kategori'}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#1A202C" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              <View style={styles.field}>
                <Text style={styles.label}>
                  Nama Kategori <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Contoh: Makanan Kucing"
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  editable={!isLoading}
                />
              </View>
            </View>

            {/* Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setShowModal(false)}
                disabled={isLoading}
              >
                <Text style={styles.buttonSecondaryText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary, isLoading && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonPrimaryText}>Simpan</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A202C',
  },
  list: {
    padding: 16,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A202C',
  },
  categoryCount: {
    fontSize: 12,
    color: '#A0AEC0',
    marginTop: 2,
  },
  deleteButton: {
    backgroundColor: '#E53E3E',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: 8,
    borderRadius: 12,
    marginLeft: 8,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A5568',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#A0AEC0',
    marginTop: 8,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#56B2C1',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A202C',
  },
  modalContent: {
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 8,
  },
  required: {
    color: '#E53E3E',
  },
  field: {
    marginBottom: 16,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1A202C',
    backgroundColor: '#fff',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A5568',
  },
  buttonPrimary: {
    backgroundColor: '#56B2C1',
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
