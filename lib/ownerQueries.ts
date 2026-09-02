/**
 * Owner / Multi-Branch Query Helpers — full Supabase
 */

import { supabase } from '@/lib/supabase';
import { fmtCurrency } from '@/lib/reportQueries';

export { fmtCurrency };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BranchSummary {
  branch_id: string;
  branch_name: string;
  total_revenue: number;
  transaction_count: number;
  avg_transaction: number;
  gross_profit: number;
  active_cashiers: number;
}

export interface BranchStockSummary {
  branch_id: string;
  branch_name: string;
  total_stock_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
}

export interface ProductCrossStock {
  product_id: string;
  product_name: string;
  category_name: string;
  stocks: Record<string, number>;
  min_stock: number;
}

export interface DailySales {
  date: string;
  branch_id: string;
  branch_name: string;
  total: number;
}

export interface PendingOpname {
  id: string;
  branch_id: string;
  branch_name: string;
  created_by_name: string;
  created_at: string;
  item_count: number;
  total_difference: number;
  notes: string | null;
}

export interface CriticalStockBranch {
  branch_id: string;
  branch_name: string;
  critical_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function startOfDay(d = new Date()): string {
  const c = new Date(d); c.setHours(0, 0, 0, 0); return c.toISOString();
}
export function endOfDay(d = new Date()): string {
  const c = new Date(d); c.setHours(23, 59, 59, 999); return c.toISOString();
}

function pad(n: number) { return n.toString().padStart(2, '0'); }
export function isoShort(iso: string) {
  try {
    const d = new Date(iso);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return iso; }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getBranchSummaries(
  branchIds: string[] | null,
  from: string,
  to: string
): Promise<BranchSummary[]> {
  let branchQ = supabase.from('branches').select('id, name').eq('is_active', true);
  const { data: branches } = await branchQ;
  const allBranches = branches ?? [];

  const filtered = branchIds
    ? allBranches.filter((b: any) => branchIds.includes(b.id))
    : allBranches;

  const PAGE = 1000;
  let txRows: any[] = [];
  let page = 0;
  while (true) {
    let txQ = supabase
      .from('transactions')
      .select('id, branch_id, total, status')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (branchIds?.length) txQ = (txQ as any).in('branch_id', branchIds);
    const { data: txData } = await txQ;
    const chunk = txData ?? [];
    txRows = txRows.concat(chunk);
    if (chunk.length < PAGE) break;
    page++;
  }

  // Hitung HPP per transaksi
  const nonVoidIds = txRows.filter((r: any) => r.status !== 'void').map((r: any) => r.id);
  const hppByTx: Record<string, number> = {};
  if (nonVoidIds.length > 0) {
    const { data: items } = await supabase
      .from('transaction_items')
      .select('transaction_id, quantity, product_id, cost_price')
      .in('transaction_id', nonVoidIds);

    // Fallback untuk data lama yang belum punya cost_price di item
    const oldIds = [...new Set((items ?? []).filter((i: any) => i.cost_price == null).map((i: any) => i.product_id).filter(Boolean))];
    const costMap: Record<string, number> = {};
    if (oldIds.length > 0) {
      const { data: prods } = await supabase.from('products').select('id, cost_price').in('id', oldIds);
      for (const p of prods ?? []) costMap[p.id] = p.cost_price ?? 0;
    }
    for (const item of items ?? []) {
      const txId = (item as any).transaction_id;
      const cp = (item as any).cost_price != null ? (item as any).cost_price : (costMap[(item as any).product_id] ?? 0);
      hppByTx[txId] = (hppByTx[txId] ?? 0) + cp * ((item as any).quantity ?? 0);
    }
  }

  return filtered.map((b: any) => {
    const branchTx = txRows.filter((r: any) => r.branch_id === b.id && r.status !== 'void');
    const total_revenue = branchTx.reduce((s: number, r: any) => s + (r.total ?? 0), 0);
    const total_hpp = branchTx.reduce((s: number, r: any) => s + (hppByTx[r.id] ?? 0), 0);
    const transaction_count = branchTx.length;
    return {
      branch_id: b.id,
      branch_name: b.name,
      total_revenue,
      transaction_count,
      avg_transaction: transaction_count > 0 ? total_revenue / transaction_count : 0,
      gross_profit: total_revenue - total_hpp,
      active_cashiers: 0,
    };
  }).sort((a: BranchSummary, b: BranchSummary) => b.total_revenue - a.total_revenue);
}

export async function getBranchGrossProfit(branchId: string, from: string, to: string): Promise<number> {
  const { data: txData } = await supabase
    .from('transactions')
    .select('id')
    .eq('branch_id', branchId)
    .neq('status', 'void')
    .gte('created_at', from)
    .lte('created_at', to);

  const txIds = (txData ?? []).map((r: any) => r.id);
  if (txIds.length === 0) return 0;

  const { data: items } = await supabase
    .from('transaction_items')
    .select('subtotal, quantity, product_id, cost_price')
    .in('transaction_id', txIds);

  const oldIds = [...new Set((items ?? []).filter((i: any) => i.cost_price == null).map((i: any) => i.product_id).filter(Boolean))];
  const costMap: Record<string, number> = {};
  if (oldIds.length > 0) {
    const { data: prods } = await supabase.from('products').select('id, cost_price').in('id', oldIds);
    for (const p of prods ?? []) costMap[p.id] = p.cost_price ?? 0;
  }

  return (items ?? []).reduce((s: number, item: any) => {
    const cp = item.cost_price != null ? item.cost_price : (costMap[item.product_id] ?? 0);
    return s + ((item.subtotal ?? 0) - cp * (item.quantity ?? 0));
  }, 0);
}

export async function getMultiBranchDailySales(
  branchIds: string[] | null,
  days = 30,
  fromOverride?: string,
  toOverride?: string,
): Promise<DailySales[]> {
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const from = fromOverride ?? startOfDay(start);
  const to = toOverride ?? endOfDay();

  const rows = await fetchAllTransactions(from, to, branchIds);

  const TZ_OFFSET_D = 7 * 60;
  const dayMap: Record<string, DailySales> = {};
  for (const r of rows) {
    const d = new Date(new Date(r.created_at as string).getTime() + TZ_OFFSET_D * 60000);
    const date = d.toISOString().slice(0, 10);
    const key = `${date}__${r.branch_id}`;
    if (!dayMap[key]) {
      dayMap[key] = {
        date,
        branch_id: r.branch_id,
        branch_name: (r as any).branches?.name ?? '',
        total: 0,
      };
    }
    dayMap[key].total += r.total ?? 0;
  }

  return Object.values(dayMap).sort((a, b) =>
    a.date.localeCompare(b.date) || a.branch_name.localeCompare(b.branch_name)
  );
}

export async function getMultiBranchWeeklySales(
  branchIds: string[] | null,
  weeks = 4,
  fromOverride?: string,
  toOverride?: string,
): Promise<DailySales[]> {
  const start = new Date();
  start.setDate(start.getDate() - (weeks * 7 - 1));
  const from = fromOverride ?? startOfDay(start);
  const to = toOverride ?? endOfDay();

  const rows = await fetchAllTransactions(from, to, branchIds);

  const TZ_OFFSET_W = 7 * 60;
  const weekMap: Record<string, DailySales> = {};
  for (const r of rows) {
    const d = new Date(new Date(r.created_at as string).getTime() + TZ_OFFSET_W * 60000);
    const thu = new Date(d);
    thu.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
    const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
    const wk = Math.ceil(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
    const weekKey = `${thu.getUTCFullYear()}-W${wk.toString().padStart(2, '0')}`;
    const key = `${weekKey}__${r.branch_id}`;
    if (!weekMap[key]) {
      weekMap[key] = { date: weekKey, branch_id: r.branch_id, branch_name: (r as any).branches?.name ?? '', total: 0 };
    }
    weekMap[key].total += r.total ?? 0;
  }

  return Object.values(weekMap).sort((a, b) =>
    a.date.localeCompare(b.date) || a.branch_name.localeCompare(b.branch_name)
  );
}

async function fetchAllTransactions(
  from: string,
  to: string,
  branchIds: string[] | null,
): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let page = 0;
  while (true) {
    let q = supabase
      .from('transactions')
      .select('created_at, branch_id, total, branches!branch_id(name)')
      .neq('status', 'void')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (branchIds?.length) q = (q as any).in('branch_id', branchIds);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    page++;
  }
  return all;
}

export async function getMultiBranchMonthlySales(
  branchIds: string[] | null,
  months = 12,
  fromOverride?: string,
  toOverride?: string,
): Promise<DailySales[]> {
  const start = new Date();
  start.setMonth(start.getMonth() - (months - 1));
  start.setDate(1);
  const from = fromOverride ?? startOfDay(start);
  const to = toOverride ?? endOfDay();

  const rows = await fetchAllTransactions(from, to, branchIds);

  const TZ_OFFSET = 7 * 60;
  const monthMap: Record<string, DailySales> = {};
  for (const r of rows) {
    const d = new Date(new Date(r.created_at as string).getTime() + TZ_OFFSET * 60000);
    const monthKey = `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`;
    const key = `${monthKey}__${r.branch_id}`;
    if (!monthMap[key]) {
      monthMap[key] = { date: monthKey, branch_id: r.branch_id, branch_name: (r as any).branches?.name ?? '', total: 0 };
    }
    monthMap[key].total += r.total ?? 0;
  }

  return Object.values(monthMap).sort((a, b) =>
    a.date.localeCompare(b.date) || a.branch_name.localeCompare(b.branch_name)
  );
}

export async function getBranchStockSummaries(branchIds: string[] | null): Promise<BranchStockSummary[]> {
  // Ambil semua branch_products join produk untuk harga pokok
  let q = supabase
    .from('branch_products')
    .select('branch_id, stock, min_stock, products!product_id(cost_price), branches!branch_id(id, name)')
    .eq('is_available', true);

  if (branchIds?.length) q = (q as any).in('branch_id', branchIds);

  const { data } = await q;
  const rows = data ?? [];

  const map: Record<string, BranchStockSummary> = {};
  for (const bp of rows) {
    const branchId = bp.branch_id;
    const branchName = (bp as any).branches?.name ?? '';
    if (!map[branchId]) {
      map[branchId] = {
        branch_id: branchId,
        branch_name: branchName,
        total_stock_value: 0,
        low_stock_count: 0,
        out_of_stock_count: 0,
      };
    }
    const stock = bp.stock ?? 0;
    const costPrice = (bp as any).products?.cost_price ?? 0;
    const minStock = bp.min_stock ?? 0;
    map[branchId].total_stock_value += stock * costPrice;
    if (stock === 0) map[branchId].out_of_stock_count += 1;
    else if (stock <= minStock) map[branchId].low_stock_count += 1;
  }

  return Object.values(map).sort((a, b) => b.total_stock_value - a.total_stock_value);
}

export async function getPendingOpnames(): Promise<PendingOpname[]> {
  const { data, error } = await supabase
    .from('stock_opname')
    .select(`
      id, branch_id, notes, created_at,
      branches(name),
      users!created_by(name),
      stock_opname_items(difference)
    `)
    .eq('status', 'submitted')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const items: { difference: number }[] = row.stock_opname_items ?? [];
    return {
      id: row.id,
      branch_id: row.branch_id,
      branch_name: row.branches?.name ?? 'Unknown',
      created_by_name: row.users?.name ?? 'Unknown',
      created_at: row.created_at,
      item_count: items.length,
      total_difference: items.reduce((s, i) => s + Math.abs(i.difference ?? 0), 0),
      notes: row.notes ?? null,
    };
  });
}

