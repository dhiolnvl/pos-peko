import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import { offlineCache } from '@/lib/offlineCache';
import * as Network from 'expo-network';

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductUnit {
  id: string;
  product_id: string;
  label: string;
  price: number;
  multiplier: number;
  is_default: boolean;
}

export interface Product {
  id: string;
  name: string;
  category_id: string | null;
  category_name?: string;
  price: number;
  cost_price: number | null;
  stock: number;
  min_stock: number;
  unit: string | null;
  barcode: string | null;
  image_url: string | null;
  is_active: number;
  is_available?: boolean;
  price_override?: number | null;
  promo_price?: number | null;
  promo_start?: string | null;
  promo_end?: string | null;
  created_at: string;
  updated_at: string;
}

const PAGE_SIZE = 25;

export type ProductSortBy = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc' | 'updated_desc';

// Module-level cache — tidak masuk Zustand state agar tidak trigger re-render
export let unitsCacheMap: Record<string, ProductUnit[]> = {};

interface ProductState {
  products: Product[];
  allProducts: Product[]; // semua produk cabang, untuk barcode lookup — tidak dipaginasi
  categories: Category[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  page: number;
  searchQuery: string;
  selectedCategoryId: string | null;
  filterBranchId: string | null;
  sortBy: ProductSortBy;
  lastFetched: Date | null;
  error: string | null;

  setSearchQuery: (query: string) => void;
  setSelectedCategory: (categoryId: string | null) => void;
  setFilterBranch: (branchId: string | null) => void;
  setSortBy: (sort: ProductSortBy) => void;
  loadProducts: (opts?: { reset?: boolean }) => Promise<void>;
  loadMore: () => Promise<void>;
  loadCategories: () => Promise<void>;
  syncFromSupabase: () => Promise<void>;
  _prefetchAllUnits: () => Promise<void>;
  refreshStockFromSupabase: () => Promise<void>;
  getFilteredProducts: () => Product[];
  clearError: () => void;

  // Kept for compatibility — owner/backoffice product management still uses these
  addProduct: (product: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'is_active'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deactivateProduct: (id: string) => Promise<void>;

  // Category management
  addCategory: (name: string) => Promise<void>;
  updateCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  // Product units
  fetchProductUnits: (productId: string) => Promise<ProductUnit[]>;
  saveProductUnits: (productId: string, units: Omit<ProductUnit, 'id' | 'product_id'>[]) => Promise<void>;
}

function applySortOrder(rows: any[], sortBy: ProductSortBy): any[] {
  return [...rows].sort((a, b) => {
    switch (sortBy) {
      case 'name_asc': return (a.name ?? '').localeCompare(b.name ?? '');
      case 'name_desc': return (b.name ?? '').localeCompare(a.name ?? '');
      case 'price_asc': return (a.price ?? 0) - (b.price ?? 0);
      case 'price_desc': return (b.price ?? 0) - (a.price ?? 0);
      case 'stock_asc': return (a.stock ?? 0) - (b.stock ?? 0);
      case 'stock_desc': return (b.stock ?? 0) - (a.stock ?? 0);
      case 'updated_desc': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      default: return 0;
    }
  });
}

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  allProducts: [],
  categories: [],
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  page: 0,
  sortBy: 'name_asc',
  searchQuery: '',
  selectedCategoryId: null,
  filterBranchId: null,
  lastFetched: null,
  error: null,

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().loadProducts({ reset: true });
  },

  setSelectedCategory: (categoryId) => {
    set({ selectedCategoryId: categoryId });
    get().loadProducts({ reset: true });
  },

  setFilterBranch: (branchId) => {
    set({ filterBranchId: branchId });
    get().loadProducts({ reset: true });
  },

  setSortBy: (sort) => {
    set({ sortBy: sort });
    get().loadProducts({ reset: true });
  },

