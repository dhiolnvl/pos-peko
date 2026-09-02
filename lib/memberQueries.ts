import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MEMBER_CACHE_KEY = 'members.cache';

const DEFAULT_POINTS_PER_RUPIAH = 10_000;

export interface Member {
  id: string;
  branch_id: string | null;
  name: string;
  phone: string | null;
  address: string | null;
  points: number;
  total_spent: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  branch_name?: string | null;
}

export interface PointLog {
  id: string;
  member_id: string;
  transaction_id: string;
  points: number;
  description: string | null;
  created_at: string;
}

export async function getPointsPerRupiah(): Promise<number> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'points_per_rupiah')
    .single();
  const parsed = parseInt(data?.value ?? '', 10);
  return !isNaN(parsed) && parsed > 0 ? parsed : DEFAULT_POINTS_PER_RUPIAH;
}

export function calcPoints(total: number, pointsPerRupiah: number = DEFAULT_POINTS_PER_RUPIAH): number {
  return Math.floor(total / pointsPerRupiah);
}

const generateUUID = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

function mapMemberRow(m: any): Member {
  return {
    id: m.id,
    branch_id: m.branch_id ?? null,
    name: m.name,
    phone: m.phone ?? null,
    address: m.address ?? null,
    points: m.points ?? 0,
    total_spent: m.total_spent ?? 0,
    is_active: m.is_active ? 1 : 0,
    created_at: m.created_at,
    updated_at: m.updated_at,
    branch_name: m.branches?.name ?? null,
  };
}

// ─── Cache offline ────────────────────────────────────────────────────────────

export async function cacheMembersLocally(branchId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(500);
    const members = (data ?? []).map(mapMemberRow);
    await AsyncStorage.setItem(`${MEMBER_CACHE_KEY}.${branchId}`, JSON.stringify({ members, updatedAt: Date.now() }));
  } catch {}
}

async function getCachedMembers(branchId: string): Promise<Member[]> {
  try {
    const raw = await AsyncStorage.getItem(`${MEMBER_CACHE_KEY}.${branchId}`);
    if (!raw) return [];
    const { members } = JSON.parse(raw) as { members: Member[]; updatedAt: number };
    return members ?? [];
  } catch { return []; }
}

function filterMembers(members: Member[], q: string): Member[] {
  const lower = q.toLowerCase();
  return members
    .filter((m) => m.name.toLowerCase().includes(lower) || (m.phone ?? '').includes(lower))
    .slice(0, 20);
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchMembers(_branchId: string, q: string): Promise<Member[]> {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .order('name', { ascending: true })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapMemberRow);
  } catch {
    // Offline — cari dari cache
    const cached = await getCachedMembers(_branchId);
    return filterMembers(cached, q);
  }
}

export async function getMemberById(id: string): Promise<Member | null> {
  const { data, error } = await supabase
    .from('members')
    .select('*, branches(name)')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return mapMemberRow(data);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createMember(data: {
  name: string;
  phone?: string;
  address?: string;
  branch_id?: string | null;
}): Promise<Member> {
  return createMemberInSupabase(data);
}

// ─── Points ───────────────────────────────────────────────────────────────────

export async function addPoints(
  memberId: string,
  transactionId: string,
  points: number,
  totalSpent: number,
  description: string
): Promise<void> {
  const now = new Date().toISOString();
  const logId = generateUUID();

  const { data: current } = await supabase
    .from('members')
    .select('points, total_spent')
    .eq('id', memberId)
    .single();

  if (!current) return;

  await supabase
    .from('members')
    .update({
      points: current.points + points,
      total_spent: current.total_spent + totalSpent,
      updated_at: now,
    })
    .eq('id', memberId);

  await supabase.from('member_point_logs').insert({
    id: logId,
    member_id: memberId,
    transaction_id: transactionId,
    points,
    description,
    created_at: now,
  });
}

export async function getMemberPointLogs(memberId: string): Promise<PointLog[]> {
  return getMemberPointLogsFromSupabase(memberId);
}

// ─── Report ───────────────────────────────────────────────────────────────────

export interface MemberReportRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  branch_name: string | null;
  created_at: string;
  total_transactions: number;
  total_sales: number;
  last_visit: string | null;
  avg_visit_per_month: number;
  avg_nominal_per_month: number;
}

