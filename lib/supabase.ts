/**
 * Supabase Client
 * Configured with MMKV storage for persistent sessions
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/constants/config';
import { mmkvStorageAdapter } from './mmkvStorage';

/**
 * Initialize Supabase client with MMKV storage
 * This allows offline session persistence
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: mmkvStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Database types (will be auto-generated from Supabase)
 */
export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'back_office' | 'cashier';
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserWithBranch extends User {
  branch: Branch | null;
}

/**
 * Auth helper functions
 */

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
};

export const getCurrentSession = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
};

export const changePassword = async (newPassword: string) => {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) throw error;
  return data;
};

/**
 * Get user profile from public.users table
 * Uses RPC function to bypass RLS and avoid recursion
 */
export const getUserProfile = async (userId: string): Promise<UserWithBranch> => {
  // Use RPC function to get current user profile (bypasses RLS)
  const { data, error } = await supabase
    .rpc('get_current_user_profile')
    .single();

  if (error) throw error;
  return data as UserWithBranch;
};

/**
 * Get all active branches (for owner to select)
 * Uses RPC function to bypass RLS and avoid recursion
 */
export const getActiveBranches = async (): Promise<Branch[]> => {
  const { data, error } = await supabase.rpc('get_active_branches');

  if (error) throw error;
  return data as Branch[];
};

/**
 * Get single branch by ID
 * Uses RPC function to bypass RLS and avoid recursion
 */
export const getBranchById = async (branchId: string): Promise<Branch> => {
  const { data, error } = await supabase
    .rpc('get_branch_by_id', { branch_id: branchId })
    .single();

  if (error) throw error;
  return data as Branch;
};

/**
 * Get users in a branch (Owner/Back Office only)
 * Uses RPC function with permission checks
 */
export const getUsersInBranch = async (branchId: string | null = null): Promise<User[]> => {
  const { data, error } = await supabase
    .rpc('get_users_in_branch', { target_branch_id: branchId });

  if (error) throw error;
  return data as User[];
};

/**
 * Get ALL users across all branches (Owner only)
 */
export const getAllUsersOwner = async (): Promise<User[]> => {
  const { data, error } = await supabase.rpc('get_all_users_owner');
  if (error) throw error;
  return (data ?? []) as User[];
};

/**
 * Get ALL branches including inactive (Owner only, for management screen)
 */
export const getAllBranchesOwner = async (): Promise<Branch[]> => {
  const { data, error } = await supabase.rpc('get_all_branches_owner');
  if (error) throw error;
  return data as Branch[];
};

/**
 * Call edge function to create a new user (Owner only)
 * This uses Supabase Admin API via edge function
 */
export const createUserAccount = async (params: {
  email: string;
  password: string;
  name: string;
  role: 'back_office' | 'cashier';
  branch_id: string;
}) => {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: params,
  });

  if (error) {
    // FunctionsHttpError: context adalah Response object — baca body untuk pesan asli
    try {
      const ctx = (error as any).context as Response | undefined;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        throw new Error(body?.error ?? body?.message ?? error.message);
      }
    } catch (inner: any) {
      // Kalau inner bukan dari parse JSON, lempar inner (pesan asli sudah ada)
      if (inner.message && inner.message !== error.message) throw inner;
    }
    throw error;
  }

  if (data && data.success === false) {
    throw new Error(data.error ?? 'Gagal membuat akun');
  }

  return data;
};

export default supabase;