  loadProducts: async ({ reset = false } = {}) => {
    const authState = useAuthStore.getState();
    const branchId = authState.currentBranch?.id;
    const role = authState.user?.role;

    if (!branchId && role !== 'owner' && role !== 'staff_pusat') {
      set({ isLoading: false, isLoadingMore: false });
      return;
    }

    const { searchQuery, selectedCategoryId, filterBranchId, isLoading, isLoadingMore } = get();
    if (!reset && (isLoading || isLoadingMore)) return;

    const page = reset ? 0 : get().page;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    if (reset) {
      set({ isLoading: true, error: null, page: 0 });
    } else {
      set({ isLoadingMore: true });
    }

    // Cek koneksi dulu — kalau offline langsung ke cache tanpa tunggu timeout network
    const netState = await Network.getNetworkStateAsync();
    const isOffline = !netState.isConnected || !netState.isInternetReachable;

    if (isOffline) {
      const cached = await offlineCache.getProducts();
      const cachedCategories = await offlineCache.getCategories();
      if (cached.length > 0) {
        let rows = cached.filter((p) => p.is_active === 1);
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          rows = rows.filter((p) => p.name?.toLowerCase().includes(q));
        }
        if (selectedCategoryId) {
          rows = rows.filter((p) => p.category_id === selectedCategoryId);
        }
        rows = applySortOrder(rows, get().sortBy);

        const total = rows.length;
        const paged = rows.slice(from, to + 1);

        set((state) => ({
          products: reset ? paged : [...state.products, ...paged],
          allProducts: reset ? cached : state.allProducts,
          categories: reset ? cachedCategories : state.categories,
          hasMore: from + PAGE_SIZE < total,
          page: page + 1,
          lastFetched: null,
          isLoading: false,
          isLoadingMore: false,
          error: null,
        }));
        return;
      }
      set({ isLoading: false, isLoadingMore: false, error: 'Tidak ada koneksi dan cache kosong.' });
      return;
    }

    try {
      const activeBranchId = filterBranchId ?? branchId;

      if (activeBranchId) {
        // Pakai RPC get_products_by_branch yang sudah resolve stok & harga per cabang
        const { data, error } = await supabase.rpc('get_products_by_branch', {
          p_branch_id: activeBranchId,
        });
        if (error) throw error;

        let rows: any[] = data ?? [];

        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          rows = rows.filter((p: any) => p.name?.toLowerCase().includes(q));
        }
        if (selectedCategoryId) {
          rows = rows.filter((p: any) => p.category_id === selectedCategoryId);
        }

        rows = applySortOrder(rows, get().sortBy);

        const total = rows.length;
        const paged = rows.slice(from, to + 1);

        const mapped: Product[] = paged.map((p: any) => ({
          ...p,
          is_active: p.is_active ? 1 : 0,
        }));

        // allProducts: semua produk (tanpa filter/sort/pagination) untuk barcode lookup
        const allMapped: Product[] = reset
          ? (data ?? []).map((p: any) => ({ ...p, is_active: p.is_active ? 1 : 0 }))
          : get().allProducts;

        set((state) => ({
          products: reset ? mapped : [...state.products, ...mapped],
          allProducts: allMapped,
          hasMore: from + PAGE_SIZE < total,
          page: page + 1,
          lastFetched: new Date(),
          isLoading: false,
          isLoadingMore: false,
        }));

        // Cache produk & kategori untuk offline mode (hanya saat reset/full load)
        if (reset) {
          await offlineCache.saveProducts(allMapped, get().categories);
        }
      } else {
        // Owner tanpa filter cabang: tampilkan semua produk global dari katalog
        const { data, error } = await supabase.rpc('get_all_products_for_owner');
        if (error) throw error;

        let rows: any[] = data ?? [];

        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          rows = rows.filter((p: any) => p.name?.toLowerCase().includes(q));
        }
        if (selectedCategoryId) {
          rows = rows.filter((p: any) => p.category_id === selectedCategoryId);
        }

        rows = applySortOrder(rows, get().sortBy);

        const total = rows.length;
        const paged = rows.slice(from, to + 1);

        const mapped: Product[] = paged.map((p: any) => ({
          ...p,
          stock: p.stock ?? 0,
          min_stock: 5,
          is_active: p.is_active ? 1 : 0,
        }));

        const allMapped: Product[] = reset
          ? (data ?? []).map((p: any) => ({ ...p, stock: p.stock ?? 0, min_stock: 5, is_active: p.is_active ? 1 : 0 }))
          : get().allProducts;