export async function getOpnameDetail(opnameId: string) {
  const { data: opname, error: opError } = await supabase
    .from('stock_opname')
    .select('id, branch_id, status, notes, created_at, branches(name), users!created_by(name)')
    .eq('id', opnameId)
    .single();
  if (opError) throw opError;

  const { data: items, error: itemError } = await supabase
    .from('stock_opname_items')
    .select('id, product_id, system_stock, physical_stock, difference, notes, products(name)')
    .eq('opname_id', opnameId)
    .order('difference', { ascending: true });
  if (itemError) throw itemError;

  const header = {
    id: opname.id,
    branch_id: opname.branch_id,
    branch_name: (opname as any).branches?.name ?? 'Unknown',
    status: opname.status,
    created_by_name: (opname as any).users?.name ?? 'Unknown',
    notes: opname.notes ?? null,
    created_at: opname.created_at,
  };

  const mappedItems = (items ?? []).map((i: any) => ({
    id: i.id,
    product_id: i.product_id,
    product_name: i.products?.name ?? 'Produk Dihapus',
    system_stock: i.system_stock,
    physical_stock: i.physical_stock,
    difference: i.difference,
    notes: i.notes ?? null,
  }));

  return { header, items: mappedItems };
}

export async function getCriticalStockBranches(): Promise<CriticalStockBranch[]> {
  const { data } = await supabase
    .from('branch_products')
    .select('branch_id, stock, branches!branch_id(name)')
    .eq('is_available', true)
    .eq('stock', 0);

  const map: Record<string, CriticalStockBranch> = {};
  for (const bp of data ?? []) {
    const branchId = bp.branch_id;
    if (!map[branchId]) {
      map[branchId] = {
        branch_id: branchId,
        branch_name: (bp as any).branches?.name ?? '',
        critical_count: 0,
      };
    }
    map[branchId].critical_count += 1;
  }

  return Object.values(map).sort((a, b) => b.critical_count - a.critical_count);
}

