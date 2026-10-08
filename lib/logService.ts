import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export type ActionType = 'auth' | 'transaction' | 'inventory' | 'management' | 'settings' | 'system';

export interface ActivityLog {
  id: string;
  user_id: string | null;
  user_name: string;
  user_role: string;
  branch_id: string | null;
  branch_name: string | null;
  action: string;
  action_type: ActionType;
  description: string;
  details?: Record<string, any> | null;
  created_at: string;
}

export interface LogActivityInput {
  action: string;
  action_type: ActionType;
  description: string;
  details?: Record<string, any> | null;
  user_id?: string;
  user_name?: string;
  user_role?: string;
  branch_id?: string;
  branch_name?: string;
}

export interface GetLogsOptions {
  branchId?: string | null;
  actionType?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

// Memory / local fallback buffer for offline or before database migration
const localLogsMemory: ActivityLog[] = [];

/**
 * Record a system activity log
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const state = useAuthStore.getState();
    const user = state.user;
    const branch = state.currentBranch;

    const userId = input.user_id ?? user?.id ?? null;
    const userName = input.user_name ?? user?.name ?? 'Pengguna';
    const userRole = input.user_role ?? user?.role ?? 'user';
    const branchId = input.branch_id ?? branch?.id ?? null;
    const branchName = input.branch_name ?? branch?.name ?? null;

    const newLog: ActivityLog = {
      id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      user_name: userName,
      user_role: userRole,
      branch_id: branchId,
      branch_name: branchName,
      action: input.action,
      action_type: input.action_type,
      description: input.description,
      details: input.details ?? null,
      created_at: new Date().toISOString(),
    };

    // Save to local memory for instant fallback view
    localLogsMemory.unshift(newLog);

    if (state.isOfflineMode) {
      console.log('[LOG] Offline mode: activity saved to local memory buffer');
      return;
    }

    // Try calling Supabase RPC function first
    const { error: rpcErr } = await supabase.rpc('log_activity', {
      p_user_id: userId,
      p_user_name: userName,
      p_user_role: userRole,
      p_action: input.action,
      p_action_type: input.action_type,
      p_description: input.description,
      p_branch_id: branchId,
      p_branch_name: branchName,
      p_details: input.details ?? null,
    });

    if (rpcErr) {
      // Fallback: direct insert to activity_logs table
      const { error: insertErr } = await supabase.from('activity_logs').insert([{
        user_id: userId,
        user_name: userName,
        user_role: userRole,
        action: input.action,
        action_type: input.action_type,
        description: input.description,
        branch_id: branchId,
        branch_name: branchName,
        details: input.details ?? null,
      }]);

      if (insertErr) {
        console.log('[LOG] Could not sync log to Supabase (table/RPC may not be created yet):', insertErr.message);
      }
    }
  } catch (err: any) {
    console.log('[LOG] Log activity error caught (non-blocking):', err?.message ?? err);
  }
}

/**
 * Fetch activity logs for Owner screen
 */
export async function getActivityLogs(options: GetLogsOptions = {}): Promise<ActivityLog[]> {
  const { branchId, actionType, search, limit = 50, offset = 0 } = options;

  try {
    // 1. Try Supabase RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_activity_logs', {
      p_branch_id: branchId || null,
      p_action_type: actionType || null,
      p_search: search || null,
      p_limit: limit,
      p_offset: offset,
    });

    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      return rpcData as ActivityLog[];
    }

    // 2. Try direct select if RPC failed or returned empty
    let query = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (branchId) query = query.eq('branch_id', branchId);
    if (actionType && actionType !== 'all') query = query.eq('action_type', actionType);
    if (search && search.trim() !== '') {
      query = query.or(`description.ilike.%${search}%,user_name.ilike.%${search}%,action.ilike.%${search}%`);
    }

    const { data: tableData, error: tableError } = await query;

    if (!tableError && Array.isArray(tableData) && tableData.length > 0) {
      return tableData as ActivityLog[];
    }
  } catch (err: any) {
    console.log('[LOG] Fetch DB activity logs warning:', err?.message ?? err);
  }

  // 3. Fallback to local memory buffer filtered
  let filtered = [...localLogsMemory];
  if (branchId) {
    filtered = filtered.filter((l) => l.branch_id === branchId);
  }
  if (actionType && actionType !== 'all') {
    filtered = filtered.filter((l) => l.action_type === actionType);
  }
  if (search && search.trim() !== '') {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (l) =>
        l.description.toLowerCase().includes(q) ||
        l.user_name.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.branch_name && l.branch_name.toLowerCase().includes(q))
    );
  }

  return filtered.slice(offset, offset + limit);
}
