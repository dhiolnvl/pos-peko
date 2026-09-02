/**
 * Warehouse (Gudang Pusat) Query Helpers — Supabase
 * Digunakan oleh role staff_pusat
 */

import { supabase } from '@/lib/supabase';
import {
  Warehouse,
  PurchaseOrder,
  PurchaseOrderItem,
  StockTransfer,
  StockTransferItem,
} from '@/types';

// ─── Formatters ───────────────────────────────────────────────────────────────

export function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n);
}

// ─── Local Types ──────────────────────────────────────────────────────────────

export interface WarehouseStockRow {
  product_id: string;
  product_name: string;
  category_name: string;
  barcode: string | null;
  unit: string;
  stock: number;
  min_stock: number;
  cost_price: number;
}

export interface PurchaseOrderHeader {
  id: string;
  warehouse_id: string | null;
  supplier_name: string;
  supplier_phone: string | null;
  notes: string | null;
  total_items: number;
  total_amount: number;
  status: string;
  received_at: string | null;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string | null;
}

export interface PurchaseOrderItemRow {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  cost_price: number;
  subtotal: number;
}

export interface StockTransferHeader {
  id: string;
  warehouse_id: string;
  branch_id: string;
  branch_name: string;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_by_name: string;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface StockTransferItemRow {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  cost_price: number | null;
}

export interface PendingOpname {
  id: string;
  branch_id: string;
  branch_name: string;
  created_by_name: string;
  created_at: string;
  item_count: number;
  total_difference: number;
  notes: string | null;
  status: string;
  review_notes: string | null;
}

// ─── 1. Gudang ────────────────────────────────────────────────────────────────

export async function getWarehouses(): Promise<Warehouse[]> {
  const { data, error } = await supabase
    .from('warehouse')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return (data ?? []) as Warehouse[];
}

// ─── 2. Stok Gudang ───────────────────────────────────────────────────────────

export async function getWarehouseStock(warehouseId: string): Promise<WarehouseStockRow[]> {
  const { data, error } = await supabase
    .from('warehouse_stock')
    .select(`
      product_id,
      stock,
      min_stock,
      products!product_id(
        name,
        barcode,
        unit,
        cost_price,
        categories!category_id(name)
      )
    `)
    .eq('warehouse_id', warehouseId);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    product_id: row.product_id,
    product_name: row.products?.name ?? 'Produk Dihapus',
    category_name: row.products?.categories?.name ?? 'Tanpa Kategori',
    barcode: row.products?.barcode ?? null,
    unit: row.products?.unit ?? 'pcs',
    stock: row.stock ?? 0,
    min_stock: row.min_stock ?? 0,
    cost_price: row.products?.cost_price ?? 0,
  }));
}

// ─── 3. List Purchase Orders ──────────────────────────────────────────────────