export async function fetchAllBranches() {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllUsers(branchId?: string | null, role?: string | null) {
  let query = supabase.from('users').select('*, branch:branches(id,name)').order('name');
  if (branchId) query = query.eq('branch_id', branchId);
  if (role) query = query.eq('role', role);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getCrossStockTable(branchIds: string[]): Promise<ProductCrossStock[]> {
  if (!branchIds.length) return [];

  // Ambil semua branch_products untuk cabang yang diminta, join ke produk & kategori
  const { data } = await supabase
    .from('branch_products')
    .select('branch_id, stock, min_stock, products!product_id(id, name, is_active, categories!category_id(name))')
    .in('branch_id', branchIds)
    .eq('is_available', true);

  const map = new Map<string, ProductCrossStock>();
  for (const bp of data ?? []) {
    const product = (bp as any).products;
    if (!product || !product.is_active) continue;
    const categoryName = product.categories?.name ?? 'Tanpa Kategori';
    const key = product.name + '___' + categoryName;
    if (!map.has(key)) {
      map.set(key, {
        product_id: product.id,
        product_name: product.name,
        category_name: categoryName,
        stocks: {},
        min_stock: bp.min_stock ?? 0,
      });
    }
    map.get(key)!.stocks[bp.branch_id] = bp.stock ?? 0;
  }
  return Array.from(map.values()).sort((a, b) => a.product_name.localeCompare(b.product_name));
}

export interface TopProductMulti {
  product_name: string;
  qty_sold: number;
  revenue: number;
}

export async function getMultiBranchTopProducts(
  branchIds: string[] | null,
  from: string,
  to: string,
  limit = 5,
): Promise<TopProductMulti[]> {
  const PAGE = 1000;
  let txIds: string[] = [];
  let page = 0;
  while (true) {
    let q = supabase
      .from('transactions')
      .select('id')
      .neq('status', 'void')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (branchIds?.length) q = (q as any).in('branch_id', branchIds);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = data ?? [];
    txIds = txIds.concat(chunk.map((r: any) => r.id));
    if (chunk.length < PAGE) break;
    page++;
  }
  if (txIds.length === 0) return [];

  const BATCH = 500;
  let items: any[] = [];
  for (let i = 0; i < txIds.length; i += BATCH) {
    const { data } = await supabase
      .from('transaction_items')
      .select('product_name, quantity, subtotal')
      .in('transaction_id', txIds.slice(i, i + BATCH));
    items = items.concat(data ?? []);
  }

  const map: Record<string, TopProductMulti> = {};
  for (const item of items) {
    const name = item.product_name ?? 'Unknown';
    if (!map[name]) map[name] = { product_name: name, qty_sold: 0, revenue: 0 };
    map[name].qty_sold += item.quantity ?? 0;
    map[name].revenue += item.subtotal ?? 0;
  }

  return Object.values(map)
    .sort((a, b) => b.qty_sold - a.qty_sold)
    .slice(0, limit);
}
