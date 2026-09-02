import { supabase } from './supabase';
import { offlineCache } from './offlineCache';
import * as Network from 'expo-network';

const generateUUID = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

export interface Shift {
  id: string;
  branch_id: string;
  cashier_id: string;
  cashier_name: string;
  opening_cash: number;
  closing_cash: number | null;
  opened_at: string;
  closed_at: string | null;
  status: 'open' | 'closed';
  notes: string | null;
  total_transactions: number | null;
  total_sales: number | null;
  created_at?: string;
}

export interface ShiftSummary {
  totalTransactions: number;
  totalSales: number;
  cashSales: number;
  transferSales: number;
  qrisSales: number;
  splitSales: number;
  deliverySales: number;
}

export async function ensureShiftTable(): Promise<void> {
  // no-op: table lives in Supabase
}

export async function getActiveShift(cashierId: string, branchId: string): Promise<Shift | null> {
  const netState = await Network.getNetworkStateAsync();
  const isOffline = !netState.isConnected || !netState.isInternetReachable;

  // Selalu cek cache dulu — termasuk saat online.
  // Ini mencegah race condition: shift dibuat offline, belum sempat di-sync ke Supabase,
  // tapi initShift() sudah query Supabase dan dapat null.
  const cached = await offlineCache.getActiveShift();
  const cachedIsValid = cached &&
    cached.cashier_id === cashierId &&
    cached.branch_id === branchId &&
    cached.status === 'open';

  if (isOffline) {
    return cachedIsValid ? cached : null;
  }

  // Online: kalau ada pending shift yang belum di-sync, kembalikan dari cache dulu.
  // Jangan query Supabase karena shift belum ada di sana — biarkan useOfflineSync yang sync.
  const pendingShift = await offlineCache.getPendingShift();
  const hasPending = pendingShift &&
    pendingShift.cashier_id === cashierId &&
    pendingShift.branch_id === branchId &&
    pendingShift.status === 'open';

  if (hasPending && cachedIsValid) {
    return cached;
  }

  const { data } = await supabase
    .from('shifts')
    .select('*')
    .eq('cashier_id', cashierId)
    .eq('branch_id', branchId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .single();

  const shift = data ?? null;
  // Hanya update cache kalau Supabase return data valid — jangan timpa cache dengan null
  if (shift) {
    await offlineCache.saveActiveShift(shift);
  } else if (!cachedIsValid) {
    // Benar-benar tidak ada shift aktif — clear cache
    await offlineCache.saveActiveShift(null);
  }
  return shift ?? (cachedIsValid ? cached : null);
}

export async function openShift(data: {
  cashierId: string;
  cashierName: string;
  branchId: string;
  openingCash: number;
  notes?: string;
}): Promise<Shift> {
  const id = generateUUID();
  const now = new Date().toISOString();

  const shift: Shift = {
    id,
    branch_id: data.branchId,
    cashier_id: data.cashierId,
    cashier_name: data.cashierName,
    opening_cash: data.openingCash,
    closing_cash: null,
    opened_at: now,
    closed_at: null,
    status: 'open',
    notes: data.notes ?? null,
    total_transactions: null,
    total_sales: null,
    created_at: now,
  };

  const netState = await Network.getNetworkStateAsync();
  const isOffline = !netState.isConnected || !netState.isInternetReachable;

  if (isOffline) {
    // Simpan sebagai pending shift — akan di-sync saat koneksi kembali
    await offlineCache.saveActiveShift(shift);
    await offlineCache.savePendingShift(shift);
    return shift;
  }

  const { error } = await supabase.from('shifts').insert({
    id: shift.id,
    branch_id: shift.branch_id,
    cashier_id: shift.cashier_id,
    cashier_name: shift.cashier_name,
    opening_cash: shift.opening_cash,
    opened_at: shift.opened_at,
    status: 'open',
    notes: shift.notes,
    created_at: shift.created_at,
  });
  if (error) throw new Error(error.message);

  const { data: saved } = await supabase.from('shifts').select('*').eq('id', id).single();
  if (saved) await offlineCache.saveActiveShift(saved);
  return saved ?? shift;
}

export async function getShiftSummary(shiftId: string, cashierId: string, branchId: string, openedAt: string): Promise<ShiftSummary> {
  const { data } = await supabase
    .from('transactions')
    .select('total, payment_method, split_payment_detail')
    .eq('cashier_id', cashierId)
    .eq('branch_id', branchId)
    .eq('status', 'completed')
    .gte('created_at', openedAt);

  const rows = data ?? [];
  let cashSales = 0, transferSales = 0, qrisSales = 0, splitSales = 0, deliverySales = 0;

  for (const r of rows) {
    const total = r.total ?? 0;
    if (r.payment_method === 'cash') { cashSales += total; }
    else if (r.payment_method === 'transfer') { transferSales += total; }
    else if (r.payment_method === 'qris') { qrisSales += total; }
    else if (r.payment_method === 'delivery') { deliverySales += total; }
    else if (r.payment_method === 'split') {
      const detail = r.split_payment_detail as { cashAmount?: number; secondAmount?: number; secondMethod?: string } | null;
      cashSales += detail?.cashAmount ?? 0;
      const secondAmt = detail?.secondAmount ?? 0;
      if (detail?.secondMethod === 'transfer') transferSales += secondAmt;
      else if (detail?.secondMethod === 'qris') qrisSales += secondAmt;
      else splitSales += total;
    }
  }

  return {
    totalTransactions: rows.length,
    totalSales: rows.reduce((s, r) => s + (r.total ?? 0), 0),
    cashSales,
    transferSales,
    qrisSales,
    splitSales,
    deliverySales,
  };
}

export async function closeShift(data: {
  shiftId: string;
  cashierId: string;
  branchId: string;
  openedAt: string;
  closingCash: number;
  notes?: string;
}): Promise<Shift> {
  const now = new Date().toISOString();
  const summary = await getShiftSummary(data.shiftId, data.cashierId, data.branchId, data.openedAt);

  const { error } = await supabase
    .from('shifts')
    .update({
      closing_cash: data.closingCash,
      closed_at: now,
      status: 'closed',
      notes: data.notes ?? null,
      total_transactions: summary.totalTransactions,
      total_sales: summary.totalSales,
    })
    .eq('id', data.shiftId);

  if (error) throw new Error(error.message);

  const { data: shift } = await supabase.from('shifts').select('*').eq('id', data.shiftId).single();
  // Hapus cache shift aktif karena shift sudah ditutup
  await offlineCache.saveActiveShift(null);
  return shift!;
}

export async function getShiftHistory(cashierId: string, branchId: string, limit = 50): Promise<Shift[]> {
  const { data } = await supabase
    .from('shifts')
    .select('*')
    .eq('cashier_id', cashierId)
    .eq('branch_id', branchId)
    .order('opened_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export interface ShiftTransaction {
  id: string;
  invoice_number: string;
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
  member_name: string | null;
  points_earned: number | null;
}

export interface ShiftDetail extends Shift {
  branch_name: string;
  summary: ShiftSummary;
  transactions: ShiftTransaction[];
}

export async function getShiftDetail(shiftId: string): Promise<ShiftDetail | null> {
  const { data: shiftRaw } = await supabase
    .from('shifts')
    .select('*, branches!branch_id(name)')
    .eq('id', shiftId)
    .single();

  if (!shiftRaw) return null;

  const { data: txRaw } = await supabase
    .from('transactions')
    .select('id, invoice_number, total, payment_method, split_payment_detail, status, created_at, points_earned, members!member_id(name)')
    .eq('shift_id', shiftId)
    .order('created_at', { ascending: false });

  const rows = txRaw ?? [];
  const completed = rows.filter((r: any) => r.status === 'completed');

  let cashSales = 0, transferSales = 0, qrisSales = 0, splitSales = 0, deliverySales = 0;
  for (const r of completed) {
    const total = (r as any).total ?? 0;
    const method = (r as any).payment_method;
    if (method === 'cash') { cashSales += total; }
    else if (method === 'transfer') { transferSales += total; }
    else if (method === 'qris') { qrisSales += total; }
    else if (method === 'delivery') { deliverySales += total; }
    else if (method === 'split') {
      const detail = (r as any).split_payment_detail as { cashAmount?: number; secondAmount?: number; secondMethod?: string } | null;
      cashSales += detail?.cashAmount ?? 0;
      const secondAmt = detail?.secondAmount ?? 0;
      if (detail?.secondMethod === 'transfer') transferSales += secondAmt;
      else if (detail?.secondMethod === 'qris') qrisSales += secondAmt;
      else splitSales += total;
    }
  }

  const summary: ShiftSummary = {
    totalTransactions: completed.length,
    totalSales: completed.reduce((s: number, r: any) => s + (r.total ?? 0), 0),
    cashSales,
    transferSales,
    qrisSales,
    splitSales,
    deliverySales,
  };

  const transactions: ShiftTransaction[] = rows.map((r: any) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    total: r.total,
    payment_method: r.payment_method,
    status: r.status,
    created_at: r.created_at,
    member_name: (r.members as any)?.name ?? null,
    points_earned: r.points_earned ?? null,
  }));

  return {
    ...shiftRaw,
    branch_name: (shiftRaw as any).branches?.name ?? '',
    summary,
    transactions,
  };
}

