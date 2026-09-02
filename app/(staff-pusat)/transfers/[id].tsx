/**
 * Detail Distribusi Stok
 * Role: staff_pusat
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getStockTransferDetail,
  sendStockTransfer,
  type StockTransferHeader,
  type StockTransferItemRow,
} from '@/lib/warehouseQueries';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const isReceived = status === 'received';
  const isSent = status === 'sent';
  const badgeStyle = isReceived ? styles.badgeReceived : isSent ? styles.badgeSent : styles.badgeDraft;
  const dotStyle = isReceived ? styles.badgeDotReceived : isSent ? styles.badgeDotSent : styles.badgeDotDraft;
  const textStyle = isReceived ? styles.badgeTextReceived : isSent ? styles.badgeTextSent : styles.badgeTextDraft;
  const label = isReceived ? 'Diterima Cabang' : isSent ? 'Terkirim' : 'Draft';
  return (
    <View style={[styles.badge, badgeStyle]}>
      <View style={[styles.badgeDot, dotStyle]} />
      <Text style={[styles.badgeText, textStyle]}>{label}</Text>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon} size={16} color="#718096" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TransferDetailScreen() {
  const { id, fromProduct } = useLocalSearchParams<{ id: string; fromProduct?: string }>();
  const handleBack = () => fromProduct ? router.push(`/(staff-pusat)/products/${fromProduct}` as any) : router.back();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [header, setHeader] = useState<StockTransferHeader | null>(null);
  const [items, setItems] = useState<StockTransferItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const { header: h, items: i } = await getStockTransferDetail(id);
      setHeader(h);
      setItems(i);
    } catch (err: any) {
      setError(err.message ?? 'Gagal memuat detail');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSend = () => {
    if (!header) return;
    Alert.alert(
      'Kirim Distribusi',
      `Stok akan dikurangi dari gudang dan dikirim ke ${header.branch_name}. Tindakan ini tidak dapat dibatalkan. Lanjutkan?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Kirim',
          onPress: async () => {
            try {
              setSending(true);
              await sendStockTransfer(header.id);
              setHeader((prev) => prev ? { ...prev, status: 'sent', sent_at: new Date().toISOString() } : prev);
              Alert.alert('Berhasil', `Distribusi berhasil dikirim ke ${header.branch_name}`);
            } catch (err: any) {
              Alert.alert('Gagal', err.message ?? 'Gagal mengirim distribusi');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A202C" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Detail Distribusi</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color="#347385" />
          <Text style={styles.loadingText}>Memuat detail...</Text>
        </View>
      </View>
    );
  }

  if (error || !header) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A202C" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Detail Distribusi</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={styles.errorText}>{error ?? 'Data tidak ditemukan'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryBtnText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Distribusi ke {header.branch_name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && styles.scrollContentTablet,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Banner */}
        <View style={[
          styles.statusBanner,
          header.status === 'received' ? styles.statusBannerReceived :
          header.status === 'sent' ? styles.statusBannerSent : styles.statusBannerDraft
        ]}>
          <StatusBadge status={header.status} />
          {header.sent_at && (
            <Text style={styles.sentAtText}>Dikirim: {fmtDate(header.sent_at)}</Text>
          )}
          {header.status === 'received' && header.received_at && (
            <Text style={styles.sentAtText}>Diterima: {fmtDate(header.received_at)}</Text>
          )}
        </View>

        {/* Info Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Informasi Transfer</Text>
          <InfoRow icon="business-outline" label="Cabang Tujuan" value={header.branch_name} />
          <View style={styles.divider} />
          <InfoRow icon="calendar-outline" label="Tanggal Dibuat" value={fmtDate(header.created_at)} />
          <View style={styles.divider} />
          <InfoRow icon="person-outline" label="Dibuat Oleh" value={header.created_by_name} />
          {header.notes && (
            <>
              <View style={styles.divider} />
              <InfoRow icon="document-text-outline" label="Catatan" value={header.notes} />
            </>
          )}
        </View>

        {/* Summary Chips */}
        <View style={styles.chipsRow}>
          <View style={styles.chip}>
            <Ionicons name="layers-outline" size={14} color="#347385" />
            <Text style={styles.chipText}>{items.length} jenis produk</Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="cube-outline" size={14} color="#347385" />
            <Text style={styles.chipText}>{totalQty} total unit</Text>
          </View>
        </View>

        {/* Products Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Daftar Produk</Text>
          {items.length === 0 ? (
            <View style={styles.emptyItems}>
              <Text style={styles.emptyItemsText}>Tidak ada produk</Text>
            </View>
          ) : (
            items.map((item, idx) => (
              <View key={item.id}>
                {idx > 0 && <View style={styles.divider} />}
                <View style={styles.productRow}>
                  <View style={styles.productNumWrap}>
                    <Text style={styles.productNum}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName}>{item.product_name}</Text>
                  </View>
                  <View style={styles.qtyBadge}>
                    <Text style={styles.qtyBadgeText}>{item.quantity}</Text>
                  </View>
                </View>
              </View>
            ))
          )}

          {items.length > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Unit</Text>
              <Text style={styles.totalValue}>{totalQty}</Text>
            </View>
          )}
        </View>

        {/* Send Button (only for draft) */}
        {header.status === 'draft' && (
          <TouchableOpacity
            style={[styles.sendBtn, sending && styles.btnDisabled]}
            onPress={handleSend}
            disabled={sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#fff" />
                <Text style={styles.sendBtnText}>Kirim ke Cabang</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#1A202C',
    textAlign: 'center',
  },

  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 48,
  },
  scrollContentTablet: {
    maxWidth: 680,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },

  // Status Banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBannerSent: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  statusBannerDraft: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
  statusBannerReceived: { backgroundColor: '#EEF8FA', borderColor: '#A9DFE9' },
  sentAtText: { fontSize: 12, color: '#15803D', fontWeight: '500' },

  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeSent: { backgroundColor: '#DCFCE7' },
  badgeDraft: { backgroundColor: '#FEF3C7' },
  badgeReceived: { backgroundColor: '#EEF8FA' },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeDotSent: { backgroundColor: '#22C55E' },
  badgeDotDraft: { backgroundColor: '#F59E0B' },
  badgeDotReceived: { backgroundColor: '#347385' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  badgeTextSent: { color: '#15803D' },
  badgeTextReceived: { color: '#347385' },
  badgeTextDraft: { color: '#B45309' },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1A202C' },

  // Info row
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: '#F7FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  infoLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#1A202C', fontWeight: '500' },

  divider: { height: 1, backgroundColor: '#F3F4F6' },

  // Chips
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF8FA',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#A7D4DC',
  },
  chipText: { fontSize: 13, color: '#347385', fontWeight: '600' },

  // Product row
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  productNumWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F7FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  productNum: { fontSize: 11, fontWeight: '700', color: '#718096' },
  productName: { fontSize: 14, fontWeight: '600', color: '#1A202C' },
  qtyBadge: {
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#EEF8FA',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7D4DC',
  },
  qtyBadgeText: { fontSize: 14, fontWeight: '700', color: '#347385' },

  // Total
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  totalLabel: { fontSize: 14, color: '#718096', fontWeight: '500' },
  totalValue: { fontSize: 16, fontWeight: '800', color: '#347385' },

  // Empty items
  emptyItems: { alignItems: 'center', paddingVertical: 16 },
  emptyItemsText: { fontSize: 13, color: '#A0AEC0' },

  // Send button
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#347385',
    paddingVertical: 16,
    borderRadius: 14,
  },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  // Center
  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  loadingText: { fontSize: 14, color: '#718096' },
  errorText: { fontSize: 14, color: '#EF4444', textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#347385',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