export async function getMemberReport(opts: {
  dateFrom?: string | null;
  dateTo?: string | null;
}): Promise<MemberReportRow[]> {
  const dateFrom = opts.dateFrom ? opts.dateFrom + 'T00:00:00' : '1970-01-01T00:00:00';
  const dateTo = opts.dateTo ? opts.dateTo + 'T23:59:59' : '9999-12-31T23:59:59';

  const { data: members, error } = await supabase
    .from('members')
    .select('id, name, phone, address, created_at, branches(name)')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error || !members) return [];

  const { data: txs } = await supabase
    .from('transactions')
    .select('member_id, total, created_at')
    .eq('status', 'completed')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .not('member_id', 'is', null);

  const txMap: Record<string, { total_transactions: number; total_sales: number; last_visit: string; first_transaction: string }> = {};
  for (const tx of txs ?? []) {
    if (!tx.member_id) continue;
    if (!txMap[tx.member_id]) {
      txMap[tx.member_id] = { total_transactions: 0, total_sales: 0, last_visit: tx.created_at, first_transaction: tx.created_at };
    }
    txMap[tx.member_id].total_transactions += 1;
    txMap[tx.member_id].total_sales += tx.total;
    if (tx.created_at > txMap[tx.member_id].last_visit) txMap[tx.member_id].last_visit = tx.created_at;
    if (tx.created_at < txMap[tx.member_id].first_transaction) txMap[tx.member_id].first_transaction = tx.created_at;
  }

  return members.map((m: any) => {
    const stat = txMap[m.id];
    let avgVisit = 0;
    let avgNominal = 0;
    if (stat && stat.total_transactions > 0) {
      const firstMs = new Date(stat.first_transaction).getTime();
      const lastMs = new Date(stat.last_visit).getTime();
      const monthSpan = Math.max((lastMs - firstMs) / (1000 * 60 * 60 * 24 * 30), 1);
      avgVisit = parseFloat((stat.total_transactions / monthSpan).toFixed(1));
      avgNominal = Math.round((stat.total_sales ?? 0) / monthSpan);
    }
    return {
      id: m.id,
      name: m.name,
      phone: m.phone ?? null,
      address: m.address ?? null,
      branch_name: m.branches?.name ?? null,
      created_at: m.created_at,
      total_transactions: stat?.total_transactions ?? 0,
      total_sales: stat?.total_sales ?? 0,
      last_visit: stat?.last_visit ?? null,
      avg_visit_per_month: avgVisit,
      avg_nominal_per_month: avgNominal,
    };
  });
}

// ─── Supabase direct ──────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export async function fetchMembersFromSupabase(opts: {
  page?: number;
  search?: string;
  branchFilter?: 'all' | 'mine' | 'other';
  branchId?: string;
  specificBranchId?: string | null;
} = {}): Promise<{ data: Member[]; hasMore: boolean; total: number }> {
  const page = opts.page ?? 0;
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let q = supabase
    .from('members')
    .select('*, branches(name)', { count: 'exact' })
    .order('name', { ascending: true })
    .range(from, to);

  if (opts.search?.trim()) {
    const s = opts.search.trim();
    q = (q as any).or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
  }

  if (opts.branchFilter === 'mine' && opts.branchId) {
    q = (q as any).eq('branch_id', opts.branchId);
  } else if (opts.branchFilter === 'other' && opts.branchId) {
    q = (q as any).neq('branch_id', opts.branchId);
  }

  if (opts.specificBranchId) {
    q = (q as any).eq('branch_id', opts.specificBranchId);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);

  const total = count ?? 0;
  return {
    data: (data ?? []).map(mapMemberRow),
    hasMore: from + PAGE_SIZE < total,
    total,
  };
}

export async function createMemberInSupabase(data: {
  name: string;
  phone?: string;
  address?: string;
  branch_id?: string | null;
}): Promise<Member> {
  const id = generateUUID();
  const now = new Date().toISOString();

  const { data: row, error } = await supabase
    .from('members')
    .insert({
      id,
      branch_id: data.branch_id ?? null,
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      address: data.address?.trim() || null,
      points: 0,
      total_spent: 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .select('*, branches(name)')
    .single();

  if (error) throw new Error(error.message);

  return mapMemberRow(row);
}

export async function deleteMemberFromSupabase(id: string): Promise<void> {
  const { error } = await supabase
    .from('members')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function toggleMemberActiveInSupabase(id: string, currentIsActive: number): Promise<void> {
  const { error } = await supabase
    .from('members')
    .update({ is_active: !currentIsActive, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getMemberTransactionsFromSupabase(memberId: string): Promise<{
  id: string;
  invoice_number: string;
  total: number;
  payment_method: string;
  created_at: string;
  status: string;
}[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, invoice_number, total, payment_method, created_at, status')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getMemberPointLogsFromSupabase(memberId: string): Promise<PointLog[]> {
  const { data, error } = await supabase
    .from('member_point_logs')
    .select('id, member_id, transaction_id, points, description, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchBranchesFromSupabase(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Tidak lagi dipakai — member sudah full Supabase, bukan SQLite
export async function syncMembersFromSupabase(): Promise<void> {}
export async function syncMembersToSupabase(): Promise<void> {}
