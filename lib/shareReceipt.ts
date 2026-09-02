import { Linking, Share } from 'react-native';
import { formatCurrency } from '@/constants/config';

const METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  qris: 'QRIS',
  split: 'Campuran',
  delivery: 'Delivery',
};

export interface ShareReceiptOptions {
  storeName: string;
  storeAddress?: string | null;
  invoiceNumber: string;
  createdAt: string;
  items: { name: string; qty: number; price: number; subtotal: number }[];
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
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

export function buildReceiptText(opts: ShareReceiptOptions): string {
  const div = '--------------------------------';
  const lines: string[] = [];

  lines.push(opts.storeName);
  if (opts.storeAddress) lines.push(opts.storeAddress);
  lines.push(div);
  lines.push(`Invoice : ${opts.invoiceNumber}`);
  lines.push(`Tanggal : ${formatDateTime(opts.createdAt)}`);
  lines.push(div);

  for (const item of opts.items) {
    lines.push(item.name);
    lines.push(`  ${item.qty} x ${formatCurrency(item.price)} = ${formatCurrency(item.subtotal)}`);
  }

  lines.push(div);
  lines.push(`Subtotal  : ${formatCurrency(opts.subtotal)}`);
  if (opts.discountAmount > 0) {
    lines.push(`Diskon    : -${formatCurrency(opts.discountAmount)}`);
  }
  if (opts.taxAmount > 0) {
    lines.push(`Pajak     : ${formatCurrency(opts.taxAmount)}`);
  }
  if ((opts.deliveryFee ?? 0) > 0) {
    lines.push(`Ongkir    : ${formatCurrency(opts.deliveryFee ?? 0)}`);
  }
  lines.push(`TOTAL     : ${formatCurrency(opts.total)}`);
  lines.push(div);
  lines.push(`Metode    : ${METHOD_LABELS[opts.paymentMethod] || opts.paymentMethod}`);

  if (opts.splitPayment) {
    lines.push(`  Tunai   : ${formatCurrency(opts.splitPayment.cashAmount)}`);
    const m2 = METHOD_LABELS[opts.splitPayment.secondMethod] || opts.splitPayment.secondMethod;
    lines.push(`  ${m2.padEnd(8)}: ${formatCurrency(opts.splitPayment.secondAmount)}`);
    if (opts.changeAmount > 0) {
      lines.push(`Kembalian : ${formatCurrency(opts.changeAmount)}`);
    }
  } else {
    lines.push(`Bayar     : ${formatCurrency(opts.paymentAmount)}`);
    if (opts.changeAmount > 0) {
      lines.push(`Kembalian : ${formatCurrency(opts.changeAmount)}`);
    }
  }

  if (opts.memberName) {
    lines.push(div);
    lines.push(`Member    : ${opts.memberName}`);
    if ((opts.pointsEarned ?? 0) > 0) {
      lines.push(`Poin +    : ${opts.pointsEarned}`);
    }
  }

  lines.push(div);
  lines.push('Terima kasih telah berbelanja!');

  return lines.join('\n');
}

export async function shareToWhatsApp(text: string): Promise<void> {
  const encoded = encodeURIComponent(text);
  const waUrl = `whatsapp://send?text=${encoded}`;
  const canOpen = await Linking.canOpenURL(waUrl);
  if (canOpen) {
    await Linking.openURL(waUrl);
  } else {
    await Share.share({ message: text });
  }
}
