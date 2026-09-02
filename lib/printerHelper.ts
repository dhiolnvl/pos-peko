/**
 * Printer Helper
 * Builds plain-text ESC/POS-style receipt strings and shares them.
 * When a real thermal library (e.g. react-native-thermal-receipt-printer)
 * is added, replace the `printReceipt` implementation below.
 */

import * as FileSystem from 'expo-file-system';
import { Share } from 'react-native';
import { APP_NAME } from '@/constants/config';
import { mmkv, StorageKeys } from '@/lib/mmkvStorage';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PrinterType = 'bluetooth' | 'network' | 'none';

export interface PrinterConfig {
  type: PrinterType;
  bluetoothAddress?: string;
  bluetoothName?: string;
  networkIp?: string;
  networkPort?: number;
  paperWidth?: 32 | 48; // chars per line
}

export interface PrintReceiptOptions {
  storeName: string;
  storeAddress?: string | null;
  storePhone?: string | null;
  cashierName: string;
  invoiceNumber: string;
  createdAt: string;
  items: { name: string; qty: number; price: number; discountAmount?: number; subtotal: number }[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paymentMethod: string;
  paymentAmount: number;
  changeAmount: number;
  notes?: string | null;
  memberName?: string | null;
  pointsEarned?: number | null;
  memberTotalPoints?: number | null;
  splitPayment?: { cashAmount: number; secondMethod: 'transfer' | 'qris'; secondAmount: number } | null;
  deliveryFee?: number | null;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export async function loadPrinterConfig(): Promise<PrinterConfig> {
  const saved = await mmkv.getObject<PrinterConfig>(StorageKeys.PRINTER_CONFIG);
  return saved ?? { type: 'none', paperWidth: 32 };
}

export async function savePrinterConfig(config: PrinterConfig): Promise<void> {
  await mmkv.setObject(StorageKeys.PRINTER_CONFIG, config);
}

// ─── Shift receipt options ────────────────────────────────────────────────────

export interface PrintShiftReceiptOptions {
  storeName: string;
  storeAddress?: string | null;
  storePhone?: string | null;
  cashierName: string;
  type: 'open' | 'close';
  openedAt: string;
  closedAt?: string | null;
  openingCash: number;
  closingCash?: number | null;
  totalTransactions?: number;
  totalSales?: number;
  cashSales?: number;
  transferSales?: number;
  qrisSales?: number;
  splitSales?: number;
  deliverySales?: number;
}

// ─── Redeem receipt options ───────────────────────────────────────────────────

export interface PrintRedeemReceiptOptions {
  storeName: string;
  storeAddress?: string | null;
  storePhone?: string | null;
  cashierName: string;
  memberName: string;
  remainingPoints: number;
  pointsUsed: number;
  rewardName: string;
  products: { product_name: string; qty: number }[];
  createdAt: string;
}

// ─── Receipt text builder ─────────────────────────────────────────────────────

// Khusus untuk struk — hindari Intl.NumberFormat yang menghasilkan
// yang ditafsirkan printer thermal sebagai karakter Chinese
function fmtRp(amount: number): string {
  const rounded = Math.round(amount);
  const parts = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp ${parts}`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  qris: 'QRIS',
  split: 'Campuran',
  delivery: 'Delivery',
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function center(text: string, width: number) {
  if (text.length >= width) return text.slice(0, width);
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
}

function row(left: string, right: string, width: number) {
  const maxLeft = width - right.length - 1;
  const l = left.length > maxLeft ? left.slice(0, maxLeft) : left.padEnd(maxLeft);
  return `${l} ${right}`;
}

export function buildReceiptText(opts: PrintReceiptOptions, width = 32): string {
  const div = '-'.repeat(width);
  const lines: string[] = [];

  lines.push(div);
  lines.push(center(opts.storeName, width));
  if (opts.storeAddress) lines.push(center(opts.storeAddress, width));
  if (opts.storePhone) lines.push(center(`Tel: ${opts.storePhone}`, width));
  lines.push(div);

  lines.push(center(opts.invoiceNumber, width));
  lines.push(div);
  lines.push(row('Tanggal', formatDate(opts.createdAt), width));
  lines.push(row('Kasir', opts.cashierName, width));
  if (opts.memberName) lines.push(row('Member', opts.memberName, width));
  lines.push(div);

  for (const item of opts.items) {
    lines.push(item.name.slice(0, width));
    lines.push(row(`${item.qty} x ${fmtRp(item.price)}`, fmtRp(item.subtotal), width));
    if ((item.discountAmount ?? 0) > 0) {
      lines.push(row('  Diskon item', `- ${fmtRp(item.discountAmount!)}`, width));
    }
  }

  lines.push(div);
  lines.push(row('Subtotal', fmtRp(opts.subtotal), width));
  if (opts.discountAmount > 0) {
    lines.push(row('Diskon', `- ${fmtRp(opts.discountAmount)}`, width));
  }
  if (opts.taxAmount > 0) {
    lines.push(row('Pajak', fmtRp(opts.taxAmount), width));
  }
  lines.push(div);
  if ((opts.deliveryFee ?? 0) > 0) {
    lines.push(row('Ongkir', fmtRp(opts.deliveryFee ?? 0), width));
  }
  lines.push(row('TOTAL', fmtRp(opts.total), width));
  if (opts.splitPayment) {
    lines.push(row('Tunai', fmtRp(opts.splitPayment.cashAmount), width));
    lines.push(row(METHOD_LABELS[opts.splitPayment.secondMethod] || opts.splitPayment.secondMethod, fmtRp(opts.splitPayment.secondAmount), width));
    if (opts.changeAmount > 0) {
      lines.push(row('Kembalian', fmtRp(opts.changeAmount), width));
    }
  } else {
    lines.push(row('Metode', METHOD_LABELS[opts.paymentMethod] || opts.paymentMethod, width));
    lines.push(row('Bayar', fmtRp(opts.paymentAmount), width));
    if (opts.changeAmount > 0) {
      lines.push(row('Kembalian', fmtRp(opts.changeAmount), width));
    }
  }

  if (opts.notes) {
    lines.push(div);
    lines.push(`Catatan: ${opts.notes}`);
  }

  if (opts.memberName) {
    lines.push(div);
    if (opts.pointsEarned && opts.pointsEarned > 0) {
      lines.push(center(`+${opts.pointsEarned} poin untuk ${opts.memberName}`, width));
    }
    if (opts.memberTotalPoints != null) {
      lines.push(center(`Total poin: ${opts.memberTotalPoints.toLocaleString('id-ID')}`, width));
    }
  }

  lines.push(div);
  lines.push(center('Terima kasih!', width));
  lines.push(center(APP_NAME, width));
  lines.push('');

  return lines.join('\n');
}

export function buildRedeemReceiptText(opts: PrintRedeemReceiptOptions, width = 32): string {
  const div = '-'.repeat(width);
  const lines: string[] = [];

  lines.push(center(opts.storeName, width));
  if (opts.storeAddress) lines.push(center(opts.storeAddress, width));
  if (opts.storePhone) lines.push(center(`Tel: ${opts.storePhone}`, width));
  lines.push(div);
  lines.push(center('STRUK TUKAR POIN', width));
  lines.push(div);

  lines.push(row('Tanggal', formatDate(opts.createdAt), width));
  lines.push(row('Kasir', opts.cashierName, width));
  lines.push(row('Member', opts.memberName, width));
  lines.push(div);

  lines.push(`Reward: ${opts.rewardName}`.slice(0, width));
  for (const p of opts.products) {
    lines.push(`  ${p.product_name} x${p.qty}`.slice(0, width));
  }
  lines.push(div);

  lines.push(row('Poin Digunakan', `-${opts.pointsUsed.toLocaleString('id-ID')}`, width));
  lines.push(row('Sisa Poin', opts.remainingPoints.toLocaleString('id-ID'), width));
  lines.push(div);
  lines.push(center('Terima kasih!', width));
  lines.push(center(APP_NAME, width));
  lines.push('');

  return lines.join('\n');
}

export function buildShiftReceiptText(opts: PrintShiftReceiptOptions, width = 32): string {
  const div = '-'.repeat(width);
  const lines: string[] = [];

  lines.push(center(opts.storeName, width));
  if (opts.storeAddress) lines.push(center(opts.storeAddress, width));
  if (opts.storePhone) lines.push(center(`Tel: ${opts.storePhone}`, width));
  lines.push(div);
  lines.push(center(opts.type === 'open' ? 'BUKA SHIFT' : 'TUTUP SHIFT', width));
  lines.push(div);

  lines.push(row('Kasir', opts.cashierName, width));
  lines.push(row('Buka', formatDate(opts.openedAt), width));
  if (opts.type === 'close' && opts.closedAt) {
    lines.push(row('Tutup', formatDate(opts.closedAt), width));
  }
  lines.push(div);

  lines.push(row('Modal Awal', fmtRp(opts.openingCash), width));

  if (opts.type === 'close') {
    lines.push(row('Uang Akhir', fmtRp(opts.closingCash ?? 0), width));
    lines.push(div);
    lines.push(row('Total Transaksi', String(opts.totalTransactions ?? 0), width));
    lines.push(row('Total Penjualan', fmtRp(opts.totalSales ?? 0), width));
    if ((opts.cashSales ?? 0) > 0) lines.push(row('  Tunai', fmtRp(opts.cashSales ?? 0), width));
    if ((opts.transferSales ?? 0) > 0) lines.push(row('  Transfer', fmtRp(opts.transferSales ?? 0), width));
    if ((opts.qrisSales ?? 0) > 0) lines.push(row('  QRIS', fmtRp(opts.qrisSales ?? 0), width));
    if ((opts.splitSales ?? 0) > 0) lines.push(row('  Campuran', fmtRp(opts.splitSales ?? 0), width));
    if ((opts.deliverySales ?? 0) > 0) lines.push(row('  Delivery', fmtRp(opts.deliverySales ?? 0), width));
    const diff = (opts.closingCash ?? 0) - (opts.openingCash + (opts.cashSales ?? 0));
    lines.push(div);
    lines.push(row('Selisih Kas', fmtRp(diff), width));
  }

  lines.push(div);
  lines.push(center(opts.type === 'open' ? 'Selamat bekerja!' : 'Terima kasih!', width));
  lines.push(center(APP_NAME, width));
  lines.push('');

  return lines.join('\n');
}

// ─── Print / Share ────────────────────────────────────────────────────────────

import { thermalPrinterService } from '@/lib/thermalPrinterService';

export async function printReceipt(opts: PrintReceiptOptions): Promise<boolean> {
  const { isConnected } = thermalPrinterService.getConnectionStatus();
  const width = 32;
  const text = buildReceiptText(opts, width);

  if (isConnected) {
    await thermalPrinterService.printText(text);
    return true;
  }

  return shareReceiptAsText(text, opts.invoiceNumber);
}

export function isPrinterConnected(): boolean {
  return thermalPrinterService.getConnectionStatus().isConnected;
}

export async function printShiftReceipt(opts: PrintShiftReceiptOptions): Promise<boolean> {
  const text = buildShiftReceiptText(opts, 32);
  const { isConnected } = thermalPrinterService.getConnectionStatus();
  if (isConnected) {
    await thermalPrinterService.printText(text, false);
    return true;
  }
  const label = opts.type === 'open' ? 'BUKA-SHIFT' : 'TUTUP-SHIFT';
  return shareReceiptAsText(text, `${label}-${opts.cashierName}`);
}

export async function printRedeemReceipt(opts: PrintRedeemReceiptOptions): Promise<boolean> {
  const text = buildRedeemReceiptText(opts, 32);
  const { isConnected } = thermalPrinterService.getConnectionStatus();
  if (isConnected) {
    await thermalPrinterService.printText(text, true);
    return true;
  }
  return shareReceiptAsText(text, `REDEEM-${opts.memberName}`);
}

export async function shareReceiptAsText(text: string, invoiceNumber: string): Promise<boolean> {
  try {
    await Share.share({ message: text, title: `Struk ${invoiceNumber}` });
    return true;
  } catch {
    return false;
  }
}

export async function saveReceiptToFile(text: string, invoiceNumber: string): Promise<string | null> {
  try {
    const path = `${FileSystem.documentDirectory}struk_${invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    await FileSystem.writeAsStringAsync(path, text, { encoding: FileSystem.EncodingType.UTF8 });
    return path;
  } catch (e) {
    console.error('[Printer] saveReceiptToFile error:', e);
    return null;
  }
}

export interface PrintProductLabelOptions {
  name: string;
  barcode: string | null;
  price: number;
  mode?: 'barcode' | 'qr';
}

export async function printProductLabel(opts: PrintProductLabelOptions): Promise<void> {
  const { isConnected } = thermalPrinterService.getConnectionStatus();
  if (!isConnected) throw new Error('Printer tidak terhubung');

  const nameLine = opts.name.slice(0, 32);
  const priceLine = fmtRp(opts.price);

  if (opts.mode === 'qr') {
    await thermalPrinterService.printLabelWithQR(nameLine, priceLine, opts.barcode);
  } else {
    await thermalPrinterService.printLabelWithBarcode(nameLine, priceLine, opts.barcode);
  }
}

export async function printTestPage(): Promise<boolean> {
  const text = buildReceiptText({
    storeName: APP_NAME,
    cashierName: 'Test',
    invoiceNumber: 'TEST-001',
    createdAt: new Date().toISOString(),
    items: [{ name: 'Produk Contoh', qty: 1, price: 10000, subtotal: 10000 }],
    subtotal: 10000,
    discountAmount: 0,
    taxAmount: 0,
    total: 10000,
    paymentMethod: 'cash',
    paymentAmount: 10000,
    changeAmount: 0,
  }, 32);

  const { isConnected } = thermalPrinterService.getConnectionStatus();
  if (isConnected) {
    await thermalPrinterService.printText(text, true);
    return true;
  }
  return shareReceiptAsText(text, 'TEST-001');
}
