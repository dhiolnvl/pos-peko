import { supabase } from './supabase';
import { useAuthStore } from '@/store/authStore';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface RefundItem {
  product_id: string | null;
  product_name: string;
  quantity: number;
  price: number;
  subtotal: number;
  max_quantity: number;
}

export interface ProcessRefundInput {
  originalTransactionId: string;
  originalInvoice: string;
  items: RefundItem[];
  reason: string;
}

export interface ProcessRefundResult {
  refundId: string;
  refundInvoice: string;
  totalRefund: number;
}

export const processRefund = async (
  input: ProcessRefundInput
): Promise<ProcessRefundResult> => {
  const { originalTransactionId, originalInvoice, items, reason } = input;

  const authState = useAuthStore.getState();
  const cashierId = authState.user?.id;
  const branchId = authState.currentBranch?.id;

  if (!cashierId || !branchId) throw new Error('User atau cabang tidak ditemukan');
  if (items.length === 0) throw new Error('Pilih minimal 1 item untuk refund');
  if (items.some((i) => i.quantity <= 0)) throw new Error('Qty refund harus lebih dari 0');

  const now = new Date().toISOString();
  const dateStr = now.slice(0, 10).replace(/-/g, '');

  // Generate refund invoice number
  const { data: branch } = await supabase
    .from('branches')
    .select('name')
    .eq('id', branchId)
    .single();
  const branchCode = (branch?.name ?? 'XXX').substring(0, 3).toUpperCase().replace(/\s/g, '');

  const { count } = await supabase
    .from('refunds')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', branchId)
    .gte('created_at', now.slice(0, 10) + 'T00:00:00.000Z')
    .lte('created_at', now.slice(0, 10) + 'T23:59:59.999Z');

  const seq = ((count ?? 0) + 1).toString().padStart(4, '0');
  const refundInvoice = `RFN/${dateStr}/${branchCode}/${seq}`;
  const totalRefund = items.reduce((s, i) => s + i.subtotal, 0);
  const refundId = uuid();

  // Insert refund header
  const { error: refundErr } = await supabase.from('refunds').insert({
    id: refundId,
    original_transaction_id: originalTransactionId,
    refund_invoice: refundInvoice,
    branch_id: branchId,
    cashier_id: cashierId,
    total_refund: totalRefund,
    reason,
    created_at: now,
  });
  if (refundErr) throw new Error(refundErr.message);

  // Insert refund items + kembalikan stok
  for (const item of items) {
    await supabase.from('refund_items').insert({
      id: uuid(),
      refund_id: refundId,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.subtotal,
      created_at: now,
    });

    if (item.product_id) {
      // Baca stok terkini dari branch_products (per cabang)
      const { data: bp } = await supabase
        .from('branch_products')
        .select('stock')
        .eq('product_id', item.product_id)
        .eq('branch_id', branchId)
        .maybeSingle();

      if (bp !== null) {
        const newStock = (bp?.stock ?? 0) + item.quantity;

        // Update stok di branch_products
        await supabase
          .from('branch_products')
          .upsert(
            { branch_id: branchId, product_id: item.product_id, stock: newStock, updated_at: now },
            { onConflict: 'branch_id,product_id' }
          );

        await supabase.from('stock_movements').insert({
          id: uuid(),
          product_id: item.product_id,
          branch_id: branchId,
          type: 'adjustment_in',
          quantity: item.quantity,
          qty_before: bp?.stock ?? 0,
          qty_after: newStock,
          reason: `Refund ${refundInvoice} dari ${originalInvoice}`,
          reference_id: refundId,
          created_by: cashierId,
          created_at: now,
        });
      }
    }
  }

  // Tandai transaksi asli sebagai refunded
  await supabase
    .from('transactions')
    .update({ status: 'refunded', updated_at: now })
    .eq('id', originalTransactionId)
    .eq('status', 'completed');

  return { refundId, refundInvoice, totalRefund };
};