export async function getPurchaseOrders(warehouseId: string): Promise<PurchaseOrderHeader[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      warehouse_id,
      supplier_name,
      supplier_phone,
      status,
      notes,
      total_items,
      total_amount,
      received_at,
      created_by,
      created_at,
      updated_at,
      users!created_by(name)
    `)
    .eq('warehouse_id', warehouseId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    warehouse_id: row.warehouse_id,
    supplier_name: row.supplier_name,
    supplier_phone: row.supplier_phone ?? null,
    status: row.status,
    notes: row.notes ?? null,
    received_at: row.received_at ?? null,
    created_by: row.created_by ?? null,
    created_by_name: row.users?.name ?? 'Unknown',
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    total_items: row.total_items ?? 0,
    total_amount: row.total_amount ?? 0,
  }));
}

// ─── 4. Detail Purchase Order ─────────────────────────────────────────────────

export async function getPurchaseOrderDetail(poId: string): Promise<{
  header: PurchaseOrderHeader;
  items: PurchaseOrderItemRow[];
}> {
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      warehouse_id,
      supplier_name,
      supplier_phone,
      status,
      notes,
      total_items,
      total_amount,
      received_at,
      created_by,
      created_at,
      updated_at,
      users!created_by(name)
    `)
    .eq('id', poId)
    .single();

  if (poError) throw poError;

  const { data: items, error: itemError } = await supabase
    .from('purchase_order_items')
    .select(`
      id,
      product_id,
      product_name,
      quantity,
      cost_price,
      subtotal
    `)
    .eq('po_id', poId)
    .order('product_name');

  if (itemError) throw itemError;

  const header: PurchaseOrderHeader = {
    id: po.id,
    warehouse_id: po.warehouse_id,
    supplier_name: po.supplier_name,
    supplier_phone: (po as any).supplier_phone ?? null,
    status: po.status,
    notes: po.notes ?? null,
    received_at: (po as any).received_at ?? null,
    created_by: (po as any).created_by ?? null,
    created_by_name: (po as any).users?.name ?? 'Unknown',
    created_at: po.created_at,
    updated_at: (po as any).updated_at ?? null,
    total_items: po.total_items ?? 0,
    total_amount: po.total_amount ?? 0,
  };

  const mappedItems: PurchaseOrderItemRow[] = (items ?? []).map((i: any) => ({
    id: i.id,
    product_id: i.product_id,
    product_name: i.product_name,
    quantity: i.quantity,
    cost_price: i.cost_price,
    subtotal: i.subtotal,
  }));

  return { header, items: mappedItems };
}

// ─── 5. Buat Purchase Order ───────────────────────────────────────────────────

export async function createPurchaseOrder(data: {
  warehouseId: string;
  supplierName: string;
  supplierPhone?: string;
  notes?: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    costPrice: number;
  }[];
}): Promise<string> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Tidak ada sesi aktif');

  const totalItems = data.items.length;
  const totalAmount = data.items.reduce(
    (sum, item) => sum + item.quantity * item.costPrice,
    0
  );

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      warehouse_id: data.warehouseId,
      supplier_name: data.supplierName,
      supplier_phone: data.supplierPhone ?? null,
      notes: data.notes ?? null,
      status: 'draft',
      total_items: totalItems,
      total_amount: totalAmount,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (poError) throw poError;

  const poId = po.id;

  const itemRows = data.items.map((item) => ({
    po_id: poId,
    product_id: item.productId,
    product_name: item.productName,
    quantity: item.quantity,
    cost_price: item.costPrice,
    subtotal: item.quantity * item.costPrice,
  }));

  const { error: itemError } = await supabase
    .from('purchase_order_items')
    .insert(itemRows);

  if (itemError) throw itemError;

  return poId;
}

// ─── 6. Terima Purchase Order ─────────────────────────────────────────────────

export async function receivePurchaseOrder(poId: string): Promise<void> {
  const { error } = await supabase.rpc('receive_purchase_to_warehouse', { p_po_id: poId });
  if (error) throw error;
}

// ─── 7. Hapus Purchase Order ──────────────────────────────────────────────────

export async function deletePurchaseOrder(poId: string): Promise<void> {
  const { data: po, error: checkError } = await supabase
    .from('purchase_orders')
    .select('status')
    .eq('id', poId)
    .single();

  if (checkError) throw checkError;
  if (po.status !== 'draft') {
    throw new Error('Hanya PO dengan status draft yang dapat dihapus');
  }

  const { error: itemError } = await supabase
    .from('purchase_order_items')
    .delete()
    .eq('po_id', poId);

  if (itemError) throw itemError;

  const { error: poError } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('id', poId);

  if (poError) throw poError;
}

// ─── 8. List Stock Transfers ──────────────────────────────────────────────────

