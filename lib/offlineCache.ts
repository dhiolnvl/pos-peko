import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product, Category, ProductUnit } from '@/store/productStore';
import type { User, Branch } from '@/lib/supabase';
import type { Shift } from '@/lib/shiftQueries';

// Helper AsyncStorage untuk data yang harus persist lintas sesi app
const as = {
  setObject: async <T>(key: string, value: T) => {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  getObject: async <T>(key: string): Promise<T | null> => {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  remove: async (key: string) => {
    await AsyncStorage.removeItem(key);
  },
};

const KEYS = {
  PRODUCTS: 'offline.products',
  CATEGORIES: 'offline.categories',
  PRODUCT_UNITS: 'offline.product_units',
  BRANCH: 'offline.branch',
  USER: 'offline.user',
  CACHED_AT: 'offline.cached_at',
  ACTIVE_SHIFT: 'offline.active_shift',
  PENDING_SHIFT: 'offline.pending_shift',
};

export const offlineCache = {
  saveProducts: async (products: Product[], categories: Category[]) => {
    await as.setObject(KEYS.PRODUCTS, products);
    await as.setObject(KEYS.CATEGORIES, categories);
    await AsyncStorage.setItem(KEYS.CACHED_AT, new Date().toISOString());
  },

  saveProductUnits: async (units: Record<string, ProductUnit[]>) => {
    await as.setObject(KEYS.PRODUCT_UNITS, units);
  },

  getProductUnits: async (productId: string): Promise<ProductUnit[] | null> => {
    const all = await as.getObject<Record<string, ProductUnit[]>>(KEYS.PRODUCT_UNITS);
    if (!all) return null;
    return all[productId] ?? null;
  },

  // Synchronous tidak tersedia via AsyncStorage — kembalikan kosong, caller harus pakai getAllProductUnits async
  getAllProductUnitsSync: (): Record<string, ProductUnit[]> => {
    return {};
  },

  getAllProductUnits: async (): Promise<Record<string, ProductUnit[]>> => {
    return (await as.getObject<Record<string, ProductUnit[]>>(KEYS.PRODUCT_UNITS)) ?? {};
  },

  getProducts: async (): Promise<Product[]> => {
    return (await as.getObject<Product[]>(KEYS.PRODUCTS)) ?? [];
  },

  getCategories: async (): Promise<Category[]> => {
    return (await as.getObject<Category[]>(KEYS.CATEGORIES)) ?? [];
  },

  saveSession: async (user: User, branch: Branch) => {
    // Pakai AsyncStorage (bukan MMKV) agar persist saat app di-close
    await as.setObject(KEYS.USER, user);
    await as.setObject(KEYS.BRANCH, branch);
    const verify = await as.getObject<User>(KEYS.USER);
    console.log('[offlineCache] saveSession selesai, verify read back:', verify?.email ?? 'NULL - GAGAL SIMPAN');
  },

  getUser: async (): Promise<User | null> => {
    const val = await as.getObject<User>(KEYS.USER);
    console.log('[offlineCache] getUser:', val?.email ?? 'null');
    return val;
  },

  getBranch: async (): Promise<Branch | null> => {
    return as.getObject<Branch>(KEYS.BRANCH);
  },

  clearSession: async () => {
    await as.remove(KEYS.USER);
    await as.remove(KEYS.BRANCH);
  },

  getCachedAt: async (): Promise<string | null> => {
    return AsyncStorage.getItem(KEYS.CACHED_AT);
  },

  hasCache: async (): Promise<boolean> => {
    const products = await as.getObject<Product[]>(KEYS.PRODUCTS);
    return Array.isArray(products) && products.length > 0;
  },

  saveActiveShift: async (shift: Shift | null): Promise<void> => {
    if (shift) {
      await as.setObject(KEYS.ACTIVE_SHIFT, shift);
    } else {
      await as.remove(KEYS.ACTIVE_SHIFT);
    }
  },

  getActiveShift: async (): Promise<Shift | null> => {
    return as.getObject<Shift>(KEYS.ACTIVE_SHIFT);
  },

  savePendingShift: async (shift: Shift | null): Promise<void> => {
    if (shift) {
      await as.setObject(KEYS.PENDING_SHIFT, shift);
    } else {
      await as.remove(KEYS.PENDING_SHIFT);
    }
  },

  getPendingShift: async (): Promise<Shift | null> => {
    return as.getObject<Shift>(KEYS.PENDING_SHIFT);
  },
};
