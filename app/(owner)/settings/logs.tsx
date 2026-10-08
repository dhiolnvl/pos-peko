import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { getActivityLogs, ActivityLog, ActionType } from '@/lib/logService';
import { getActiveBranches, Branch } from '@/lib/supabase';

interface FilterChip {
  key: string;
  label: string;
  type?: ActionType;
}

const FILTER_TYPES: FilterChip[] = [
  { key: 'all', label: 'Semua' },
  { key: 'auth', label: 'Autentikasi', type: 'auth' },
  { key: 'transaction', label: 'Transaksi', type: 'transaction' },
  { key: 'inventory', label: 'Produk', type: 'inventory' },
  { key: 'management', label: 'Manajemen User', type: 'management' },
];

export default function ActivityLogsScreen() {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBranchModal, setShowBranchModal] = useState(false);

  // Detail Modal
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  const fetchBranches = async () => {
    try {
      const data = await getActiveBranches();
      setBranches(data || []);
    } catch (e) {
      console.log('[ActivityLogs] Error fetching branches:', e);
    }
  };

  const fetchLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const result = await getActivityLogs({
        branchId: selectedBranchId,
        actionType: selectedType === 'all' ? null : selectedType,
        search: searchQuery.trim(),
        limit: 100,
      });
      setLogs(result || []);
    } catch (error) {
      console.log('[ActivityLogs] Error fetching logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBranchId, selectedType, searchQuery]);

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;

      const dateFormatted = date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const timeFormatted = date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${dateFormatted}, ${timeFormatted}`;
    } catch {
      return dateStr;
    }
  };

  const getActionBadgeStyle = (actionType: string) => {
    switch (actionType) {
      case 'auth':
        return { bg: '#F3E8FF', text: '#9333EA', icon: 'person-outline' as const };
      case 'transaction':
        return { bg: '#DCFCE7', text: '#16A34A', icon: 'receipt-outline' as const };
      case 'inventory':
        return { bg: '#FEF3C7', text: '#D97706', icon: 'cube-outline' as const };
      case 'management':
        return { bg: '#DBEAFE', text: '#2563EB', icon: 'people-outline' as const };
      case 'settings':
        return { bg: '#EEF8FA', text: '#347385', icon: 'settings-outline' as const };
      default:
        return { bg: '#F3F4F6', text: '#4B5563', icon: 'list-outline' as const };
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return 'Pemilik';
      case 'back_office':
        return 'Back Office';
      case 'cashier':
        return 'Kasir';
      case 'staff_pusat':
        return 'Staff Pusat';
      default:
        return role;
    }
  };

  const selectedBranchName = selectedBranchId
    ? branches.find((b) => b.id === selectedBranchId)?.name || 'Cabang Dipilih'
    : 'Semua Cabang';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log Aktivitas</Text>
        <TouchableOpacity
          onPress={() => fetchLogs(true)}
          style={styles.refreshBtn}
          disabled={refreshing}
        >
          <Ionicons name="refresh-outline" size={22} color="#347385" />
        </TouchableOpacity>
      </View>

      <TabletCenteredView style={{ flex: 1 }}>
        {/* Search Bar & Branch Filter */}
        <View style={styles.filterSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari pengguna, aktivitas, atau pesan..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              onSubmitEditing={() => fetchLogs()}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.branchSelectBtn}
            onPress={() => setShowBranchModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="business-outline" size={16} color="#347385" />
            <Text style={styles.branchSelectText} numberOfLines={1}>
              {selectedBranchName}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Action Type Filter ScrollView */}
        <View style={styles.filterChipWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipContainer}
          >
            {FILTER_TYPES.map((chip) => {
              const isActive = selectedType === chip.key;
              return (
                <TouchableOpacity
                  key={chip.key}
                  style={[styles.chip, isActive && styles.chipActive]}
                  onPress={() => setSelectedType(chip.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Logs List */}
        {loading && !refreshing ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#347385" />
            <Text style={styles.loadingText}>Memuat riwayat log...</Text>
          </View>
        ) : logs.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchLogs(true)}
                tintColor="#347385"
              />
            }
          >
            <View style={styles.emptyIconWrap}>
              <Ionicons name="journal-outline" size={48} color="#9CA3AF" />
            </View>
            <Text style={styles.emptyTitle}>Belum Ada Log Aktivitas</Text>
            <Text style={styles.emptySub}>
              Aktivitas pengguna dan perubahan sistem akan tercatat di sini.
            </Text>
          </ScrollView>
        ) : (
          <FlatList
            data={logs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: insets.bottom + 32,
              paddingTop: 8,
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchLogs(true)}
                tintColor="#347385"
              />
            }
            renderItem={({ item }) => {
              const badge = getActionBadgeStyle(item.action_type);
              return (
                <TouchableOpacity
                  style={styles.logCard}
                  onPress={() => setSelectedLog(item)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.badgeWrap, { backgroundColor: badge.bg }]}>
                    <Ionicons name={badge.icon} size={20} color={badge.text} />
                  </View>

                  <View style={styles.logContent}>
                    <View style={styles.logHeaderRow}>
                      <Text style={styles.userName}>{item.user_name}</Text>
                      <View style={styles.roleBadge}>
                        <Text style={styles.roleBadgeText}>{getRoleLabel(item.user_role)}</Text>
                      </View>
                    </View>

                    <Text style={styles.descriptionText}>{item.description}</Text>

                    <View style={styles.logFooterRow}>
                      {item.branch_name ? (
                        <View style={styles.branchTag}>
                          <Ionicons name="location-outline" size={12} color="#6B7280" />
                          <Text style={styles.branchTagText}>{item.branch_name}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.timestampText}>{formatTimestamp(item.created_at)}</Text>
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </TouchableOpacity>
              );
            }}
          />
        )}
      </TabletCenteredView>

      {/* Branch Selection Modal */}
      <Modal
        visible={showBranchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBranchModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowBranchModal(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pilih Cabang</Text>
              <TouchableOpacity onPress={() => setShowBranchModal(false)}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              <TouchableOpacity
                style={[
                  styles.modalItem,
                  selectedBranchId === null && styles.modalItemActive,
                ]}
                onPress={() => {
                  setSelectedBranchId(null);
                  setShowBranchModal(false);
                }}
              >
                <Text
                  style={[
                    styles.modalItemText,
                    selectedBranchId === null && styles.modalItemTextActive,
                  ]}
                >
                  Semua Cabang
                </Text>
                {selectedBranchId === null && (
                  <Ionicons name="checkmark" size={18} color="#347385" />
                )}
              </TouchableOpacity>

              {branches.map((b) => {
                const isSelected = selectedBranchId === b.id;
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.modalItem, isSelected && styles.modalItemActive]}
                    onPress={() => {
                      setSelectedBranchId(b.id);
                      setShowBranchModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        isSelected && styles.modalItemTextActive,
                      ]}
                    >
                      {b.name}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color="#347385" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Detail Log Modal */}
      <Modal
        visible={!!selectedLog}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedLog(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedLog(null)}
        >
          {selectedLog && (
            <View style={styles.detailModalCard} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Detail Aktivitas</Text>
                <TouchableOpacity onPress={() => setSelectedLog(null)}>
                  <Ionicons name="close" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 400 }}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Aksi / Aktivitas</Text>
                  <Text style={styles.detailValueBold}>{selectedLog.action}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tipe</Text>
                  <Text style={styles.detailValue}>{selectedLog.action_type}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Pengguna</Text>
                  <Text style={styles.detailValue}>
                    {selectedLog.user_name} ({getRoleLabel(selectedLog.user_role)})
                  </Text>
                </View>

                {selectedLog.branch_name && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Cabang</Text>
                    <Text style={styles.detailValue}>{selectedLog.branch_name}</Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Waktu</Text>
                  <Text style={styles.detailValue}>{formatTimestamp(selectedLog.created_at)}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Deskripsi Lengkap</Text>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailBoxText}>{selectedLog.description}</Text>
                  </View>
                </View>

                {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Rincian Data</Text>
                    <View style={styles.detailBox}>
                      <Text style={styles.codeText}>
                        {JSON.stringify(selectedLog.details, null, 2)}
                      </Text>
                    </View>
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity
                style={styles.closeBtnModal}
                onPress={() => setSelectedLog(null)}
              >
                <Text style={styles.closeBtnText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  refreshBtn: { padding: 4 },
  filterSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
  },
  branchSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF8FA',
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    gap: 6,
    maxWidth: 140,
  },
  branchSelectText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#347385',
    flexShrink: 1,
  },
  filterChipWrapper: {
    height: 50,
    justifyContent: 'center',
    marginTop: 6,
  },
  filterChipContainer: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#347385',
    borderColor: '#347385',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  chipTextActive: {
    color: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
  },
  logCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  badgeWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logContent: {
    flex: 1,
    gap: 4,
  },
  logHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  roleBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4B5563',
  },
  descriptionText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  logFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  branchTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  branchTagText: {
    fontSize: 11,
    color: '#6B7280',
  },
  timestampText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginLeft: 'auto',
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  detailModalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  modalItemActive: {
    backgroundColor: '#EEF8FA',
  },
  modalItemText: {
    fontSize: 14,
    color: '#374151',
  },
  modalItemTextActive: {
    fontWeight: '700',
    color: '#347385',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 13,
    color: '#111827',
  },
  detailValueBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#347385',
  },
  detailSection: {
    marginTop: 12,
    gap: 6,
  },
  detailBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  detailBoxText: {
    fontSize: 13,
    color: '#111827',
    lineHeight: 18,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#374151',
  },
  closeBtnModal: {
    marginTop: 16,
    backgroundColor: '#347385',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
