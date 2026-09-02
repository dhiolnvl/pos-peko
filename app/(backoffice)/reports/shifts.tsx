import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackofficeHeader } from '@/components/BackofficeHeader';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { useAuthStore } from '@/store/authStore';
import {
  ensureShiftTable,
  getShiftsByBranch,
  getShiftDetail,
  getShiftStats,
  type ShiftListItem,
  type ShiftDetail,
  type ShiftStats,
} from '@/lib/shiftQueries';

function fmtMoney(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  );
}

function fmtDuration(openedAt: string, closedAt: string | null) {
  const start = new Date(openedAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const diff = Math.floor((end - start) / 60000);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `${h} jam ${m} menit` : `${m} menit`;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconBox, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={statStyles.col}>
        <Text style={[statStyles.value, { color }]} numberOfLines={1}>
          {value}
        </Text>
        <Text style={statStyles.label}>{label}</Text>
      </View>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    minWidth: 130,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  col: { flex: 1 },
  value: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 11, color: '#6B7280', marginTop: 1 },
});

// ─── Shift Card ───────────────────────────────────────────────────────────────

function ShiftCard({
  shift,
  isTablet,
  onPress,
}: {
  shift: ShiftListItem;
  isTablet: boolean;
  onPress: () => void;
}) {
  const isOpen = shift.status === 'open';

  return (
    <TouchableOpacity style={cardStyles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={cardStyles.row}>
        <View style={[cardStyles.statusDot, { backgroundColor: isOpen ? '#16A34A' : '#9CA3AF' }]} />
        <View style={{ flex: 1 }}>
          <View style={cardStyles.topRow}>
            <Text style={cardStyles.cashierName} numberOfLines={1}>
              {shift.cashier_name}
            </Text>
            <View style={[cardStyles.badge, isOpen ? cardStyles.badgeOpen : cardStyles.badgeClosed]}>
              <Text style={[cardStyles.badgeText, { color: isOpen ? '#15803D' : '#6B7280' }]}>
                {isOpen ? 'Buka' : 'Tutup'}
              </Text>
            </View>
          </View>
          <Text style={cardStyles.time}>{fmtDateTime(shift.opened_at)}</Text>
          <View style={cardStyles.bottomRow}>
            <View style={cardStyles.metaItem}>
              <Ionicons name="time-outline" size={12} color="#9CA3AF" />
              <Text style={cardStyles.metaText}>{fmtDuration(shift.opened_at, shift.closed_at)}</Text>
            </View>
            {shift.total_sales != null && (
              <View style={cardStyles.metaItem}>
                <Ionicons name="cash-outline" size={12} color="#9CA3AF" />
                <Text style={cardStyles.metaText}>{fmtMoney(shift.total_sales)}</Text>
              </View>
            )}
            {shift.total_transactions != null && (
              <View style={cardStyles.metaItem}>
                <Ionicons name="receipt-outline" size={12} color="#9CA3AF" />
                <Text style={cardStyles.metaText}>{shift.total_transactions} transaksi</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
      </View>
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 2, alignSelf: 'flex-start' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cashierName: { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeOpen: { backgroundColor: '#F0FDF4' },
  badgeClosed: { backgroundColor: '#F3F4F6' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  time: { fontSize: 11, color: '#9CA3AF', marginBottom: 6 },
  bottomRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: '#6B7280' },
});

// ─── Shift Detail Modal ────────────────────────────────────────────────────────

function ShiftDetailModal({
  shiftId,
  onClose,
}: {
  shiftId: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<ShiftDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getShiftDetail(shiftId)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [shiftId]);

  const isOpen = detail?.status === 'open';

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[detailStyles.container, { paddingTop: insets.top }]}>
        <View style={detailStyles.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={detailStyles.headerTitle}>Detail Shift</Text>
          <View style={{ width: 30 }} />
        </View>

        {loading ? (
          <View style={detailStyles.loadingBox}>
            <ActivityIndicator size="large" color="#56B2C1" />
          </View>
        ) : !detail ? (
          <View style={detailStyles.loadingBox}>
            <Text style={{ color: '#9CA3AF', fontSize: 14 }}>Data tidak ditemukan</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Info utama */}
            <View style={detailStyles.infoCard}>
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Kasir</Text>
                <Text style={detailStyles.infoValue}>{detail.cashier_name}</Text>
              </View>
              <View style={detailStyles.divider} />
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Status</Text>
                <View style={[detailStyles.statusChip, isOpen ? detailStyles.chipOpen : detailStyles.chipClosed]}>
                  <Text style={[detailStyles.chipText, { color: isOpen ? '#15803D' : '#6B7280' }]}>
                    {isOpen ? 'Sedang Berlangsung' : 'Selesai'}
                  </Text>
                </View>
              </View>
              <View style={detailStyles.divider} />
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Dibuka</Text>
                <Text style={detailStyles.infoValue}>{fmtDateTime(detail.opened_at)}</Text>
              </View>
              {detail.closed_at && (
                <>
                  <View style={detailStyles.divider} />
                  <View style={detailStyles.infoRow}>
                    <Text style={detailStyles.infoLabel}>Ditutup</Text>
                    <Text style={detailStyles.infoValue}>{fmtDateTime(detail.closed_at)}</Text>
                  </View>
                </>
              )}
              <View style={detailStyles.divider} />
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Durasi</Text>
                <Text style={detailStyles.infoValue}>
                  {fmtDuration(detail.opened_at, detail.closed_at)}
                </Text>
              </View>
              {detail.notes ? (
                <>
                  <View style={detailStyles.divider} />
                  <View style={detailStyles.infoRow}>
                    <Text style={detailStyles.infoLabel}>Catatan</Text>
                    <Text style={[detailStyles.infoValue, { flex: 1, textAlign: 'right' }]}>
                      {detail.notes}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>

            {/* Kas */}
            <Text style={detailStyles.sectionTitle}>Kas</Text>
            <View style={detailStyles.kasGrid}>
              <View style={detailStyles.kasCard}>
                <Text style={detailStyles.kasLabel}>Modal Awal</Text>
                <Text style={detailStyles.kasValue}>{fmtMoney(detail.opening_cash)}</Text>
              </View>
              <View style={detailStyles.kasCard}>
                <Text style={detailStyles.kasLabel}>Kas Akhir</Text>
                <Text style={[detailStyles.kasValue, { color: '#347385' }]}>
                  {detail.closing_cash != null ? fmtMoney(detail.closing_cash) : '-'}
                </Text>
              </View>
            </View>

            {/* Ringkasan penjualan */}
            <Text style={detailStyles.sectionTitle}>Ringkasan Penjualan</Text>
            <View style={detailStyles.summaryGrid}>
              <View style={detailStyles.summaryItem}>
                <Text style={detailStyles.summaryLabel}>Total Penjualan</Text>
                <Text style={[detailStyles.summaryValue, { color: '#347385' }]}>
                  {fmtMoney(detail.summary.totalSales)}
                </Text>
              </View>
              <View style={detailStyles.summaryItem}>
                <Text style={detailStyles.summaryLabel}>Jumlah Transaksi</Text>
                <Text style={detailStyles.summaryValue}>{detail.summary.totalTransactions}</Text>
              </View>
              <View style={detailStyles.summaryItem}>
                <Text style={detailStyles.summaryLabel}>Tunai</Text>
                <Text style={detailStyles.summaryValue}>{fmtMoney(detail.summary.cashSales)}</Text>
              </View>
              <View style={detailStyles.summaryItem}>
                <Text style={detailStyles.summaryLabel}>Transfer</Text>
                <Text style={detailStyles.summaryValue}>
                  {fmtMoney(detail.summary.transferSales)}
                </Text>
              </View>
              <View style={detailStyles.summaryItem}>
                <Text style={detailStyles.summaryLabel}>QRIS</Text>
                <Text style={detailStyles.summaryValue}>{fmtMoney(detail.summary.qrisSales)}</Text>
              </View>
            </View>

            {/* Daftar transaksi */}
            {detail.transactions.length > 0 && (
              <>
                <Text style={detailStyles.sectionTitle}>
                  Transaksi ({detail.transactions.length})
                </Text>
                {detail.transactions.map((trx) => (
                  <View key={trx.id} style={detailStyles.trxRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={detailStyles.trxInvoice}>{trx.invoice_number}</Text>
                      <Text style={detailStyles.trxMeta}>
                        {fmtDateTime(trx.created_at)}
                        {trx.member_name ? `  ·  ${trx.member_name}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={detailStyles.trxAmount}>{fmtMoney(trx.total)}</Text>
                      <Text style={detailStyles.trxMethod}>{trx.payment_method}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const detailStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F7F9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  infoValue: { fontSize: 13, color: '#111827', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#F3F4F6' },
  statusChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  chipOpen: { backgroundColor: '#F0FDF4' },
  chipClosed: { backgroundColor: '#F3F4F6' },
  chipText: { fontSize: 12, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  kasGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kasCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  kasLabel: { fontSize: 11, color: '#9CA3AF', marginBottom: 4 },
  kasValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  summaryGrid: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 13, color: '#6B7280' },
  summaryValue: { fontSize: 13, fontWeight: '700', color: '#111827' },
  trxRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  trxInvoice: { fontSize: 13, fontWeight: '700', color: '#111827' },
  trxMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  trxAmount: { fontSize: 13, fontWeight: '700', color: '#347385' },
  trxMethod: { fontSize: 11, color: '#9CA3AF', textTransform: 'capitalize', marginTop: 2 },
});

// ─── Status filter ─────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'open' | 'closed';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'open', label: 'Berjalan' },
  { key: 'closed', label: 'Selesai' },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BackofficeShiftsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { currentBranch } = useAuthStore();


  const [shifts, setShifts] = useState<ShiftListItem[]>([]);
  const [stats, setStats] = useState<ShiftStats>({
    totalShifts: 0,
    openShifts: 0,
    closedShifts: 0,
    totalSales: 0,
    totalTransactions: 0,
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      if (!currentBranch) {
        setLoading(false);
        return;
      }
      try {
        await ensureShiftTable();
        const [shiftData, statsData] = await Promise.all([
          getShiftsByBranch(currentBranch.id, {
            limit: 100,
            status: statusFilter === 'all' ? 'all' : statusFilter,
          }),
          getShiftStats(currentBranch.id),
        ]);
        setShifts(shiftData);
        setStats(statsData);
      } catch {
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentBranch, statusFilter]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  const numCols = isTablet ? 2 : 1;

  return (
    <View style={styles.container}>
      <BackofficeHeader
        title="Manajemen Shift"
        subtitle={stats.openShifts > 0 ? `${stats.openShifts} shift berjalan` : undefined}
      />

      <TabletCenteredView style={{ backgroundColor: '#F0F7F9' }}>
        {/* Stats */}
        <View style={styles.statsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10, alignItems: 'center' }}
          >
            <StatCard label="Total Shift" value={stats.totalShifts} icon="time-outline" color="#347385" />
            <StatCard label="Berjalan" value={stats.openShifts} icon="radio-button-on" color="#16A34A" />
            <StatCard label="Selesai" value={stats.closedShifts} icon="checkmark-circle-outline" color="#9CA3AF" />
            <StatCard label="Total Penjualan" value={fmtMoney(stats.totalSales)} icon="cash-outline" color="#56B2C1" />
            <StatCard label="Total Transaksi" value={stats.totalTransactions} icon="receipt-outline" color="#E69738" />
          </ScrollView>
        </View>

        {/* Status filter */}
        <View style={styles.filterWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
          >
            {STATUS_FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, statusFilter === f.key && styles.chipActive]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text style={[styles.chipText, statusFilter === f.key && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#56B2C1" />
          </View>
        ) : shifts.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="time-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>Belum ada shift</Text>
            <Text style={styles.emptyDesc}>Shift akan muncul setelah kasir buka shift</Text>
          </View>
        ) : (
          <FlatList
            data={shifts}
            keyExtractor={(item) => item.id}
            numColumns={numCols}
            key={String(numCols)}
            contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 24 }}
            columnWrapperStyle={numCols > 1 ? { paddingHorizontal: 8 } : undefined}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#56B2C1" />
            }
            renderItem={({ item }) => (
              <View style={numCols > 1 ? { flex: 1, paddingHorizontal: 8 } : {}}>
                <ShiftCard
                  shift={item}
                  isTablet={isTablet}
                  onPress={() => setSelectedShiftId(item.id)}
                />
              </View>
            )}
          />
        )}
      </TabletCenteredView>

      {selectedShiftId && (
        <ShiftDetailModal
          shiftId={selectedShiftId}
          onClose={() => setSelectedShiftId(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F7F9' },
  statsWrap: { height: 90, justifyContent: 'center', paddingVertical: 12 },
  filterWrap: {
    height: 40,
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  chipActive: { backgroundColor: '#347385' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingTop: 60,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },
  emptyDesc: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', maxWidth: 260 },
});