export async function getStockTransfers(warehouseId: string): Promise<StockTransferHeader[]> {
  const { data, error } = await supabase
    .from('stock_transfers')
    .select(`
      id,
      warehouse_id,
      branch_id,
      status,
      notes,
      created_by,
      sent_at,
      created_at,
      updated_at,
      branches!branch_id(name),
      users!created_by(name)
    `)
    .eq('warehouse_id', warehouseId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    warehouse_id: row.warehouse_id,
    branch_id: row.branch_id,
    branch_name: row.branches?.name ?? 'Unknown',
    status: row.status,
    notes: row.notes ?? null,
    created_by: row.created_by ?? null,
    created_by_name: row.users?.name ?? 'Unknown',
    sent_at: row.sent_at ?? null,
    received_at: row.received_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
  }));
}

// ─── 9. Detail Stock Transfer ─────────────────────────────────────────────────

export async function getStockTransferDetail(transferId: string): Promise<{
  header: StockTransferHeader;
  items: StockTransferItemRow[];
}> {
  const { data: transfer, error: transferError } = await supabase
    .from('stock_transfers')
    .select(`
      id,
      warehouse_id,
      branch_id,
      status,
      notes,
      created_by,
      sent_at,
      received_at,
      created_at,
      updated_at,
      branches!branch_id(name),
      users!created_by(name)
    `)
    .eq('id', transferId)
    .single();

  if (transferError) throw transferError;

  const { data: items, error: itemError } = await supabase
    .from('stock_transfer_items')
    .select(`
      id,
      product_id,
      quantity,
      cost_price,
      products!product_id(name)
    `)
    .eq('transfer_id', transferId)
    .order('product_id');

  if (itemError) throw itemError;

  const header: StockTransferHeader = {
    id: transfer.id,
    warehouse_id: transfer.warehouse_id,
    branch_id: transfer.branch_id,
    branch_name: (transfer as any).branches?.name ?? 'Unknown',
    status: transfer.status,
    notes: transfer.notes ?? null,
    created_by: (transfer as any).created_by ?? null,
    created_by_name: (transfer as any).users?.name ?? 'Unknown',
    sent_at: transfer.sent_at ?? null,
    received_at: (transfer as any).received_at ?? null,
    created_at: transfer.created_at,
    updated_at: (transfer as any).updated_at ?? null,
  };

  const mappedItems: StockTransferItemRow[] = (items ?? []).map((i: any) => ({
    id: i.id,
    product_id: i.product_id,
    product_name: i.products?.name ?? 'Produk Dihapus',
    quantity: i.quantity,
    cost_price: i.cost_price ?? null,
  }));

  return { header, items: mappedItems };
}

// ─── 10. Buat Stock Transfer ──────────────────────────────────────────────────

export async function createStockTransfer(data: {
  warehouseId: string;
  branchId: string;
  notes?: string;
  items: {
    productId: string;
    quantity: number;
    costPrice?: number;
  }[];
}): Promise<string> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Tidak ada sesi aktif');

  const { data: transfer, error: transferError } = await supabase
    .from('stock_transfers')
    .insert({
      warehouse_id: data.warehouseId,
      branch_id: data.branchId,
      notes: data.notes ?? null,
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (transferError) throw transferError;

  const transferId = transfer.id;

  const itemRows = data.items.map((item) => ({
    transfer_id: transferId,
    product_id: item.productId,
    quantity: item.quantity,
    cost_price: item.costPrice ?? null,
  }));

  const { error: itemError } = await supabase
    .from('stock_transfer_items')
    .insert(itemRows);

  if (itemError) throw itemError;

  return transferId;
}

// ─── 11. Kirim Stock Transfer ─────────────────────────────────────────────────

export async function sendStockTransfer(transferId: string): Promise<void> {
  const { error } = await supabase.rpc('send_stock_transfer', { p_transfer_id: transferId });
  if (error) throw error;
}

// ─── 12. Hapus Stock Transfer ─────────────────────────────────────────────────

export async function deleteStockTransfer(transferId: string): Promise<void> {
  const { data: transfer, error: checkError } = await supabase
    .from('stock_transfers')
    .select('status')
    .eq('id', transferId)
    .single();

  if (checkError) throw checkError;
  if (transfer.status !== 'draft') {
    throw new Error('Hanya transfer dengan status draft yang dapat dihapus');
  }

  const { error: itemError } = await supabase
    .from('stock_transfer_items')
    .delete()
    .eq('transfer_id', transferId);

  if (itemError) throw itemError;

  const { error: transferError } = await supabase
    .from('stock_transfers')
    .delete()
    .eq('id', transferId);

  if (transferError) throw transferError;
}

// ─── 13. Opname Pending (untuk review) ───────────────────────────────────────

export async function getPendingOpnamesForReview(): Promise<PendingOpname[]> {
  const { data, error } = await supabase
    .from('stock_opname')
    .select(`
      id, branch_id, notes, status, review_notes, created_at,
      branches(name),
      users!created_by(name),
      stock_opname_items(difference)
    `)
    .eq('status', 'submitted')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const items: { difference: number }[] = row.stock_opname_items ?? [];
    return {
      id: row.id,
      branch_id: row.branch_id,
      branch_name: row.branches?.name ?? 'Unknown',
      created_by_name: row.users?.name ?? 'Unknown',
      created_at: row.created_at,
      item_count: items.length,
      total_difference: items.reduce((s, i) => s + Math.abs(i.difference ?? 0), 0),
      notes: row.notes ?? null,
      status: row.status ?? 'submitted',
      review_notes: row.review_notes ?? null,
    };
  });
}

