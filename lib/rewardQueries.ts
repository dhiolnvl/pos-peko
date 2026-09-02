import { supabase } from './supabase';

export interface RewardProduct {
  id: string;
  reward_item_id: string;
  product_id: string | null;
  product_name: string;
  qty: number;
}

export interface RewardItem {
  id: string;
  name: string;
  points_required: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  products?: RewardProduct[];
}

export interface PointRedemption {
  id: string;
  member_id: string;
  reward_item_id: string | null;
  reward_name: string;
  points_used: number;
  transaction_id: string | null;
  created_at: string;
}

const generateUUID = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

function mapRewardRow(row: any): RewardItem {
  return {
    id: row.id,
    name: row.name,
    points_required: row.points_required,
    is_active: row.is_active ? 1 : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    products: (row.reward_item_products ?? []).map((p: any) => ({
      id: p.id,
      reward_item_id: p.reward_item_id,
      product_id: p.product_id ?? null,
      product_name: p.product_name,
      qty: p.qty,
    })),
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getActiveRewardItems(): Promise<RewardItem[]> {
  const { data, error } = await supabase
    .from('reward_items')
    .select('*, reward_item_products(*)')
    .eq('is_active', true)
    .order('points_required', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRewardRow);
}

export async function getAllRewardItems(): Promise<RewardItem[]> {
  const { data, error } = await supabase
    .from('reward_items')
    .select('*, reward_item_products(*)')
    .order('is_active', { ascending: false })
    .order('points_required', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRewardRow);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createRewardItem(data: {
  name: string;
  points_required: number;
  products: { product_id: string; product_name: string; qty: number }[];
}): Promise<void> {
  const id = generateUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('reward_items').insert({
    id,
    name: data.name.trim(),
    points_required: data.points_required,
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(error.message);

  if (data.products.length > 0) {
    const { error: prodErr } = await supabase.from('reward_item_products').insert(
      data.products.map((p) => ({
        id: generateUUID(),
        reward_item_id: id,
        product_id: p.product_id,
        product_name: p.product_name,
        qty: p.qty,
        created_at: now,
      }))
    );
    if (prodErr) throw new Error(prodErr.message);
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateRewardItem(id: string, data: {
  name: string;
  points_required: number;
  products: { product_id: string; product_name: string; qty: number }[];
}): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('reward_items')
    .update({ name: data.name.trim(), points_required: data.points_required, updated_at: now })
    .eq('id', id);
  if (error) throw new Error(error.message);

  const { error: delErr } = await supabase
    .from('reward_item_products')
    .delete()
    .eq('reward_item_id', id);
  if (delErr) throw new Error(delErr.message);

  if (data.products.length > 0) {
    const { error: prodErr } = await supabase.from('reward_item_products').insert(
      data.products.map((p) => ({
        id: generateUUID(),
        reward_item_id: id,
        product_id: p.product_id,
        product_name: p.product_name,
        qty: p.qty,
        created_at: now,
      }))
    );
    if (prodErr) throw new Error(prodErr.message);
  }
}

// ─── Toggle / Delete ──────────────────────────────────────────────────────────

export async function toggleRewardItem(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('reward_items')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteRewardItem(id: string): Promise<void> {
  await supabase.from('reward_item_products').delete().eq('reward_item_id', id);
  const { error } = await supabase.from('reward_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Redeem ───────────────────────────────────────────────────────────────────

export async function redeemPoints(data: {
  memberId: string;
  rewardItemId: string;
  rewardName: string;
  pointsUsed: number;
  transactionId?: string;
}): Promise<void> {
  const id = generateUUID();
  const logId = generateUUID();
  const now = new Date().toISOString();

  const { data: member, error: memberErr } = await supabase
    .from('members')
    .select('points')
    .eq('id', data.memberId)
    .single();

  if (memberErr || !member) throw new Error('Member tidak ditemukan');
  if (member.points < data.pointsUsed) throw new Error('Poin tidak cukup');

  const { error: updateErr } = await supabase
    .from('members')
    .update({ points: member.points - data.pointsUsed, updated_at: now })
    .eq('id', data.memberId);
  if (updateErr) throw new Error(updateErr.message);

  await supabase.from('point_redemptions').insert({
    id,
    member_id: data.memberId,
    reward_item_id: data.rewardItemId,
    reward_name: data.rewardName,
    points_used: data.pointsUsed,
    transaction_id: data.transactionId ?? null,
    created_at: now,
  });

  await supabase.from('member_point_logs').insert({
    id: logId,
    member_id: data.memberId,
    transaction_id: data.transactionId ?? null,
    points: -data.pointsUsed,
    description: `Tukar poin: ${data.rewardName}`,
    created_at: now,
  });
}

export async function getMemberRedemptions(memberId: string): Promise<PointRedemption[]> {
  const { data, error } = await supabase
    .from('point_redemptions')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}
