/**
 * AsyncStorage Adapter for Supabase Auth
 * (Supabase client butuh async interface — tetap pakai AsyncStorage untuk ini saja)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MMKV } from 'react-native-mmkv';
import type { StorageAdapter } from '@supabase/supabase-js';

export const mmkvStorageAdapter: StorageAdapter = {
  getItem: async (key: string) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error('AsyncStorage setItem error:', error);
    }
  },
  removeItem: async (key: string) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('AsyncStorage removeItem error:', error);
    }
  },
};

// In-memory fallback untuk environment tanpa JSI (Chrome debugger, Jest, dll)
const memoryStore: Record<string, string> = {};
const fallback = {
  getString: (key: string) => memoryStore[key] ?? undefined,
  set: (key: string, value: string | number | boolean) => { memoryStore[key] = String(value); },
  getNumber: (key: string) => { const v = memoryStore[key]; return v !== undefined ? Number(v) : undefined; },
  getBoolean: (key: string) => { const v = memoryStore[key]; return v !== undefined ? v === 'true' : undefined; },
  delete: (key: string) => { delete memoryStore[key]; },
  clearAll: () => { Object.keys(memoryStore).forEach(k => delete memoryStore[k]); },
  contains: (key: string) => key in memoryStore,
};

let _storage: MMKV | typeof fallback | null = null;

function store(): MMKV | typeof fallback {
  if (_storage) return _storage;
  try {
    _storage = new MMKV({ id: 'qasio-offline-cache' });
    console.log('[MMKV] initialized: MMKV native');
  } catch (e) {
    console.log('[MMKV] MMKV gagal, pakai in-memory fallback:', e);
    _storage = fallback;
  }
  return _storage;
}

/**
 * Storage helpers — semua operasi synchronous (tidak ada await)
 */
export const mmkv = {
  getString: async (key: string): Promise<string | null> => {
    return store().getString(key) ?? null;
  },
  setString: async (key: string, value: string): Promise<void> => {
    store().set(key, value);
  },

  getNumber: async (key: string): Promise<number | null> => {
    return store().getNumber(key) ?? null;
  },
  setNumber: async (key: string, value: number): Promise<void> => {
    store().set(key, value);
  },

  getBoolean: async (key: string): Promise<boolean | null> => {
    const v = store().getBoolean(key);
    return v === undefined ? null : v;
  },
  setBoolean: async (key: string, value: boolean): Promise<void> => {
    store().set(key, value);
  },

  getObject: async <T = any>(key: string): Promise<T | null> => {
    try {
      const value = store().getString(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  },
  setObject: async <T = any>(key: string, value: T): Promise<void> => {
    try {
      store().set(key, JSON.stringify(value));
    } catch (error) {
      console.error('MMKV setObject error:', error);
    }
  },

  delete: async (key: string): Promise<void> => {
    store().delete(key);
  },

  clearAll: async (): Promise<void> => {
    store().clearAll();
  },

  contains: async (key: string): Promise<boolean> => {
    return store().contains(key);
  },
};

/**
 * Synchronous variant — untuk hot path (add to cart) tanpa async/await
 */
export const mmkvSync = {
  getObject: <T = any>(key: string): T | null => {
    try {
      const value = store().getString(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  },
  setObject: <T = any>(key: string, value: T): void => {
    try {
      store().set(key, JSON.stringify(value));
    } catch (error) {
      console.error('MMKV setObject error:', error);
    }
  },
  getString: (key: string): string | null => {
    return store().getString(key) ?? null;
  },
  contains: (key: string): boolean => {
    return store().contains(key);
  },
};

export const StorageKeys = {
  AUTH_SESSION: 'auth.session',
  CURRENT_USER: 'auth.current_user',
  CURRENT_BRANCH: 'auth.current_branch',
  THEME: 'settings.theme',
  LANGUAGE: 'settings.language',
  PRINTER_CONFIG: 'settings.printer',
  LAST_SYNC: 'sync.last_sync_time',
  OFFLINE_MODE: 'app.offline_mode',
  HAS_SEEN_ONBOARDING: 'app.has_seen_onboarding',
  FIRST_LAUNCH: 'app.first_launch',
  SYNC_MEMBERS_PULLED: 'sync.members_pulled_v1',
  HELD_TRANSACTIONS: 'pos.held_transactions',
} as const;

export default mmkv;
