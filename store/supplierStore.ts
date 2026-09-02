import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface Supplier {
  id: string;
  branch_id: string | null;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierParams {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
}

const generateId = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

interface SupplierState {
  suppliers: Supplier[];
  isLoading: boolean;
  error: string | null;

  loadSuppliers: () => Promise<void>;
  syncFromSupabase: () => Promise<void>;
  addSupplier: (params: CreateSupplierParams) => Promise<Supplier>;
  updateSupplier: (id: string, params: Partial<CreateSupplierParams>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useSupplierStore = create<SupplierState>((set, get) => ({
  suppliers: [],
  isLoading: false,
  error: null,

  loadSuppliers: async () => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      set({
        suppliers: (data ?? []).map((s: any) => ({ ...s, is_active: 1 })),
        isLoading: false,
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  syncFromSupabase: async () => {
    await get().loadSuppliers();
  },

  addSupplier: async (params: CreateSupplierParams) => {
    try {
      set({ isLoading: true, error: null });
      if (!params.name.trim()) throw new Error('Nama supplier harus diisi');

      const id = generateId();
      const now = new Date().toISOString();

      const { error } = await supabase.from('suppliers').insert({
        id,
        branch_id: null,
        name: params.name.trim(),
        phone: params.phone?.trim() || null,
        address: params.address?.trim() || null,
        notes: params.notes?.trim() || null,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
      if (error) throw new Error(error.message);

      const newSupplier: Supplier = {
        id,
        branch_id: null,
        name: params.name.trim(),
        phone: params.phone?.trim() || null,
        address: params.address?.trim() || null,
        notes: params.notes?.trim() || null,
        is_active: 1,
        created_at: now,
        updated_at: now,
      };

      set((state) => ({
        suppliers: [...state.suppliers, newSupplier].sort((a, b) => a.name.localeCompare(b.name)),
        isLoading: false,
      }));

      return newSupplier;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  updateSupplier: async (id: string, params: Partial<CreateSupplierParams>) => {
    try {
      set({ isLoading: true, error: null });
      const now = new Date().toISOString();

      const updates: any = { updated_at: now };
      if (params.name !== undefined) updates.name = params.name.trim();
      if (params.phone !== undefined) updates.phone = params.phone?.trim() || null;
      if (params.address !== undefined) updates.address = params.address?.trim() || null;
      if (params.notes !== undefined) updates.notes = params.notes?.trim() || null;

      const { error } = await supabase.from('suppliers').update(updates).eq('id', id);
      if (error) throw new Error(error.message);

      set((state) => ({
        suppliers: state.suppliers
          .map((s) => s.id === id ? { ...s, ...updates } : s)
          .sort((a, b) => a.name.localeCompare(b.name)),
        isLoading: false,
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  deleteSupplier: async (id: string) => {
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(error.message);
      set((state) => ({ suppliers: state.suppliers.filter((s) => s.id !== id) }));
    } catch (error: any) {
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
