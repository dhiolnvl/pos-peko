/**
 * Report Query Helpers — full Supabase
 */

import { supabase } from '@/lib/supabase';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SalesByDay {
  date: string;
  total: number;
  count: number;
}

export interface SalesByMethod {
  method: string;
  total: number;
  count: number;
}

export interface SalesTransaction {
  id: string;
  invoice_number: string;
  created_at: string;
  cashier_name: string;
  total: number;
  payment_method: string;
  status: string;
}

export interface SalesReportResult {
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  transaction_count: number;
  by_method: SalesByMethod[];
  by_day: SalesByDay[];
  transactions: SalesTransaction[];
}

export interface StockProduct {
  id: string;
  name: string;
  category_name: string;
  stock: number;
  cost_price: number;
  stock_value: number;
}

export interface StockByCategory {
  category_name: string;
  total_value: number;
  product_count: number;
}

export interface StockValueResult {
  total_value: number;
  by_category: StockByCategory[];
  products: StockProduct[];
}

export interface StockMutation {
  id: string;
  created_at: string;
  type: string;
  quantity: number;
  qty_before: number;
  qty_after: number;
  reason: string | null;
  product_name: string;
  created_by_name: string;
}

export interface TopProduct {
  product_id: string;
  product_name: string;
  qty_sold: number;
  revenue: number;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function startOfDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}T00:00:00.000`;
}

export function endOfDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}T23:59:59.999`;
}

export function todayRange() {
  return { from: startOfDay(), to: endOfDay() };
}

export function weekRange() {
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return { from: startOfDay(start), to: endOfDay() };
}

export function monthRange() {
  const start = new Date();
  start.setDate(1);
  return { from: startOfDay(start), to: endOfDay() };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

export const fmtNumber = (n: number) =>
  new Intl.NumberFormat('id-ID').format(n);

// ─── Pagination helper ────────────────────────────────────────────────────────

async function fetchAllTx(
  select: string,
  branchId: string,
  from: string,
  to: string,
  extraFilters?: (q: any) => any,
): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let page = 0;
  while (true) {
    let q = supabase
      .from('transactions')
      .select(select)
      .eq('branch_id', branchId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (extraFilters) q = extraFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = data ?? [];
    all = all.concat(chunk);
    if (chunk.length < PAGE) break;
    page++;
  }
  return all;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getSalesReport(from: string, to: string, branchId: string): Promise<SalesReportResult> {
  const rows = await fetchAllTx(
    'id, invoice_number, created_at, total, payment_method, status, users!cashier_id(name)',
    branchId, from, to,
  );
  const nonVoid = rows.filter((r: any) => r.status !== 'void');

  const total_revenue = nonVoid.reduce((s: number, r: any) => s + (r.total ?? 0), 0);
  const transaction_count = nonVoid.length;

  // by payment method
  const methodMap: Record<string, { total: number; count: number }> = {};
  for (const r of nonVoid) {
    const m = r.payment_method ?? 'cash';
    if (!methodMap[m]) methodMap[m] = { total: 0, count: 0 };
    methodMap[m].total += r.total ?? 0;
    methodMap[m].count += 1;
  }
  const by_method: SalesByMethod[] = Object.entries(methodMap).map(([method, v]) => ({ method, ...v }));

  // by day
  const dayMap: Record<string, { total: number; count: number }> = {};
  for (const r of nonVoid) {
    const date = r.created_at?.slice(0, 10) ?? '';
    if (!dayMap[date]) dayMap[date] = { total: 0, count: 0 };
    dayMap[date].total += r.total ?? 0;
    dayMap[date].count += 1;
  }
  const by_day: SalesByDay[] = Object.entries(dayMap)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const transactions: SalesTransaction[] = rows.map((r: any) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    created_at: r.created_at,
    total: r.total,
    payment_method: r.payment_method,
    status: r.status,
    cashier_name: (r.users as any)?.name ?? 'Unknown',
  }));

  // total cost: pakai cost_price yang disimpan saat transaksi (akurat meski harga beli berubah)
  // Fallback ke products.cost_price untuk transaksi lama yang belum punya cost_price di item
  let total_cost = 0;
  const nonVoidIds = nonVoid.map((r: any) => r.id);
  if (nonVoidIds.length > 0) {
    const { data: items } = await supabase
      .from('transaction_items')
      .select('quantity, product_id, cost_price')
      .in('transaction_id', nonVoidIds);

    if (items && items.length > 0) {
      // Cari produk yang cost_price-nya null (transaksi lama) untuk fallback
      const oldItemProductIds = [...new Set(
        items.filter((i: any) => i.cost_price == null).map((i: any) => i.product_id).filter(Boolean)
      )];
      const costMap: Record<string, number> = {};
      if (oldItemProductIds.length > 0) {
        const { data: productCosts } = await supabase
          .from('products').select('id, cost_price').in('id', oldItemProductIds);
        for (const p of productCosts ?? []) costMap[p.id] = p.cost_price ?? 0;
      }

      for (const item of items) {
        const costPrice = (item as any).cost_price != null
          ? (item as any).cost_price
          : (costMap[(item as any).product_id] ?? 0);
        total_cost += ((item as any).quantity ?? 0) * costPrice;
      }
    }
  }

  return {
    total_revenue,
    total_cost,
    gross_profit: total_revenue - total_cost,
    transaction_count,
    by_method,
    by_day,
    transactions,
  };
}