        set((state) => ({
          products: reset ? mapped : [...state.products, ...mapped],
          allProducts: allMapped,
          hasMore: from + PAGE_SIZE < total,
          page: page + 1,
          lastFetched: new Date(),
          isLoading: false,
          isLoadingMore: false,
        }));
      }
    } catch (e: any) {
      // Jika gagal fetch (offline), load dari cache dengan pagination lokal
      const cached = await offlineCache.getProducts();
      const cachedCategories = await offlineCache.getCategories();
      if (cached.length > 0) {
        let rows = cached.filter((p) => p.is_active === 1);
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          rows = rows.filter((p) => p.name?.toLowerCase().includes(q));
        }
        if (selectedCategoryId) {
          rows = rows.filter((p) => p.category_id === selectedCategoryId);
        }
        rows = applySortOrder(rows, get().sortBy);

        const total = rows.length;
        const paged = rows.slice(from, to + 1);

        set((state) => ({
          products: reset ? paged : [...state.products, ...paged],
          allProducts: reset ? cached : state.allProducts,
          categories: reset ? cachedCategories : state.categories,
          hasMore: from + PAGE_SIZE < total,
          page: page + 1,
          lastFetched: null,
          isLoading: false,
          isLoadingMore: false,
          error: null,
        }));
        return;
      }
      set({ error: e.message, isLoading: false, isLoadingMore: false });
    }
  },

  loadMore: async () => {
    if (get().isLoadingMore || !get().hasMore) return;
    await get().loadProducts({ reset: false });
  },

  loadCategories: async () => {
    const authState = useAuthStore.getState();
    const branchId = authState.currentBranch?.id;
    const role = authState.user?.role;

    if (!branchId && role !== 'owner' && role !== 'staff_pusat') return;
    try {
      if (branchId) {
        // Pakai RPC — return kategori global + filter availability per cabang
        const { data, error } = await supabase.rpc('get_categories_by_branch', {
          p_branch_id: branchId,
        });
        if (error) throw error;
        set({ categories: data ?? [] });
      } else {
        // Owner tanpa filter cabang: semua kategori global
        const { data } = await supabase
          .from('categories')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true });
        set({ categories: data ?? [] });
      }
    } catch {
      // Fallback ke cached categories saat offline
      const cached = await offlineCache.getCategories();
      if (cached.length > 0) set({ categories: cached });
    }
  },

  // syncFromSupabase alias ke loadProducts untuk backward compat
  syncFromSupabase: async () => {
    await get().loadCategories();
    await get().loadProducts({ reset: true });
    // Prefetch semua product units sekaligus — simpan ke cache untuk offline
    get()._prefetchAllUnits().catch(() => {});
  },

  _prefetchAllUnits: async () => {
    const authState = useAuthStore.getState();
    const branchId = authState.currentBranch?.id;
    if (!branchId) return;
    try {
      const { data } = await supabase
        .from('product_units')
        .select('*')
        .order('multiplier', { ascending: true });
      if (!data?.length) {
        await offlineCache.saveProductUnits({});
        unitsCacheMap = {};
        return;
      }
      const grouped: Record<string, ProductUnit[]> = {};
      for (const u of data) {
        if (!grouped[u.product_id]) grouped[u.product_id] = [];
        grouped[u.product_id].push(u as ProductUnit);
      }
      await offlineCache.saveProductUnits(grouped);
      unitsCacheMap = grouped;
    } catch {
      // Kalau offline, coba load dari AsyncStorage ke in-memory
      const cached = await offlineCache.getAllProductUnits();
      if (Object.keys(cached).length > 0) unitsCacheMap = cached;
    }
  },

  refreshStockFromSupabase: async () => {
    const authState = useAuthStore.getState();
    const branchId = authState.currentBranch?.id;
    const role = authState.user?.role;
    if (!branchId && role !== 'owner' && role !== 'staff_pusat') return;
    if (!branchId) return;
    try {
      // Ambil stok terkini dari branch_products untuk cabang ini
      const { data } = await supabase
        .from('branch_products')
        .select('product_id, stock')
        .eq('branch_id', branchId);
      if (!data?.length) return;
      const stockMap: Record<string, number> = {};
      for (const bp of data) stockMap[bp.product_id] = bp.stock;
      set((state) => ({
        products: state.products.map((p) =>
          stockMap[p.id] !== undefined ? { ...p, stock: stockMap[p.id] } : p
        ),
      }));
    } catch {}
  },

  getFilteredProducts: () => get().products.filter((p) => p.is_active === 1),

  clearError: () => set({ error: null }),

  addCategory: async (name) => {
    const now = new Date().toISOString();
    const maxOrder = get().categories.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);

    const { data, error } = await supabase
      .from('categories')
      .insert({ name, sort_order: maxOrder + 1, created_at: now, updated_at: now })
      .select()
      .single();
    if (error) throw error;

    set((state) => ({ categories: [...state.categories, data] }));
  },

  updateCategory: async (id, name) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('categories')
      .update({ name, updated_at: now })
      .eq('id', id);
    if (error) throw error;
    set((state) => ({
      categories: state.categories.map((c) => c.id === id ? { ...c, name } : c),
    }));
  },

  deleteCategory: async (id) => {
    const { error, count } = await supabase.from('categories').delete({ count: 'exact' }).eq('id', id);
    console.log('[deleteCategory]', JSON.stringify({ id, error, count }));
    if (error) throw error;
    if (count === 0) throw new Error('Gagal menghapus: tidak ada perubahan (mungkin diblokir RLS)');
    set((state) => ({
      categories: state.categories.filter((c) => c.id !== id),
    }));
  },

  addProduct: async (productData) => {
    const authState = useAuthStore.getState();
    const now = new Date().toISOString();
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

    // Simpan produk sebagai global (branch_id = null)
    const { stock, min_stock, ...globalData } = productData as any;
    const { error } = await supabase.from('products').insert({
      id,
      ...globalData,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    if (error) throw new Error(error.message);

    // Daftarkan stok awal ke branch_products untuk cabang aktif
    const branchId = authState.currentBranch?.id;
    if (branchId) {
      await supabase.from('branch_products').insert({
        branch_id: branchId,
        product_id: id,
        stock: stock ?? 0,
        min_stock: min_stock ?? 5,
        is_available: true,
      });
    }

    await get().loadProducts({ reset: true });
  },

  updateProduct: async (id, updates) => {
    const authState = useAuthStore.getState();
    const branchId = authState.currentBranch?.id;
    const now = new Date().toISOString();

    // Pisahkan field branch_products dari field products global
    const { stock, min_stock, price_override, is_available, ...globalUpdates } = updates as any;

    if (Object.keys(globalUpdates).length > 0) {
      const supabaseUpdates: any = { ...globalUpdates, updated_at: now };
      if (globalUpdates.is_active !== undefined) {
        supabaseUpdates.is_active = globalUpdates.is_active === 1 || globalUpdates.is_active === true;
      }
      const { error } = await supabase.from('products').update(supabaseUpdates).eq('id', id);
      if (error) throw new Error(error.message);
    }

    // Update branch_products jika ada field stok/harga yang berubah
    if (branchId && (stock !== undefined || min_stock !== undefined || price_override !== undefined || is_available !== undefined)) {
      const bpUpdates: any = { updated_at: now };
      if (stock !== undefined) bpUpdates.stock = stock;
      if (min_stock !== undefined) bpUpdates.min_stock = min_stock;
      if (price_override !== undefined) bpUpdates.price_override = price_override;
      if (is_available !== undefined) bpUpdates.is_available = is_available;

      await supabase
        .from('branch_products')
        .upsert({ branch_id: branchId, product_id: id, ...bpUpdates }, { onConflict: 'branch_id,product_id' });
    }

    await get().loadProducts({ reset: true });
  },

  deactivateProduct: async (id) => {
    await get().updateProduct(id, { is_active: 0 });
  },

  fetchProductUnits: async (productId) => {
    // In-memory map selalu terisi saat modul di-import (MMKV sync preload)
    if (productId in unitsCacheMap) {
      return unitsCacheMap[productId] ?? [];
    }
    // Map kosong total — cache belum pernah diisi, hindari Supabase call saat offline
    if (Object.keys(unitsCacheMap).length === 0) {
      return [];
    }

    // productId belum ada di cache — fetch dari Supabase (hanya saat online)
    try {
      const { data, error } = await supabase
        .from('product_units')
        .select('*')
        .eq('product_id', productId)
        .order('multiplier', { ascending: true });
      if (error) throw new Error(error.message);
      const units = (data ?? []) as ProductUnit[];

      unitsCacheMap = { ...unitsCacheMap, [productId]: units };
      offlineCache.saveProductUnits(unitsCacheMap).catch(() => {});

      return units;
    } catch {
      return [];
    }
  },

  saveProductUnits: async (productId, units) => {
    // Hapus semua satuan lama lalu insert yang baru
    const { error: delErr } = await supabase
      .from('product_units')
      .delete()
      .eq('product_id', productId);
    if (delErr) throw new Error(delErr.message);

    if (units.length === 0) return;

    const rows = units.map((u) => ({
      product_id: productId,
      label: u.label,
      price: u.price,
      multiplier: u.multiplier,
      is_default: u.is_default,
    }));
    const { error: insErr } = await supabase.from('product_units').insert(rows);
    if (insErr) throw new Error(insErr.message);
  },
}));

// Preload async dari AsyncStorage saat modul di-import
let _unitsCacheReadyResolve: () => void;
const _unitsCacheReady = new Promise<void>((resolve) => { _unitsCacheReadyResolve = resolve; });

offlineCache.getAllProductUnits().then((cached) => {
  if (Object.keys(cached).length > 0) unitsCacheMap = cached;
  _unitsCacheReadyResolve();
}).catch(() => { _unitsCacheReadyResolve(); });

export function awaitUnitsCacheReady(): Promise<void> {
  return _unitsCacheReady;
}
