import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { formatCurrency } from '@/constants/config';

const METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  qris: 'QRIS',
  split: 'Campuran',
  delivery: 'Delivery',
};

export interface ReceiptImageData {
  storeName: string;
  storeAddress?: string | null;
  storePhone?: string | null;
  cashierName?: string;
  invoiceNumber: string;
  createdAt: string;
  items: { name: string; qty: number; price: number; discountAmount?: number; subtotal: number }[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  deliveryFee?: number;
  total: number;
  paymentMethod: string;
  paymentAmount: number;
  changeAmount: number;
  memberName?: string | null;
  pointsEarned?: number | null;
  splitPayment?: { cashAmount: number; secondMethod: string; secondAmount: number } | null;
  qrisContent?: string | null;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return iso; }
}

const DIV = '- - - - - - - - - - - - - - - - -';

interface Props {
  data: ReceiptImageData;
}

export default function ReceiptImageView({ data }: Props) {
  const isSplit = !!data.splitPayment;
  const isDelivery = (data.deliveryFee ?? 0) > 0;
  const hasQris = !!data.qrisContent && (
    data.paymentMethod === 'qris' ||
    (isSplit && data.splitPayment?.secondMethod === 'qris')
  );

  return (
    <View style={styles.wrapper}>
      {/* Logo Pekoshop */}
      <Image
        source={require('@/assets/logo-baru2.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* Header toko */}
      <Text style={styles.storeName}>{data.storeName}</Text>
      {data.storeAddress ? <Text style={styles.storeMeta}>{data.storeAddress}</Text> : null}
      {data.storePhone ? <Text style={styles.storeMeta}>{data.storePhone}</Text> : null}

      <Text style={styles.divider}>{DIV}</Text>

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Invoice</Text>
        <Text style={styles.infoValue}>{data.invoiceNumber}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Tanggal</Text>
        <Text style={styles.infoValue}>{formatDateTime(data.createdAt)}</Text>
      </View>
      {data.cashierName ? (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Kasir</Text>
          <Text style={styles.infoValue}>{data.cashierName}</Text>
        </View>
      ) : null}

      <Text style={styles.divider}>{DIV}</Text>

      {/* Items */}
      {data.items.map((item, i) => (
        <View key={i} style={styles.itemBlock}>
          <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.itemRow}>
            <Text style={styles.itemQtyPrice}>
              {item.qty} x {formatCurrency(item.price)}
              {(item.discountAmount ?? 0) > 0 ? `  -${formatCurrency(item.discountAmount ?? 0)}` : ''}
            </Text>
            <Text style={styles.itemSubtotal}>{formatCurrency(item.subtotal)}</Text>
          </View>
        </View>
      ))}

      <Text style={styles.divider}>{DIV}</Text>

      {/* Subtotal / diskon / pajak / ongkir */}
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Subtotal</Text>
        <Text style={styles.infoValue}>{formatCurrency(data.subtotal)}</Text>
      </View>
      {data.discountAmount > 0 && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Diskon</Text>
          <Text style={[styles.infoValue, { color: '#DC2626' }]}>-{formatCurrency(data.discountAmount)}</Text>
        </View>
      )}
      {data.taxAmount > 0 && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Pajak</Text>
          <Text style={styles.infoValue}>{formatCurrency(data.taxAmount)}</Text>
        </View>
      )}
      {isDelivery && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ongkir</Text>
          <Text style={styles.infoValue}>{formatCurrency(data.deliveryFee ?? 0)}</Text>
        </View>
      )}

      <Text style={styles.divider}>{DIV}</Text>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={styles.totalValue}>{formatCurrency(data.total)}</Text>
      </View>

      <Text style={styles.divider}>{DIV}</Text>

      {/* Pembayaran */}
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Metode</Text>
        <Text style={styles.infoValue}>{METHOD_LABELS[data.paymentMethod] || data.paymentMethod}</Text>
      </View>
      {isSplit && data.splitPayment ? (
        <>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { paddingLeft: 12 }]}>Tunai</Text>
            <Text style={styles.infoValue}>{formatCurrency(data.splitPayment.cashAmount)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { paddingLeft: 12 }]}>
              {METHOD_LABELS[data.splitPayment.secondMethod] || data.splitPayment.secondMethod}
            </Text>
            <Text style={styles.infoValue}>{formatCurrency(data.splitPayment.secondAmount)}</Text>
          </View>
          {data.changeAmount > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Kembalian</Text>
              <Text style={[styles.infoValue, { color: '#16A34A', fontWeight: '700' }]}>{formatCurrency(data.changeAmount)}</Text>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Bayar</Text>
            <Text style={styles.infoValue}>{formatCurrency(data.paymentAmount)}</Text>
          </View>
          {data.changeAmount > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Kembalian</Text>
              <Text style={[styles.infoValue, { color: '#16A34A', fontWeight: '700' }]}>{formatCurrency(data.changeAmount)}</Text>
            </View>
          )}
        </>
      )}

      {/* Member */}
      {data.memberName ? (
        <>
          <Text style={styles.divider}>{DIV}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Member</Text>
            <Text style={styles.infoValue}>{data.memberName}</Text>
          </View>
          {(data.pointsEarned ?? 0) > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Poin +</Text>
              <Text style={[styles.infoValue, { color: '#D97706', fontWeight: '700' }]}>{data.pointsEarned}</Text>
            </View>
          )}
        </>
      ) : null}

      {hasQris && (
        <>
          <Text style={styles.divider}>{DIV}</Text>
          <Text style={styles.qrisLabel}>Scan QRIS untuk pembayaran</Text>
          <View style={styles.qrisWrap}>
            <QRCode value={data.qrisContent!} size={180} backgroundColor="white" />
          </View>
        </>
      )}

      <Text style={styles.divider}>{DIV}</Text>
      <Text style={styles.footer}>Terima kasih telah berbelanja!</Text>
      <Text style={styles.poweredBy}>Powered by Qasio POS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
    width: 320,
  },
  logo: {
    width: 120,
    height: 48,
    alignSelf: 'center',
    marginBottom: 10,
  },
  storeName: {
    fontSize: 17, fontWeight: '800', color: '#111827',
    textAlign: 'center', marginBottom: 2,
  },
  storeMeta: {
    fontSize: 11, color: '#6B7280', textAlign: 'center', lineHeight: 16,
  },
  divider: {
    fontSize: 11, color: '#D1D5DB', textAlign: 'center',
    marginVertical: 8, letterSpacing: 1,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 4,
  },
  infoLabel: { fontSize: 12, color: '#6B7280', flex: 1 },
  infoValue: { fontSize: 12, color: '#111827', fontWeight: '600', textAlign: 'right', flex: 1 },

  itemBlock: { marginBottom: 6 },
  itemName: { fontSize: 12, color: '#111827', fontWeight: '600' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  itemQtyPrice: { fontSize: 11, color: '#6B7280' },
  itemSubtotal: { fontSize: 12, color: '#111827', fontWeight: '600' },

  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { fontSize: 15, fontWeight: '800', color: '#111827' },
  totalValue: { fontSize: 18, fontWeight: '800', color: '#347385' },

  qrisLabel: {
    fontSize: 11, color: '#CC1414', fontWeight: '700',
    textAlign: 'center', marginTop: 6, marginBottom: 8,
  },
  qrisWrap: { alignItems: 'center', marginBottom: 4 },

  footer: {
    fontSize: 13, fontWeight: '700', color: '#347385',
    textAlign: 'center', marginTop: 4,
  },
  poweredBy: {
    fontSize: 10, color: '#D1D5DB', textAlign: 'center', marginTop: 6,
  },
});
