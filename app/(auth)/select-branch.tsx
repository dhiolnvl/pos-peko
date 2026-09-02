import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { getActiveBranches, type Branch } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function SelectBranchScreen() {
  const { user, switchBranch } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      setError(null);
      const data = await getActiveBranches();
      setBranches(data);
    } catch (error) {
      console.error('Failed to load branches:', error);
      setError('Gagal memuat cabang');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectBranch = async (branch: Branch) => {
    await switchBranch(branch);
    router.replace('/(owner)');
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#56B2C1" />
        <Text style={styles.loadingText}>Memuat cabang...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle" size={48} color="#EF4444" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadBranches}>
          <Text style={styles.retryButtonText}>Coba Lagi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (branches.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="business-outline" size={48} color="#9CA3AF" />
        <Text style={styles.emptyText}>Belum ada cabang aktif</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image
          source={require('@/assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Pilih Cabang</Text>
        <Text style={styles.subtitle}>
          Halo {user?.name}, pilih cabang untuk melihat data
        </Text>
      </View>

      <FlatList
        data={branches}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.branchCard}
            onPress={() => handleSelectBranch(item)}
          >
            <View style={styles.branchIcon}>
              <Ionicons name="business" size={24} color="#56B2C1" />
            </View>
            <View style={styles.branchInfo}>
              <Text style={styles.branchName}>{item.name}</Text>
              {item.address && (
                <Text style={styles.branchAddress}>{item.address}</Text>
              )}
              {item.phone && (
                <Text style={styles.branchPhone}>{item.phone}</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={24} color="#56B2C1" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F7F9',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F0F7F9',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#56B2C1',
    borderBottomWidth: 1,
    borderBottomColor: '#3E96A6',
    alignItems: 'flex-start',
  },
  logo: {
    width: 160,
    height: 74,
    marginBottom: 12,
    tintColor: undefined,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#D4EFF4',
  },
  listContent: {
    padding: 20,
  },
  branchCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A9DFE9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  branchIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D4EFF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  branchInfo: {
    flex: 1,
  },
  branchName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#347385',
    marginBottom: 4,
  },
  branchAddress: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  branchPhone: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#56B2C1',
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#56B2C1',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
