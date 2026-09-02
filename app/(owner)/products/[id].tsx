import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, useWindowDimensions, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/constants/config';

interface ProductDetail {
  id: string;
  name: string;
  barcode: string | null;
  price: number;
  cost_price: number | null;
  unit: string | null;
  image_url: string | null;
  is_active: boolean;
  category_name: string | null;
  promo_price: number | null;
  promo_start: string | null;
  promo_end: string | null;
}

interface BranchStock {
  branch_id: string;
  branch_name: string;
  stock: number;
  min_stock: number;
}

interface WarehouseStock {
  warehouse_name: string;
  stock: number;
  min_stock: number;
}

interface StockEvent {
  date: string;
  type: 'po' | 'transfer' | 'sale';
  label: string;
  qty: number;
  note: string | null;
  targetId: string; // po_id, transfer_id, atau transaction_id
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return iso; }
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [branchStocks, setBranchStocks] = useState<BranchStock[]>([]);
  const [warehouseStock, setWarehouseStock] = useState<WarehouseStock | null>(null);
  const [stockEvents, setStockEvents] = useState<StockEvent[]>([]);
  const [recentTx, setRecentTx] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stock' | 'history' | 'flow'>('stock');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Product info
      const { data: p } = await supabase
        .from('products')
        .select('*, categories!category_id(name)')
        .eq('id', id)
        .single();
      if (p) setProduct({ ...p, category_name: (p as any).categories?.name ?? null });

      // Branch stocks
      const { data: bp } = await supabase
        .from('branch_products')
        .select('branch_id, stock, min_stock, branches!branch_id(name)')
        .eq('product_id', id);
      setBranchStocks((bp ?? []).map((r: any) => ({
        branch_id: r.branch_id,
        branch_name: r.branches?.name ?? '-',
        stock: r.stock ?? 0,
        min_stock: r.min_stock ?? 5,
      })));

      // Warehouse stock
      const { data: ws } = await supabase
        .from('warehouse_stock')
        .select('stock, min_stock, warehouse!warehouse_id(name)')
        .eq('product_id', id)
        .single();
      if (ws) setWarehouseStock({
        warehouse_name: (ws as any).warehouse?.name ?? 'Gudang',
        stock: ws.stock ?? 0,
        min_stock: ws.min_stock ?? 0,
      });

      // PO events
      const { data: poItems } = await supabase
        .from('purchase_order_items')
        .select('po_id, quantity, created_at, purchase_orders!po_id(id, supplier_name, status, received_at)')
        .eq('product_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      const poEvents: StockEvent[] = (poItems ?? []).map((r: any) => ({
        date: r.purchase_orders?.received_at ?? r.created_at,
        type: 'po' as const,
        label: `PO dari ${r.purchase_orders?.supplier_name ?? 'Supplier'}`,
        qty: r.quantity ?? 0,
        note: r.purchase_orders?.status === 'received' ? 'Diterima' : r.purchase_orders?.status ?? null,
        targetId: r.po_id,
      }));

      // Transfer events
      const { data: trItems } = await supabase
        .from('stock_transfer_items')
        .select('transfer_id, quantity, quantity_received, created_at, stock_transfers!transfer_id(id, branch_id, status, sent_at, received_at, branches!branch_id(name))')
        .eq('product_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      const trEvents: StockEvent[] = (trItems ?? []).map((r: any) => {
        const tr = (r as any).stock_transfers;
        return {
          date: tr?.sent_at ?? r.created_at,
          type: 'transfer' as const,
          label: `Distribusi ke ${tr?.branches?.name ?? 'Cabang'}`,
          qty: r.quantity ?? 0,
          note: tr?.status === 'received' ? `Diterima ${r.quantity_received ?? r.quantity}` : tr?.status ?? null,
          targetId: r.transfer_id,
        };
      });

      // Sale events (recent transaction items)
      const { data: txItems } = await supabase
        .from('transaction_items')
        .select('transaction_id, quantity, subtotal, created_at, transactions!transaction_id(id, invoice_number, status, branches!branch_id(name))')
        .eq('product_id', id)
        .order('created_at', { ascending: false })
        .limit(10);

      setRecentTx(txItems ?? []);

      const saleEvents: StockEvent[] = (txItems ?? []).map((r: any) => {
        const tx = (r as any).transactions;
        return {
          date: r.created_at,
          type: 'sale' as const,
          label: `Terjual di ${tx?.branches?.name ?? 'Cabang'}`,
          qty: r.quantity ?? 0,
          note: tx?.invoice_number ?? null,
          targetId: r.transaction_id,
        };
      });

      const allEvents = [...poEvents, ...trEvents, ...saleEvents]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setStockEvents(allEvents);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const totalStock = (warehouseStock?.stock ?? 0) + branchStocks.reduce((s, b) => s + b.stock, 0);

  const navigateEvent = (e: StockEvent) => {
    // Owner hanya bisa lihat detail transaksi, tidak punya halaman PO/transfer
    if (e.type === 'sale') router.push(`/(owner)/transactions/${e.targetId}?fromProduct=${id}` as any);
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#347385" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#9CA3AF' }}>Produk tidak ditemukan</Text>
      </View>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const promoActive = product.promo_price && product.promo_start && product.promo_end
    && today >= product.promo_start && today <= product.promo_end;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{product.name}</Text>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => router.push(`/(owner)/products/form?id=${id}` as any)}
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* Info produk */}
        <View style={styles.productCard}>
          <View style={styles.productCardLeft}>
            {product.image_url ? (
              <Image source={{ uri: product.image_url }} style={styles.productImage} resizeMode="cover" />
            ) : (
              <View style={styles.productImagePlaceholder}>
                <Text style={styles.productImageInitial}>{product.name.substring(0, 2).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View style={styles.productCardRight}>
            <Text style={styles.productName}>{product.name}</Text>
            {product.category_name && <Text style={styles.productCategory}>{product.category_name}</Text>}
            {product.barcode && <Text style={styles.productBarcode}>{product.barcode}</Text>}
            <View style={styles.priceRow}>
              <Text style={styles.productPrice}>{formatCurrency(product.price)}</Text>
              {promoActive && (
                <View style={styles.promoBadge}>
                  <Text style={styles.promoBadgeText}>PROMO {formatCurrency(product.promo_price!)}</Text>
                </View>
              )}
            </View>
            {product.cost_price ? (
              <Text style={styles.productCost}>HPP: {formatCurrency(product.cost_price)}</Text>
            ) : null}
          </View>
        </View>

        {/* Total stok highlight */}
        <View style={styles.totalStockCard}>
          <Text style={styles.totalStockLabel}>Total Stok Keseluruhan</Text>
          <Text style={styles.totalStockValue}>{totalStock}</Text>
          <Text style={styles.totalStockUnit}>{product.unit ?? 'pcs'}</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {([
            { key: 'stock', label: 'Stok', icon: 'cube-outline' },
            { key: 'history', label: 'Transaksi', icon: 'receipt-outline' },
            { key: 'flow', label: 'Alur Stok', icon: 'git-network-outline' },
          ] as const).map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, activeTab === t.key && styles.tabActive]}
              onPress={() => setActiveTab(t.key)}
            >
              <Ionicons name={t.icon} size={16} color={activeTab === t.key ? '#347385' : '#9CA3AF'} />
              <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab: Stok */}
        {activeTab === 'stock' && (
          <View style={styles.section}>
            {/* Gudang */}
            {warehouseStock && (
              <View style={styles.stockCard}>
                <View style={styles.stockCardLeft}>
                  <Ionicons name="business-outline" size={18} color="#347385" />
                  <View>
                    <Text style={styles.stockLocationName}>{warehouseStock.warehouse_name}</Text>
                    <Text style={styles.stockLocationTag}>Gudang Pusat</Text>
                  </View>
                </View>
                <View style={styles.stockCardRight}>
                  <Text style={[styles.stockQty, { color: warehouseStock.stock === 0 ? '#EF4444' : '#347385' }]}>
                    {warehouseStock.stock}
                  </Text>
                  <Text style={styles.stockUnit}>{product.unit ?? 'pcs'}</Text>
                </View>
              </View>
            )}

            {/* Divider */}
            <Text style={styles.sectionLabel}>Stok per Cabang</Text>

            {branchStocks.length === 0 ? (
              <Text style={styles.emptyText}>Belum ada stok di cabang</Text>
            ) : (
              branchStocks.map((b) => {
                const isLow = b.stock > 0 && b.stock <= b.min_stock;
                const isEmpty = b.stock === 0;
                return (
                  <View key={b.branch_id} style={styles.stockCard}>
                    <View style={styles.stockCardLeft}>
                      <Ionicons name="storefront-outline" size={18} color="#6B7280" />
                      <View>
                        <Text style={styles.stockLocationName}>{b.branch_name}</Text>
                        <Text style={styles.stockLocationTag}>Min: {b.min_stock}</Text>
                      </View>
                    </View>
                    <View style={styles.stockCardRight}>
                      <Text style={[styles.stockQty, { color: isEmpty ? '#EF4444' : isLow ? '#F59E0B' : '#22C55E' }]}>
                        {b.stock}
                      </Text>
                      <Text style={styles.stockUnit}>{product.unit ?? 'pcs'}</Text>
                      {isEmpty && <View style={styles.badge}><Text style={[styles.badgeText, { color: '#EF4444' }]}>Habis</Text></View>}
                      {isLow && <View style={[styles.badge, { borderColor: '#F59E0B' }]}><Text style={[styles.badgeText, { color: '#F59E0B' }]}>Kritis</Text></View>}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Tab: Transaksi */}
        {activeTab === 'history' && (
          <View style={styles.section}>
            {recentTx.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
                <Text style={styles.emptyText}>Belum ada transaksi</Text>
              </View>
            ) : (
              recentTx.map((r: any, i) => {
                const tx = r.transactions;
                return (
                  <TouchableOpacity
                    key={i}
                    style={styles.txCard}
                    onPress={() => router.push(`/(owner)/transactions/${r.transaction_id}?fromProduct=${id}` as any)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.txIconWrap}>
                      <Ionicons name="cart-outline" size={18} color="#DC2626" />
                    </View>
                    <View style={styles.txBody}>
                      <Text style={styles.txInvoice} numberOfLines={1}>{tx?.invoice_number ?? '-'}</Text>
                      <Text style={styles.txMeta}>{tx?.branches?.name ?? '-'} · {fmtDate(r.created_at)}</Text>
                    </View>
                    <View style={styles.txRight}>
                      <Text style={styles.txQty}>-{r.quantity}</Text>
                      <Text style={styles.txAmount}>{formatCurrency(r.subtotal)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DB" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* Tab: Alur Stok */}
        {activeTab === 'flow' && (
          <View style={styles.section}>
            {stockEvents.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="git-network-outline" size={40} color="#D1D5DB" />
                <Text style={styles.emptyText}>Belum ada riwayat stok</Text>
              </View>
            ) : (
              stockEvents.map((e, i) => {
                const isPo = e.type === 'po';
                const isTransfer = e.type === 'transfer';
                const isSale = e.type === 'sale';
                const iconColor = isPo ? '#16A34A' : isTransfer ? '#347385' : '#DC2626';
                const iconBg = isPo ? '#F0FDF4' : isTransfer ? '#EEF8FA' : '#FEF2F2';
                const iconBorder = isPo ? '#86EFAC' : isTransfer ? '#A9DFE9' : '#FECACA';
                const icon = isPo ? 'arrow-down-circle-outline' : isTransfer ? 'swap-horizontal-outline' : 'cart-outline';
                const typeLabel = isPo ? 'Purchase Order' : isTransfer ? 'Distribusi' : 'Terjual';
                const typeColor = isPo ? '#16A34A' : isTransfer ? '#347385' : '#DC2626';
                const typeBg = isPo ? '#F0FDF4' : isTransfer ? '#EEF8FA' : '#FEF2F2';
                const sign = isSale ? '-' : '+';
                const qtyColor = isSale ? '#DC2626' : '#16A34A';
                const isLast = i === stockEvents.length - 1;
                return (
                  <View key={i} style={styles.flowRow}>
                    {/* Ikon + garis */}
                    <View style={styles.flowLeft}>
                      <View style={[styles.flowIcon, { backgroundColor: iconBg, borderColor: iconBorder }]}>
                        <Ionicons name={icon as any} size={15} color={iconColor} />
                      </View>
                      {!isLast && <View style={styles.flowLine} />}
                    </View>
                    {/* Konten — klikable */}
                    <TouchableOpacity
                      style={[styles.flowCard, isLast && { marginBottom: 0 }]}
                      onPress={() => navigateEvent(e)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.flowCardTop}>
                        <View style={[styles.flowTypeBadge, { backgroundColor: typeBg }]}>
                          <Text style={[styles.flowTypeText, { color: typeColor }]}>{typeLabel}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.flowQty, { color: qtyColor }]}>{sign}{e.qty}</Text>
                          <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
                        </View>
                      </View>
                      <Text style={styles.flowLabel} numberOfLines={1}>{e.label}</Text>
                      <Text style={styles.flowDate}>{fmtDate(e.date)}</Text>
                      {e.note && (
                        <View style={styles.flowNotePill}>
                          <Text style={styles.flowNoteText}>{e.note}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#347385', paddingHorizontal: 16, paddingBottom: 12, paddingTop: 6,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  editBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  productCard: {
    flexDirection: 'row', gap: 14,
    backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  productCardLeft: {},
  productImage: { width: 80, height: 80, borderRadius: 12 },
  productImagePlaceholder: {
    width: 80, height: 80, borderRadius: 12,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  productImageInitial: { fontSize: 22, fontWeight: '800', color: '#347385' },
  productCardRight: { flex: 1, gap: 3 },
  productName: { fontSize: 15, fontWeight: '800', color: '#111827' },
  productCategory: { fontSize: 12, color: '#6B7280' },
  productBarcode: { fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  productPrice: { fontSize: 16, fontWeight: '800', color: '#347385' },
  promoBadge: { backgroundColor: '#FEF2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  promoBadgeText: { fontSize: 10, fontWeight: '700', color: '#DC2626' },
  productCost: { fontSize: 11, color: '#9CA3AF' },

  totalStockCard: {
    backgroundColor: '#347385', marginHorizontal: 16, borderRadius: 14,
    padding: 16, alignItems: 'center', gap: 2, marginBottom: 16,
  },
  totalStockLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  totalStockValue: { fontSize: 40, fontWeight: '800', color: '#fff' },
  totalStockUnit: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },

  tabRow: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 9 },
  tabActive: { backgroundColor: '#EEF8FA' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  tabTextActive: { color: '#347385' },

  section: { paddingHorizontal: 16, gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 4 },

  stockCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  stockCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stockLocationName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  stockLocationTag: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  stockCardRight: { alignItems: 'flex-end', gap: 2 },
  stockQty: { fontSize: 22, fontWeight: '800' },
  stockUnit: { fontSize: 11, color: '#9CA3AF' },
  badge: { borderWidth: 1, borderColor: '#FECACA', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  // Transaksi card
  txCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 0.5, borderColor: '#E5E7EB',
  },
  txIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center',
  },
  txBody: { flex: 1, minWidth: 0 },
  txInvoice: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 2 },
  txMeta: { fontSize: 12, color: '#6B7280' },
  txRight: { alignItems: 'flex-end' },
  txQty: { fontSize: 15, fontWeight: '700', color: '#DC2626' },
  txAmount: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  // Alur stok
  flowRow: { flexDirection: 'row', gap: 12, marginBottom: 0 },
  flowLeft: { alignItems: 'center', width: 32 },
  flowIcon: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, flexShrink: 0,
  },
  flowLine: { flex: 1, width: 1.5, backgroundColor: '#E5E7EB', marginVertical: 4 },
  flowCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderWidth: 0.5, borderColor: '#E5E7EB', marginBottom: 10,
  },
  flowCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  flowTypeBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  flowTypeText: { fontSize: 11, fontWeight: '700' },
  flowQty: { fontSize: 15, fontWeight: '700' },
  flowLabel: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 2 },
  flowDate: { fontSize: 11, color: '#9CA3AF' },
  flowNotePill: {
    marginTop: 6, alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  flowNoteText: { fontSize: 11, color: '#6B7280' },

  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 13, color: '#9CA3AF' },
});
