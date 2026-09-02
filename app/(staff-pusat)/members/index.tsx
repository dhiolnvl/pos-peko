import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  FlatList, ActivityIndicator, Modal, Alert, ScrollView,
  RefreshControl, useWindowDimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBackFromDashboard } from '@/hooks/useBackFromDashboard';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import {
  fetchMembersFromSupabase,
  fetchBranchesFromSupabase,
  createMemberInSupabase,
  toggleMemberActiveInSupabase,
  getMemberPointLogsFromSupabase,
  type Member,
  type PointLog,
} from '@/lib/memberQueries';
import { useAuthStore } from '@/store/authStore';
import MemberReportButton from '@/components/MemberReportButton';
import { APP_NAME } from '@/constants/config';

interface BranchTab { id: string; name: string; }

function fmtPoints(p: number) { return p.toLocaleString('id-ID') + ' poin'; }
function fmtMoney(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

// ─── Add member modal ─────────────────────────────────────────────────────────

function AddMemberModal({
  branches,
  onSaved,
  onClose,
}: {
  branches: BranchTab[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [branchId, setBranchId] = useState<string>(branches[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) { setError('Nama wajib diisi'); return; }
    if (!branchId) { setError('Pilih cabang terlebih dahulu'); return; }
    setSaving(true);
    setError('');
    try {
      await createMemberInSupabase({ name, phone, address, branch_id: branchId });
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={addStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={addStyles.card} activeOpacity={1} onPress={() => {}}>
          <View style={addStyles.cardHeader}>
            <Text style={addStyles.cardTitle}>Daftarkan Member Baru</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          {!!error && (
            <View style={addStyles.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
              <Text style={addStyles.errorText}>{error}</Text>
            </View>
          )}

          <View style={addStyles.field}>
            <Text style={addStyles.label}>Nama *</Text>
            <View style={addStyles.inputWrap}>
              <Ionicons name="person-outline" size={15} color="#9CA3AF" style={{ marginHorizontal: 10 }} />
              <TextInput
                style={addStyles.input}
                value={name}
                onChangeText={setName}
                placeholder="Nama lengkap"
                placeholderTextColor="#9CA3AF"
                autoFocus
              />
            </View>
          </View>

          <View style={addStyles.field}>
            <Text style={addStyles.label}>No. HP</Text>
            <View style={addStyles.inputWrap}>
              <Ionicons name="call-outline" size={15} color="#9CA3AF" style={{ marginHorizontal: 10 }} />
              <TextInput
                style={addStyles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="08xxxxxxxx"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={addStyles.field}>
            <Text style={addStyles.label}>Alamat</Text>
            <View style={addStyles.inputWrap}>
              <Ionicons name="location-outline" size={15} color="#9CA3AF" style={{ marginHorizontal: 10 }} />
              <TextInput
                style={[addStyles.input, { paddingVertical: 9 }]}
                value={address}
                onChangeText={setAddress}
                placeholder="Opsional"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={2}
              />
            </View>
          </View>

          <View style={addStyles.field}>
            <Text style={addStyles.label}>Cabang *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {branches.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[addStyles.branchChip, branchId === b.id && addStyles.branchChipActive]}
                  onPress={() => setBranchId(b.id)}
                >
                  <Text style={[addStyles.branchChipText, branchId === b.id && addStyles.branchChipTextActive]}>
                    {b.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity style={addStyles.saveBtn} onPress={save} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={addStyles.saveBtnText}>Daftarkan Member</Text>
            }
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Member detail modal ──────────────────────────────────────────────────────

function MemberDetailModal({
  member,
  onClose,
  onToggleActive,
}: {
  member: Member;
  onClose: () => void;
  onToggleActive: (m: Member) => void;
}) {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<PointLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    getMemberPointLogsFromSupabase(member.id)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [member.id]);

  const handleToggle = async () => {
    Alert.alert(
      member.is_active ? 'Nonaktifkan Member' : 'Aktifkan Member',
      `${member.is_active ? 'Nonaktifkan' : 'Aktifkan'} member "${member.name}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: member.is_active ? 'Nonaktifkan' : 'Aktifkan',
          style: member.is_active ? 'destructive' : 'default',
          onPress: async () => {
            setToggling(true);
            try {
              await toggleMemberActiveInSupabase(member.id, member.is_active);
              onToggleActive(member);
            } catch (e: any) {
              Alert.alert('Gagal', e?.message ?? 'Terjadi kesalahan');
            } finally {
              setToggling(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[detailStyles.container, { paddingTop: insets.top }]}>
        <View style={detailStyles.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={detailStyles.headerTitle} numberOfLines={1}>{member.name}</Text>
          <TouchableOpacity
            style={[detailStyles.statusBtn, member.is_active ? { backgroundColor: '#FEF2F2' } : { backgroundColor: '#F0FDF4' }]}
            onPress={handleToggle}
            disabled={toggling}
          >
            {toggling
              ? <ActivityIndicator size="small" color={member.is_active ? '#DC2626' : '#16A34A'} />
              : <Text style={{ fontSize: 12, fontWeight: '700', color: member.is_active ? '#DC2626' : '#16A34A' }}>
                  {member.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={detailStyles.scroll}>
          <View style={detailStyles.profileCard}>
            <View style={detailStyles.avatar}>
              <Text style={detailStyles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={detailStyles.name}>{member.name}</Text>
            {!!member.phone && (
              <View style={detailStyles.infoRow}>
                <Ionicons name="call-outline" size={14} color="#6B7280" />
                <Text style={detailStyles.infoText}>{member.phone}</Text>
              </View>
            )}
            {!!member.address && (
              <View style={detailStyles.infoRow}>
                <Ionicons name="location-outline" size={14} color="#6B7280" />
                <Text style={detailStyles.infoText}>{member.address}</Text>
              </View>
            )}
            {!!member.branch_name && (
              <View style={detailStyles.registeredRow}>
                <Ionicons name="business-outline" size={12} color="#9CA3AF" />
                <Text style={detailStyles.registeredText}>Daftar di {member.branch_name}</Text>
              </View>
            )}
            {!member.is_active && (
              <View style={detailStyles.inactiveBadge}>
                <Text style={detailStyles.inactiveBadgeText}>NONAKTIF</Text>
              </View>
            )}
          </View>

          <View style={detailStyles.statsRow}>
            <View style={detailStyles.statBox}>
              <Ionicons name="star" size={20} color="#D97706" />
              <Text style={[detailStyles.statValue, { color: '#D97706' }]}>{member.points.toLocaleString('id-ID')}</Text>
              <Text style={detailStyles.statLabel}>Poin</Text>
            </View>
            <View style={detailStyles.statDivider} />
            <View style={detailStyles.statBox}>
              <Ionicons name="receipt-outline" size={20} color="#347385" />
              <Text style={[detailStyles.statValue, { color: '#347385' }]}>{fmtMoney(member.total_spent)}</Text>
              <Text style={detailStyles.statLabel}>Total Belanja</Text>
            </View>
            <View style={detailStyles.statDivider} />
            <View style={detailStyles.statBox}>
              <Ionicons name="layers-outline" size={20} color="#7C3AED" />
              <Text style={[detailStyles.statValue, { color: '#7C3AED' }]}>{logs.length}</Text>
              <Text style={detailStyles.statLabel}>Log Poin</Text>
            </View>
          </View>

          <Text style={detailStyles.sectionLabel}>Riwayat Poin</Text>
          {loading ? (
            <ActivityIndicator color="#56B2C1" style={{ marginTop: 16 }} />
          ) : logs.length === 0 ? (
            <Text style={detailStyles.emptyLogs}>Belum ada riwayat poin</Text>
          ) : (
            logs.map((log) => (
              <View key={log.id} style={detailStyles.logItem}>
                <View style={[detailStyles.logIconWrap, log.points < 0 && detailStyles.logIconWrapMinus]}>
                  <Ionicons name={log.points < 0 ? 'gift-outline' : 'star'} size={14} color={log.points < 0 ? '#347385' : '#D97706'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={detailStyles.logDesc}>{log.description ?? 'Poin transaksi'}</Text>
                  <Text style={detailStyles.logDate}>
                    {new Date(log.created_at).toLocaleDateString('id-ID', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </Text>
                </View>
                <Text style={[detailStyles.logPoints, log.points < 0 && detailStyles.logPointsMinus]}>
                  {log.points > 0 ? '+' : ''}{log.points}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Member card ──────────────────────────────────────────────────────────────

function MemberCard({
  member, isTablet, onPress,
}: { member: Member; isTablet: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[cardStyles.card, isTablet && cardStyles.cardTablet, !member.is_active && cardStyles.inactive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={cardStyles.avatar}>
        <Text style={cardStyles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={cardStyles.nameRow}>
          <Text style={cardStyles.name} numberOfLines={1}>{member.name}</Text>
          {!member.is_active && (
            <View style={cardStyles.inactiveBadge}>
              <Text style={cardStyles.inactiveBadgeText}>NONAKTIF</Text>
            </View>
          )}
        </View>
        {!!member.phone && <Text style={cardStyles.sub} numberOfLines={1}>{member.phone}</Text>}
        <View style={cardStyles.meta}>
          <View style={cardStyles.pointsPill}>
            <Ionicons name="star" size={11} color="#D97706" />
            <Text style={cardStyles.pointsText}>{fmtPoints(member.points)}</Text>
          </View>
          <Text style={cardStyles.spent}>{fmtMoney(member.total_spent)}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MembersManagement() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const goBack = useBackFromDashboard();
  const userName = useAuthStore((s) => s.user?.name ?? '');

  const [members, setMembers] = useState<Member[]>([]);
  const [branches, setBranches] = useState<BranchTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Member | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load branches once
  useEffect(() => {
    fetchBranchesFromSupabase().then(setBranches).catch(() => {});
  }, []);

  const fetchPage = useCallback(async (opts: {
    pageNum: number;
    searchVal: string;
    branchId: string | null;
    append: boolean;
    silent?: boolean;
  }) => {
    if (!opts.silent && !opts.append) setLoading(true);
    if (opts.append) setLoadingMore(true);
    try {
      const result = await fetchMembersFromSupabase({
        page: opts.pageNum,
        search: opts.searchVal,
        specificBranchId: opts.branchId ?? undefined,
      });
      setMembers((prev) => opts.append ? [...prev, ...result.data] : result.data);
      setHasMore(result.hasMore);
      setTotal(result.total);
      setPage(opts.pageNum);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchPage({ pageNum: 0, searchVal: debouncedSearch, branchId: selectedBranchId, append: false });
  }, [debouncedSearch, selectedBranchId, fetchPage]);

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(text), 400);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPage({ pageNum: 0, searchVal: debouncedSearch, branchId: selectedBranchId, append: false, silent: true });
  }, [fetchPage, debouncedSearch, selectedBranchId]);

  const onLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    fetchPage({ pageNum: page + 1, searchVal: debouncedSearch, branchId: selectedBranchId, append: true });
  }, [hasMore, loadingMore, loading, page, debouncedSearch, selectedBranchId, fetchPage]);

  const handleToggleActive = useCallback((member: Member) => {
    const newIsActive = member.is_active ? 0 : 1;
    setMembers((prev) =>
      prev.map((m) => m.id === member.id ? { ...m, is_active: newIsActive } : m)
    );
    setSelected((s) => s?.id === member.id ? { ...s, is_active: newIsActive } : s);
  }, []);

  const renderItem = useCallback(({ item }: { item: Member }) => (
    <View style={[styles.cardWrap, isTablet && styles.cardWrapTablet]}>
      <MemberCard member={item} isTablet={isTablet} onPress={() => setSelected(item)} />
    </View>
  ), [isTablet]);

  const ListHeader = (
    <View>
      <View style={styles.statsRow}>
        <View style={[styles.statPill, { borderColor: '#56B2C133', backgroundColor: '#EEF8FA' }]}>
          <Text style={[styles.statValue, { color: '#347385' }]}>{total}</Text>
          <Text style={[styles.statLabel, { color: '#347385' }]}>Total</Text>
        </View>
        <View style={[styles.statPill, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
          <Text style={[styles.statValue, { color: '#D97706' }]}>{members.filter((m) => m.is_active).length}</Text>
          <Text style={[styles.statLabel, { color: '#D97706' }]}>Aktif</Text>
        </View>
        <View style={[styles.statPill, { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' }]}>
          <Text style={[styles.statValue, { color: '#16A34A' }]}>{members.filter((m) => !m.is_active).length}</Text>
          <Text style={[styles.statLabel, { color: '#16A34A' }]}>Nonaktif</Text>
        </View>
      </View>

      <View style={styles.filterBlock}>
        <View style={{ height: 48, justifyContent: 'center' }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
          >
            <TouchableOpacity
              style={[styles.tabChip, selectedBranchId === null && styles.tabChipActive]}
              onPress={() => { setMembers([]); setSelectedBranchId(null); }}
            >
              <Text style={[styles.tabChipText, selectedBranchId === null && styles.tabChipTextActive]}>Semua</Text>
            </TouchableOpacity>
            {branches.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.tabChip, selectedBranchId === b.id && styles.tabChipActive]}
                onPress={() => { setMembers([]); setSelectedBranchId(b.id); }}
              >
                <Text style={[styles.tabChipText, selectedBranchId === b.id && styles.tabChipTextActive]}>
                  {b.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" style={{ marginLeft: 14 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama atau no. HP..."
            value={search}
            onChangeText={handleSearchChange}
            placeholderTextColor="#9CA3AF"
          />
          {!!search && (
            <TouchableOpacity onPress={() => { handleSearchChange(''); setDebouncedSearch(''); }} style={{ paddingHorizontal: 12 }}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {total > 0 && (
          <Text style={styles.listCount}>{total} member ditemukan</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <OwnerPageHeader
        title="Manajemen Member"
        subtitle={`${total} member terdaftar`}
        onBack={goBack}
        rightElement={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MemberReportButton
              storeName={APP_NAME}
              printerName={userName}
              showBranch
              variant="onDark"
            />
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
              <Ionicons name="person-add-outline" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Tambah</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <TabletCenteredView style={{ flex: 1 }}>
        {loading && !refreshing ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#56B2C1" />
            <Text style={styles.loadingText}>Memuat data...</Text>
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            ListHeaderComponent={ListHeader}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={25}
            maxToRenderPerBatch={25}
            windowSize={5}
            removeClippedSubviews
            numColumns={isTablet ? 2 : 1}
            key={isTablet ? 'tablet' : 'phone'}
            columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
            onEndReached={onLoadMore}
            onEndReachedThreshold={0.3}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#56B2C1']}
                tintColor="#56B2C1"
              />
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#56B2C1" />
                </View>
              ) : hasMore ? (
                <View style={{ paddingVertical: 8 }} />
              ) : members.length > 0 ? (
                <Text style={styles.endText}>Semua {total} member ditampilkan</Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="people-outline" size={36} color="#D1D5DB" />
                </View>
                <Text style={styles.emptyTitle}>Belum ada member</Text>
                <Text style={styles.emptySub}>
                  {search ? 'Coba kata kunci lain' : 'Member bisa didaftarkan saat transaksi di kasir'}
                </Text>
              </View>
            }
          />
        )}
      </TabletCenteredView>

      {selected && (
        <MemberDetailModal
          member={selected}
          onClose={() => setSelected(null)}
          onToggleActive={handleToggleActive}
        />
      )}

      {showAdd && (
        <AddMemberModal
          branches={branches}
          onSaved={() => {
            setShowAdd(false);
            fetchPage({ pageNum: 0, searchVal: debouncedSearch, branchId: selectedBranchId, append: false, silent: true });
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const detailStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827' },
  statusBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, minWidth: 90, alignItems: 'center' },
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  profileCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    alignItems: 'center', gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  avatar: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#347385' },
  name: { fontSize: 18, fontWeight: '800', color: '#111827' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, color: '#6B7280' },
  registeredRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  registeredText: { fontSize: 11, color: '#9CA3AF' },
  inactiveBadge: {
    backgroundColor: '#F3F4F6', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 2,
  },
  inactiveBadgeText: { fontSize: 10, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.5 },
  statsRow: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyLogs: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
  },
  logIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center',
  },
  logIconWrapMinus: { backgroundColor: '#EEF8FA' },
  logDesc: { fontSize: 13, fontWeight: '600', color: '#111827' },
  logDate: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  logPoints: { fontSize: 15, fontWeight: '800', color: '#D97706' },
  logPointsMinus: { color: '#347385' },
});

const cardStyles = StyleSheet.create({
  card: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 5 },
      android: { elevation: 2 },
    }),
  },
  cardTablet: {},
  inactive: { opacity: 0.55 },
  avatar: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#347385' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '700', color: '#111827', flexShrink: 1 },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  inactiveBadge: {
    backgroundColor: '#F3F4F6', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  inactiveBadgeText: { fontSize: 9, color: '#9CA3AF', fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  pointsPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FFFBEB', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  pointsText: { fontSize: 11, fontWeight: '700', color: '#D97706' },
  spent: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  statsRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingTop: 14,
  },
  statPill: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, gap: 2,
  },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', opacity: 0.8 },

  filterBlock: {
    backgroundColor: '#fff', marginTop: 12,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E5E7EB',
    paddingBottom: 10,
  },
  tabRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  tabChip: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#F3F4F6',
    borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  tabChipActive: { backgroundColor: '#EEF8FA', borderColor: '#56B2C1' },
  tabChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tabChipTextActive: { color: '#347385' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', marginHorizontal: 16, marginTop: 10,
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, paddingVertical: 10, paddingRight: 4, fontSize: 14, color: '#111827' },
  listCount: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', paddingHorizontal: 16, paddingTop: 10 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  loadingBox: { paddingTop: 60, alignItems: 'center', gap: 12 },
  loadingText: { color: '#9CA3AF', fontSize: 14 },

  listContent: { paddingBottom: 40 },
  cardWrap: { paddingHorizontal: 16, paddingTop: 10 },
  cardWrapTablet: { flex: 1, paddingHorizontal: 0 },
  columnWrapper: { paddingHorizontal: 16, paddingTop: 10, gap: 10 },
  endText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingVertical: 16 },

  emptyBox: { paddingTop: 60, alignItems: 'center', gap: 8, paddingHorizontal: 32 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
});

const addStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    width: '88%', maxWidth: 440, gap: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10,
  },
  errorText: { color: '#DC2626', fontSize: 12, flex: 1 },
  field: { gap: 5 },
  label: { fontSize: 12, fontWeight: '600', color: '#374151' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  input: { flex: 1, paddingVertical: 11, paddingRight: 12, fontSize: 14, color: '#111827' },
  branchChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#F3F4F6',
    borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  branchChipActive: { backgroundColor: '#EEF8FA', borderColor: '#56B2C1' },
  branchChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  branchChipTextActive: { color: '#347385' },
  saveBtn: {
    backgroundColor: '#56B2C1', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