// ─── 13b. Semua Opname (untuk staff pusat — semua status) ─────────────────────

export async function getAllOpnamesForStaffPusat(): Promise<PendingOpname[]> {
  const { data, error } = await supabase
    .from('stock_opname')
    .select(`
      id, branch_id, notes, status, review_notes, created_at,
      branches(name),
      users!created_by(name),
      stock_opname_items(difference)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const items: { difference: number }[] = row.stock_opname_items ?? [];
    return {
      id: row.id,
      branch_id: row.branch_id,
      branch_name: row.branches?.name ?? 'Unknown',
      created_by_name: row.users?.name ?? 'Unknown',
      created_at: row.created_at,
      item_count: items.length,
      total_difference: items.reduce((s, i) => s + Math.abs(i.difference ?? 0), 0),
      notes: row.notes ?? null,
      status: row.status ?? 'draft',
      review_notes: row.review_notes ?? null,
    };
  });
}

// ─── 14. Detail Opname (untuk review) ────────────────────────────────────────

export async function getOpnameDetailForReview(opnameId: string): Promise<{
  header: {
    id: string;
    branch_id: string;
    branch_name: string;
    status: string;
    created_by_name: string;
    notes: string | null;
    created_at: string;
  };
  items: {
    id: string;
    product_id: string;
    product_name: string;
    system_stock: number;
    physical_stock: number;
    difference: number;
    notes: string | null;
  }[];
}> {
  const { data: opname, error: opError } = await supabase
    .from('stock_opname')
    .select('id, branch_id, status, notes, created_at, branches(name), users!created_by(name)')
    .eq('id', opnameId)
    .single();

  if (opError) throw opError;

  const { data: items, error: itemError } = await supabase
    .from('stock_opname_items')
    .select('id, product_id, system_stock, physical_stock, difference, notes, products(name)')
    .eq('opname_id', opnameId)
    .order('difference', { ascending: true });

  if (itemError) throw itemError;

  const header = {
    id: opname.id,
    branch_id: opname.branch_id,
    branch_name: (opname as any).branches?.name ?? 'Unknown',
    status: opname.status,
    created_by_name: (opname as any).users?.name ?? 'Unknown',
    notes: opname.notes ?? null,
    created_at: opname.created_at,
  };

  const mappedItems = (items ?? []).map((i: any) => ({
    id: i.id,
    product_id: i.product_id,
    product_name: i.products?.name ?? 'Produk Dihapus',
    system_stock: i.system_stock,
    physical_stock: i.physical_stock,
    difference: i.difference,
    notes: i.notes ?? null,
  }));

  return { header, items: mappedItems };
}