export interface ShiftListItem extends Shift {
  branch_name: string;
}

export async function getShiftsByBranch(
  branchId: string,
  options: { limit?: number; offset?: number; status?: 'open' | 'closed' | 'all'; dateFrom?: string; dateTo?: string } = {}
): Promise<ShiftListItem[]> {
  const { limit = 50, offset = 0, status = 'all', dateFrom, dateTo } = options;

  let q = supabase
    .from('shifts')
    .select('*, branches!branch_id(name)')
    .eq('branch_id', branchId)
    .order('opened_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== 'all') q = (q as any).eq('status', status);
  if (dateFrom) q = (q as any).gte('opened_at', dateFrom);
  if (dateTo) q = (q as any).lte('opened_at', dateTo);

  const { data } = await q;
  return (data ?? []).map((r: any) => ({ ...r, branch_name: r.branches?.name ?? '' }));
}

export async function getAllShifts(
  options: { limit?: number; offset?: number; status?: 'open' | 'closed' | 'all'; dateFrom?: string; dateTo?: string; branchId?: string } = {}
): Promise<ShiftListItem[]> {
  const { limit = 50, offset = 0, status = 'all', dateFrom, dateTo, branchId } = options;

  let q = supabase
    .from('shifts')
    .select('*, branches!branch_id(name)')
    .order('opened_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (branchId) q = (q as any).eq('branch_id', branchId);
  if (status !== 'all') q = (q as any).eq('status', status);
  if (dateFrom) q = (q as any).gte('opened_at', dateFrom);
  if (dateTo) q = (q as any).lte('opened_at', dateTo);

  const { data } = await q;
  return (data ?? []).map((r: any) => ({ ...r, branch_name: r.branches?.name ?? '' }));
}

export interface ShiftStats {
  totalShifts: number;
  openShifts: number;
  closedShifts: number;
  totalSales: number;
  totalTransactions: number;
}

export async function getShiftStats(branchId?: string): Promise<ShiftStats> {
  let q = supabase.from('shifts').select('status, total_sales, total_transactions');
  if (branchId) q = (q as any).eq('branch_id', branchId);

  const { data } = await q;
  const rows = data ?? [];

  return {
    totalShifts: rows.length,
    openShifts: rows.filter((r: any) => r.status === 'open').length,
    closedShifts: rows.filter((r: any) => r.status === 'closed').length,
    totalSales: rows.reduce((s: number, r: any) => s + (r.total_sales ?? 0), 0),
    totalTransactions: rows.reduce((s: number, r: any) => s + (r.total_transactions ?? 0), 0),
  };
}

export async function syncShiftsToSupabase(): Promise<void> {
  // no-op: all writes go directly to Supabase now
}