export async function getTransactionItems(transactionId: string) {
  const { data } = await supabase
    .from('transaction_items')
    .select('product_name, quantity, price, subtotal')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function getStockValue(branchId: string): Promise<StockValueResult> {
  // Ambil stok dari branch_products join ke produk untuk nama & harga pokok
  const { data } = await supabase
    .from('branch_products')
    .select('stock, products!product_id(id, name, cost_price, is_active, categories!category_id(name))')
    .eq('branch_id', branchId)
    .eq('is_available', true);

  const rows = data ?? [];

  const products: StockProduct[] = rows
    .filter((bp: any) => bp.products?.is_active)
    .map((bp: any) => ({
      id: bp.products.id,
      name: bp.products.name,
      category_name: bp.products.categories?.name ?? 'Tanpa Kategori',
      stock: bp.stock ?? 0,
      cost_price: bp.products.cost_price ?? 0,
      stock_value: (bp.stock ?? 0) * (bp.products.cost_price ?? 0),
    }))
    .sort((a, b) => b.stock_value - a.stock_value);

  const catMap: Record<string, { total_value: number; product_count: number }> = {};
  for (const p of products) {
    if (!catMap[p.category_name]) catMap[p.category_name] = { total_value: 0, product_count: 0 };
    catMap[p.category_name].total_value += p.stock_value;
    catMap[p.category_name].product_count += 1;
  }
  const by_category: StockByCategory[] = Object.entries(catMap)
    .map(([category_name, v]) => ({ category_name, ...v }))
    .sort((a, b) => b.total_value - a.total_value);

  const total_value = products.reduce((s, p) => s + p.stock_value, 0);

  return { total_value, by_category, products };
}

export async function getStockMutations(
  branchId: string,
  productId?: string | null,
  from?: string,
  to?: string
): Promise<StockMutation[]> {
  let q = supabase
    .from('stock_movements')
    .select('id, created_at, type, quantity, qty_before, qty_after, reason, products!product_id(name), users!created_by(name)')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (productId) q = (q as any).eq('product_id', productId);
  if (from) q = (q as any).gte('created_at', from);
  if (to) q = (q as any).lte('created_at', to);

  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    type: r.type,
    quantity: r.quantity,
    qty_before: r.qty_before,
    qty_after: r.qty_after,
    reason: r.reason ?? null,
    product_name: r.products?.name ?? 'Produk Dihapus',
    created_by_name: r.users?.name ?? 'System',
  }));
}

export async function getTopProducts(
  from: string,
  to: string,
  branchId: string,
  limit = 20
): Promise<TopProduct[]> {
  const txData = await fetchAllTx('id', branchId, from, to, (q) => q.neq('status', 'void'));
  const txIds = txData.map((r: any) => r.id);
  if (txIds.length === 0) return [];

  const { data: items } = await supabase
    .from('transaction_items')
    .select('product_id, product_name, quantity, subtotal')
    .in('transaction_id', txIds);

  const map: Record<string, { product_id: string; product_name: string; qty_sold: number; revenue: number }> = {};
  for (const item of items ?? []) {
    const key = item.product_id ?? item.product_name;
    if (!map[key]) {
      map[key] = { product_id: item.product_id ?? '', product_name: item.product_name, qty_sold: 0, revenue: 0 };
    }
    map[key].qty_sold += item.quantity ?? 0;
    map[key].revenue += item.subtotal ?? 0;
  }

  return Object.values(map)
    .sort((a, b) => b.qty_sold - a.qty_sold)
    .slice(0, limit);
}

