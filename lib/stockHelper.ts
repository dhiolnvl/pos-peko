/**
 * Stock Helper — Full Online
 * applyOpname & rejectOpname langsung ke Supabase.
 */

import { supabase } from '@/lib/supabase';

function genId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface ApplyOpnameResult {
  itemsChanged: number;
  itemsSkipped: number;
}

/**
 * Apply approved opname:
 * - Loop setiap opname_item
 * - Kalau selisih != 0: update stok produk + insert stock_movement type 'opname'
 * - Tandai opname status = 'approved'
 */
export async function applyOpname(
  opnameId: string,
  approvedBy: string
): Promise<ApplyOpnameResult> {
  const now = new Date().toISOString();

  // Ambil header opname
  const { data: opname, error: opError } = await supabase
    .from('stock_opname')
    .select('id, branch_id, status')
    .eq('id', opnameId)
    .single();
  if (opError) throw opError;
  if (!opname) throw new Error('Opname tidak ditemukan');
  if (opname.status === 'approved') throw new Error('Opname sudah disetujui sebelumnya');

  // Ambil semua item opname
  const { data: items, error: itemError } = await supabase
    .from('stock_opname_items')
    .select('id, product_id, system_stock, physical_stock, difference, notes')
    .eq('opname_id', opnameId);
  if (itemError) throw itemError;

  let itemsChanged = 0;
  let itemsSkipped = 0;

  for (const item of (items ?? [])) {
    if (item.difference === 0) {
      itemsSkipped++;
      continue;
    }

    // Baca stok terkini dari branch_products
    const { data: bp } = await supabase
      .from('branch_products')
      .select('stock')
      .eq('product_id', item.product_id)
      .eq('branch_id', opname.branch_id)
      .maybeSingle();

    const qtyBefore = bp?.stock ?? item.system_stock;
    const qtyAfter = item.physical_stock;

    // Insert stock movement
    await supabase.from('stock_movements').insert({
      id: genId(),
      product_id: item.product_id,
      branch_id: opname.branch_id,
      type: 'opname',
      quantity: Math.abs(item.difference),
      qty_before: qtyBefore,
      qty_after: qtyAfter,
      reason: item.notes ?? 'Stok Opname',
      reference_id: opnameId,
      created_by: approvedBy,
      created_at: now,
    });

    // Update stok di branch_products
    await supabase
      .from('branch_products')
      .upsert(
        { branch_id: opname.branch_id, product_id: item.product_id, stock: qtyAfter, updated_at: now },
        { onConflict: 'branch_id,product_id' }
      );

    itemsChanged++;
  }

  // Tandai opname approved
  const { error: approveError } = await supabase
    .from('stock_opname')
    .update({ status: 'approved', approved_by: approvedBy, approved_at: now, updated_at: now })
    .eq('id', opnameId);
  if (approveError) throw approveError;

  return { itemsChanged, itemsSkipped };
}

/**
 * Tolak opname: kembalikan ke draft dengan catatan alasan.
 */
export async function rejectOpname(opnameId: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('stock_opname')
    .update({ status: 'draft', notes: note, updated_at: new Date().toISOString() })
    .eq('id', opnameId);
  if (error) throw error;
}
