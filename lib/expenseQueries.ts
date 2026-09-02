import { supabase } from './supabase';

const generateUUID = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

export interface Expense {
  id: string;
  branch_id: string;
  category: string;
  description: string;
  amount: number;
  payment_method: 'cash' | 'transfer' | 'qris';
  date: string;
  created_by: string;
  created_by_name: string;
  notes: string | null;
  created_at: string;
}

export interface ExpenseWithBranch extends Expense {
  branch_name: string;
}

export const EXPENSE_CATEGORIES = [
  'Operasional',
  'Listrik & Air',
  'Gaji & Tunjangan',
  'Sewa Tempat',
  'Perawatan & Perbaikan',
  'Transportasi',
  'Perlengkapan Kantor',
  'Marketing & Promosi',
  'Pajak & Administrasi',
  'Lain-lain',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export async function ensureExpenseTable(): Promise<void> {
  // no-op: table lives in Supabase
}

export async function getExpenses(
  branchId: string,
  options: {
    limit?: number;
    offset?: number;
    category?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  } = {}
): Promise<Expense[]> {
  const { limit = 100, offset = 0, category, dateFrom, dateTo, search } = options;

  let q = supabase
    .from('expenses')
    .select('*')
    .eq('branch_id', branchId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== 'all') q = (q as any).eq('category', category);
  if (dateFrom) q = (q as any).gte('date', dateFrom);
  if (dateTo) q = (q as any).lte('date', dateTo);
  if (search) q = (q as any).or(`description.ilike.%${search}%,notes.ilike.%${search}%`);

  const { data } = await q;
  return data ?? [];
}

export async function getAllExpenses(options: {
  limit?: number;
  offset?: number;
  branchId?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
} = {}): Promise<ExpenseWithBranch[]> {
  const { limit = 100, offset = 0, branchId, category, dateFrom, dateTo, search } = options;

  let q = supabase
    .from('expenses')
    .select('*, branches!branch_id(name)')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (branchId) q = (q as any).eq('branch_id', branchId);
  if (category && category !== 'all') q = (q as any).eq('category', category);
  if (dateFrom) q = (q as any).gte('date', dateFrom);
  if (dateTo) q = (q as any).lte('date', dateTo);
  if (search) q = (q as any).or(`description.ilike.%${search}%,notes.ilike.%${search}%`);

  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    ...r,
    branch_name: r.branches?.name ?? '-',
    branches: undefined,
  }));
}

export interface ExpenseStats {
  totalAmount: number;
  totalCount: number;
  byCategory: { category: string; amount: number; count: number }[];
}

export async function getExpenseStats(
  branchId?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<ExpenseStats> {
  let q = supabase.from('expenses').select('category, amount');

  if (branchId) q = (q as any).eq('branch_id', branchId);
  if (dateFrom) q = (q as any).gte('date', dateFrom);
  if (dateTo) q = (q as any).lte('date', dateTo);

  const { data } = await q;
  const rows = data ?? [];

  const totalAmount = rows.reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
  const totalCount = rows.length;

  const catMap: Record<string, { amount: number; count: number }> = {};
  for (const r of rows) {
    if (!catMap[r.category]) catMap[r.category] = { amount: 0, count: 0 };
    catMap[r.category].amount += r.amount ?? 0;
    catMap[r.category].count += 1;
  }

  const byCategory = Object.entries(catMap)
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.amount - a.amount);

  return { totalAmount, totalCount, byCategory };
}

export async function createExpense(data: {
  branchId: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer' | 'qris';
  date: string;
  createdBy: string;
  createdByName: string;
  notes?: string;
}): Promise<Expense> {
  const id = generateUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('expenses').insert({
    id,
    branch_id: data.branchId,
    category: data.category,
    description: data.description,
    amount: data.amount,
    payment_method: data.paymentMethod,
    date: data.date,
    created_by: data.createdBy,
    created_by_name: data.createdByName,
    notes: data.notes ?? null,
    created_at: now,
  });
  if (error) throw new Error(error.message);

  const { data: expense } = await supabase.from('expenses').select('*').eq('id', id).single();
  return expense!;
}

export async function updateExpense(
  id: string,
  data: {
    category: string;
    description: string;
    amount: number;
    paymentMethod: 'cash' | 'transfer' | 'qris';
    date: string;
    notes?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({
      category: data.category,
      description: data.description,
      amount: data.amount,
      payment_method: data.paymentMethod,
      date: data.date,
      notes: data.notes ?? null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function syncExpensesToSupabase(): Promise<void> {
  // no-op: all writes go directly to Supabase now
}