export async function getTodaySummary(branchId: string) {
  const { from, to } = todayRange();
  const rows = await fetchAllTx('total', branchId, from, to, (q) => q.neq('status', 'void'));
  return {
    total: rows.reduce((s: number, r: any) => s + (r.total ?? 0), 0),
    count: rows.length,
  };
}

export async function getLast7DaysSales(branchId: string): Promise<SalesByDay[]> {
  const start = new Date();
  start.setDate(start.getDate() - 6);
  const from = startOfDay(start);
  const to = endOfDay();

  const data = await fetchAllTx('created_at, total', branchId, from, to, (q) => q.neq('status', 'void'));

  const dayMap: Record<string, { total: number; count: number }> = {};
  for (const r of data) {
    const date = (r.created_at as string)?.slice(0, 10) ?? '';
    if (!dayMap[date]) dayMap[date] = { total: 0, count: 0 };
    dayMap[date].total += r.total ?? 0;
    dayMap[date].count += 1;
  }

  return Object.entries(dayMap)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface ProductSalesRow {
  product_id: string;
  product_name: string;
  barcode: string | null;
  category: string | null;
  unit: string | null;
  total_qty: number;
  qty_pct: number;       // % dari total qty semua produk
  total_revenue: number;
  revenue_pct: number;   // % dari total revenue
  avg_price: number;
  total_hpp: number;
  gross_profit: number;
}

export interface ProductSalesReport {
  rows: ProductSalesRow[];
  totalRevenue: number;
  totalQty: number;
  totalHpp: number;
  totalGrossProfit: number;
}

export async function getProductSalesReport(
  from: string,
  to: string,
  branchId: string | null,
): Promise<ProductSalesReport> {
  const { data, error } = await supabase
    .from('transaction_items')
    .select(`
      product_id, product_name, quantity, price, subtotal, cost_price,
      products!product_id(barcode, unit, cost_price, categories!category_id(name)),
      transactions!transaction_id(branch_id, created_at, status)
    `)
    .gte('transactions.created_at', from)
    .lte('transactions.created_at', to)
    .neq('transactions.status', 'void');

  if (error) throw error;

  const map: Record<string, {
    product_id: string; product_name: string; barcode: string | null;
    category: string | null; unit: string | null;
    total_qty: number; total_revenue: number; total_hpp: number;
  }> = {};

  for (const item of data ?? []) {
    const tx = (item as any).transactions;
    if (!tx || tx.status === 'void') continue;
    if (branchId && tx.branch_id !== branchId) continue;

    const id = item.product_id ?? 'unknown';
    const product = (item as any).products;
    const qty = item.quantity ?? 0;
    const subtotal = item.subtotal ?? 0;
    // Prioritas: cost_price dari transaction_items (snapshot saat transaksi)
    // Fallback ke products.cost_price untuk data lama
    const costPrice = (item as any).cost_price != null
      ? (item as any).cost_price
      : (product?.cost_price ?? 0);

    if (!map[id]) {
      map[id] = {
        product_id: id,
        product_name: item.product_name ?? 'Produk',
        barcode: product?.barcode ?? null,
        category: product?.categories?.name ?? null,
        unit: product?.unit ?? null,
        total_qty: 0, total_revenue: 0, total_hpp: 0,
      };
    }
    map[id].total_qty += qty;
    map[id].total_revenue += subtotal;
    map[id].total_hpp += costPrice * qty;
  }

  const rows = Object.values(map);
  const totalRevenue = rows.reduce((s, r) => s + r.total_revenue, 0);
  const totalQty = rows.reduce((s, r) => s + r.total_qty, 0);
  const totalHpp = rows.reduce((s, r) => s + r.total_hpp, 0);

  const result: ProductSalesRow[] = rows
    .map((r) => ({
      ...r,
      avg_price: r.total_qty > 0 ? Math.round(r.total_revenue / r.total_qty) : 0,
      qty_pct: totalQty > 0 ? (r.total_qty / totalQty) * 100 : 0,
      revenue_pct: totalRevenue > 0 ? (r.total_revenue / totalRevenue) * 100 : 0,
      gross_profit: r.total_revenue - r.total_hpp,
    }))
    .sort((a, b) => b.total_qty - a.total_qty);

  return {
    rows: result,
    totalRevenue,
    totalQty,
    totalHpp,
    totalGrossProfit: totalRevenue - totalHpp,
  };
}

async function getLogoBase64(): Promise<string> {
  try {
    const asset = Asset.fromModule(require('@/assets/logo-baru2.png'));
    await asset.downloadAsync();
    const b64 = await FileSystem.readAsStringAsync(asset.localUri!, { encoding: 'base64' });
    return `data:image/png;base64,${b64}`;
  } catch {
    return '';
  }
}

export async function buildProductSalesPdfHtml(
  report: ProductSalesReport,
  opts: { periodLabel: string; branchName: string; storeName: string; storeAddress?: string | null },
): Promise<string> {
  const logoSrc = await getLogoBase64();

  const tableRows = report.rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#F9FAFB'}">
      <td>${i + 1}</td>
      <td style="font-weight:600">${r.product_name}</td>
      <td style="color:#6B7280">${r.barcode ?? '-'}</td>
      <td style="color:#6B7280">${r.category ?? '-'}</td>
      <td class="r">${r.total_qty.toLocaleString('id-ID')}</td>
      <td class="r" style="color:#9CA3AF">${r.qty_pct.toFixed(2)}%</td>
      <td class="r" style="font-weight:600">${fmtCurrency(r.total_revenue)}</td>
      <td class="r" style="color:#9CA3AF">${r.revenue_pct.toFixed(2)}%</td>
      <td class="r">${fmtCurrency(r.avg_price)}</td>
      <td class="r" style="color:#6B7280">${fmtCurrency(r.total_hpp)}</td>
      <td class="r" style="font-weight:700;color:${r.gross_profit >= 0 ? '#16A34A' : '#DC2626'}">${fmtCurrency(r.gross_profit)}</td>
    </tr>`).join('');

  return `
    <html><head><meta charset="utf-8">
    <style>
      @page { size: A4 landscape; margin: 16mm 12mm; }
      body { font-family: sans-serif; color: #111827; font-size: 11px; }
      .page-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #347385; padding-bottom: 12px; margin-bottom: 16px; }
      .logo { height: 48px; object-fit: contain; }
      .store-info { text-align: right; }
      .store-name { font-size: 15px; font-weight: 800; color: #111827; }
      .store-addr { font-size: 11px; color: #6B7280; margin-top: 2px; }
      h1 { font-size: 18px; font-weight: 800; color: #111827; margin: 0 0 4px; }
      .sub { font-size: 11px; color: #6B7280; margin-bottom: 14px; }
      .meta-grid { display: flex; gap: 12px; margin-bottom: 16px; }
      .meta-box { flex: 1; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 10px 12px; }
      .meta-label { font-size: 10px; color: #6B7280; margin-bottom: 3px; }
      .meta-value { font-size: 14px; font-weight: 800; color: #111827; }
      .meta-value.green { color: #16A34A; }
      table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
      th { background: #347385; color: #fff; padding: 7px 8px; text-align: left; }
      td { padding: 6px 8px; border-bottom: 1px solid #F3F4F6; }
      .r { text-align: right; }
      tfoot td { font-weight: 800; background: #EEF8FA; padding: 7px 8px; border-top: 2px solid #A9DFE9; }
    </style></head><body>
    <div class="page-header">
      <div>
        <h1>Laporan Penjualan Produk</h1>
        <div class="sub">Periode: ${opts.periodLabel} &nbsp;·&nbsp; ${opts.branchName} &nbsp;·&nbsp; ${report.rows.length} produk</div>
      </div>
      <div class="store-info">
        ${logoSrc ? `<img src="${logoSrc}" class="logo" />` : ''}
        <div class="store-name">${opts.storeName}</div>
        ${opts.storeAddress ? `<div class="store-addr">${opts.storeAddress}</div>` : ''}
      </div>
    </div>
    <div class="meta-grid">
      <div class="meta-box"><div class="meta-label">Total Penjualan</div><div class="meta-value">${fmtCurrency(report.totalRevenue)}</div></div>
      <div class="meta-box"><div class="meta-label">Laba Kotor</div><div class="meta-value green">${fmtCurrency(report.totalGrossProfit)}</div></div>
      <div class="meta-box"><div class="meta-label">Total Qty Terjual</div><div class="meta-value">${report.totalQty.toLocaleString('id-ID')}</div></div>
      <div class="meta-box"><div class="meta-label">Total HPP</div><div class="meta-value">${fmtCurrency(report.totalHpp)}</div></div>
    </div>
    <table>
      <thead><tr>
        <th style="width:26px">#</th>
        <th>Produk</th>
        <th>Barcode/SKU</th>
        <th>Kategori</th>
        <th class="r">Qty</th>
        <th class="r">Qty%</th>
        <th class="r">Penjualan (Rp)</th>
        <th class="r">Penj.%</th>
        <th class="r">Rata-rata</th>
        <th class="r">HPP (Rp)</th>
        <th class="r">Laba Kotor (Rp)</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
      <tfoot><tr>
        <td colspan="4">TOTAL — ${report.rows.length} produk</td>
        <td class="r">${report.totalQty.toLocaleString('id-ID')}</td>
        <td class="r">100%</td>
        <td class="r">${fmtCurrency(report.totalRevenue)}</td>
        <td class="r">100%</td>
        <td></td>
        <td class="r">${fmtCurrency(report.totalHpp)}</td>
        <td class="r" style="color:#16A34A">${fmtCurrency(report.totalGrossProfit)}</td>
      </tr></tfoot>
    </table>
    </body></html>`;
}

// ─── Laporan Presensi (PDF) ───────────────────────────────────────────────────

export interface AttendancePdfRow {
  date: string;
  name: string;
  checkInTime: string;
  checkOutTime: string;
  durationLabel: string;
  status: string;
  note: string;
}

export function fmtDurationFull(ms: number): string {
  if (ms <= 0) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} Jam`);
  if (m > 0) parts.push(`${m} Menit`);
  if (s > 0 || parts.length === 0) parts.push(`${s} Detik`);
  return parts.join(' ');
}

export async function buildAttendancePdfHtml(
  rows: AttendancePdfRow[],
  opts: {
    periodLabel: string;
    branchName: string;
    storeName: string;
    storeAddress?: string | null;
    statusLabel?: string;
    generatedAtLabel: string;
  },
): Promise<string> {
  const logoSrc = await getLogoBase64();

  const tableRows = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#F9FAFB'}">
      <td>${r.date}</td>
      <td style="font-weight:600">${r.name}</td>
      <td>${r.checkInTime}</td>
      <td>${r.checkOutTime}</td>
      <td>${r.durationLabel || '-'}</td>
      <td>${r.status || '-'}</td>
      <td>${r.note || '-'}</td>
    </tr>`).join('');

  return `
    <html><head><meta charset="utf-8">
    <style>
      @page { size: A4 portrait; margin: 16mm 12mm; }
      body { font-family: sans-serif; color: #111827; font-size: 11px; }
      .page-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #347385; padding-bottom: 12px; margin-bottom: 16px; }
      .logo { height: 48px; object-fit: contain; }
      .store-info { text-align: right; }
      .store-name { font-size: 15px; font-weight: 800; color: #111827; }
      .store-addr { font-size: 11px; color: #6B7280; margin-top: 2px; }
      h1 { font-size: 18px; font-weight: 800; color: #111827; margin: 0 0 4px; }
      .meta-grid { display: flex; flex-wrap: wrap; gap: 4px 24px; margin-bottom: 8px; font-size: 11px; }
      .meta-row { display: flex; gap: 6px; }
      .meta-label { color: #6B7280; width: 80px; }
      .meta-value { font-weight: 600; color: #111827; }
      .generated { text-align: right; font-size: 10px; color: #9CA3AF; margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
      th { background: #347385; color: #fff; padding: 7px 8px; text-align: left; }
      td { padding: 6px 8px; border-bottom: 1px solid #F3F4F6; vertical-align: top; }
    </style></head><body>
    <div class="page-header">
      <div>
        <h1>Laporan Presensi</h1>
      </div>
      <div class="store-info">
        ${logoSrc ? `<img src="${logoSrc}" class="logo" />` : ''}
        <div class="store-name">${opts.storeName}</div>
        ${opts.storeAddress ? `<div class="store-addr">${opts.storeAddress}</div>` : ''}
      </div>
    </div>
    <div class="meta-grid">
      <div class="meta-row"><div class="meta-label">Periode</div><div class="meta-value">${opts.periodLabel}</div></div>
      <div class="meta-row"><div class="meta-label">Cabang</div><div class="meta-value">${opts.branchName}</div></div>
      <div class="meta-row"><div class="meta-label">Zona Waktu</div><div class="meta-value">Asia/Jakarta (GMT +7)</div></div>
      <div class="meta-row"><div class="meta-label">Status</div><div class="meta-value">${opts.statusLabel ?? 'Semua'}</div></div>
    </div>
    <div class="generated">Date Generated ${opts.generatedAtLabel}</div>
    <table>
      <thead><tr>
        <th>Tanggal</th>
        <th>Nama</th>
        <th>Jam Masuk</th>
        <th>Jam Pulang</th>
        <th>Total Jam Kerja</th>
        <th>Status</th>
        <th>Catatan</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    </body></html>`;
}
