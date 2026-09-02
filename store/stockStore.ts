/**
 * Stock Store — Full Online
 * Semua operasi stok (baca + tulis) langsung ke Supabase.
 */

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './authStore';

// ========================
// TYPES
// ========================

export interface StockMovement {
  id: string;
  product_id: string;
  branch_id: string;
  type: 'sale' | 'purchase' | 'adjustment_in' | 'adjustment_out' | 'opname' | 'void';
  quantity: number;
  qty_before: number;
  qty_after: number;
  reason: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
  product_name?: string;
  user_name?: string;
}

export interface StockOpname {
  id: string;
  branch_id: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  notes: string | null;
  review_notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  approver_name?: string;
  reviewer_name?: string;
  item_count?: number;
  checked_count?: number;
  discrepancy_count?: number;
  items?: StockOpnameItem[];
}

export interface StockOpnameItem {
  id: string;
  opname_id: string;
  product_id: string;
  system_stock: number;
  physical_stock: number;
  difference: number;
  notes: string | null;
  created_at: string;
  product_name?: string;
  product_unit?: string;
}

export interface PurchaseOrder {
  id: string;
  branch_id: string;
  supplier_name: string;
  supplier_phone: string | null;
  notes: string | null;
  total_items: number;
  total_amount: number;
  status: 'draft' | 'received';
  received_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  cost_price: number;
  subtotal: number;
  created_at: string;
}

export interface CreateAdjustmentParams {
  productId: string;
  type: 'addition' | 'reduction';
  subType: string;
  quantity: number;
  reason: string;
}

export interface CreatePOParams {
  supplierName: string;
  supplierPhone?: string;
  notes?: string;
  items: {
    productId: string | null;
    productName: string;
    quantity: number;
    costPrice: number;
  }[];
  receiveImmediately?: boolean;
}

// ========================
// STORE INTERFACE
// ========================

interface StockState {
  movements: StockMovement[];
  opnames: StockOpname[];
  opnamesHasMore: boolean;
  purchaseOrders: PurchaseOrder[];
  isLoading: boolean;
  error: string | null;

  loadMovements: (productId?: string) => Promise<void>;
  createAdjustment: (params: CreateAdjustmentParams) => Promise<void>;

  loadOpnames: () => Promise<void>;
  loadMoreOpnames: () => Promise<void>;
  loadOpnameDetail: (opnameId: string) => Promise<StockOpname | null>;
  createOpname: () => Promise<string>;
  updateOpnameItem: (opnameId: string, productId: string, physicalStock: number, notes?: string) => Promise<void>;
  submitOpname: (opnameId: string) => Promise<void>;
  approveOpname: (opnameId: string) => Promise<void>;
  deleteOpname: (opnameId: string) => Promise<void>;

  loadPurchaseOrders: () => Promise<void>;
  loadPODetail: (poId: string) => Promise<PurchaseOrder | null>;
  createPO: (params: CreatePOParams) => Promise<string>;
  receivePO: (poId: string) => Promise<void>;
  deletePO: (poId: string) => Promise<void>;

  clearError: () => void;
}

// ========================
// HELPERS
// ========================

const generateId = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const OPNAME_PAGE_SIZE = 20;

async function attachOpnameCounts(opnames: StockOpname[]): Promise<StockOpname[]> {
  if (!opnames.length) return opnames;
  const ids = opnames.map((o) => o.id);
  const branchIds = [...new Set(opnames.map((o) => o.branch_id))];

  const [checkedRes, discRes, ...productRes] = await Promise.all([
    // Rows per opname yang sudah di-scan
    supabase.from('stock_opname_items').select('opname_id').in('opname_id', ids),
    // Rows per opname yang ada selisih
    supabase.from('stock_opname_items').select('opname_id').in('opname_id', ids).neq('difference', 0),
    // Total produk per branch
    ...branchIds.map((bid) =>
      supabase.from('branch_products').select('branch_id', { count: 'exact', head: true }).eq('branch_id', bid)
        .then((r) => ({ branch_id: bid, count: r.count ?? 0 }))
    ),
  ]);

  const countByOpname = (rows: any[] | null) => {
    const map: Record<string, number> = {};
    for (const r of rows ?? []) map[r.opname_id] = (map[r.opname_id] ?? 0) + 1;
    return map;
  };

  const checkedMap = countByOpname(checkedRes.data);
  const discMap = countByOpname(discRes.data);
  const productCountByBranch: Record<string, number> = {};
  for (const r of productRes as { branch_id: string; count: number }[]) {
    productCountByBranch[r.branch_id] = r.count;
  }

  return opnames.map((o) => ({
    ...o,
    item_count: productCountByBranch[o.branch_id] ?? 0,
    checked_count: checkedMap[o.id] ?? 0,
    discrepancy_count: discMap[o.id] ?? 0,
  }));
}

// ========================
// STORE
// ========================

export const useStockStore = create<StockState>((set, get) => ({
  movements: [],
  opnames: [],
  opnamesHasMore: false,
  purchaseOrders: [],
  isLoading: false,
  error: null,

  // ─── Movements ────────────────────────────────────────────────────────────

  loadMovements: async (productId?: string) => {
    try {
      set({ isLoading: true, error: null });

      const authState = useAuthStore.getState();
      const branchId = authState.currentBranch?.id;

      let query = supabase
        .from('stock_movements')
        .select('*, products(name), users(name)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (productId) {
        query = query.eq('product_id', productId);
      } else if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const movements: StockMovement[] = (data ?? []).map((row: any) => ({
        ...row,
        product_name: row.products?.name ?? null,
        user_name: row.users?.name ?? null,
      }));

      set({ movements, isLoading: false });
    } catch (error: any) {
      console.error('[StockStore] loadMovements failed:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  createAdjustment: async (params: CreateAdjustmentParams) => {
    try {
      set({ isLoading: true, error: null });

      const authState = useAuthStore.getState();
      const branchId = authState.currentBranch?.id;
      const userId = authState.user?.id;
      if (!branchId || !userId) throw new Error('Tidak ada cabang atau user aktif');

      // Baca stok terkini dari branch_products (stok per cabang)
      const { data: bp, error: bpError } = await supabase
        .from('branch_products')
        .select('stock')
        .eq('product_id', params.productId)
        .eq('branch_id', branchId)
        .maybeSingle();
      if (bpError) throw bpError;

      const qtyBefore = bp?.stock ?? 0;
      const movementType = params.type === 'addition' ? 'adjustment_in' : 'adjustment_out';
      const qtyAfter = params.type === 'addition'
        ? qtyBefore + params.quantity
        : Math.max(0, qtyBefore - params.quantity);

      const now = new Date().toISOString();

      // Insert movement
      const { error: mvError } = await supabase.from('stock_movements').insert({
        id: generateId(),
        product_id: params.productId,
        branch_id: branchId,
        type: movementType,
        quantity: params.quantity,
        qty_before: qtyBefore,
        qty_after: qtyAfter,
        reason: `[${params.subType}] ${params.reason}`,
        created_by: userId,
        created_at: now,
      });
      if (mvError) throw mvError;

      // Update stok di branch_products (upsert jika belum ada baris)
      const { error: updateError } = await supabase
        .from('branch_products')
        .upsert(
          { branch_id: branchId, product_id: params.productId, stock: qtyAfter, updated_at: now },
          { onConflict: 'branch_id,product_id' }
        );
      if (updateError) throw updateError;

      await get().loadMovements();
      set({ isLoading: false });
    } catch (error: any) {
      console.error('[StockStore] createAdjustment failed:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // ─── Opname ───────────────────────────────────────────────────────────────

  loadOpnames: async () => {
    try {
      set({ isLoading: true, error: null });

      const branchId = useAuthStore.getState().currentBranch?.id;
      if (!branchId) { set({ isLoading: false }); return; }

      const { data, error } = await supabase
        .from('stock_opname')
        .select('*, creator:users!created_by(name), approver:users!approved_by(name)')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(OPNAME_PAGE_SIZE);
      if (error) throw error;

      const raw: StockOpname[] = (data ?? []).map((row: any) => ({
        ...row,
        creator_name: row.creator?.name ?? null,
        approver_name: row.approver?.name ?? null,
      }));
      const opnames = await attachOpnameCounts(raw);

      set({ opnames, opnamesHasMore: opnames.length === OPNAME_PAGE_SIZE, isLoading: false });
    } catch (error: any) {
      console.error('[StockStore] loadOpnames failed:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  loadMoreOpnames: async () => {
    try {
      const { opnames } = get();
      if (opnames.length === 0) return;

      const branchId = useAuthStore.getState().currentBranch?.id;
      if (!branchId) return;

      const oldest = opnames[opnames.length - 1].created_at;

      const { data, error } = await supabase
        .from('stock_opname')
        .select('*, creator:users!created_by(name), approver:users!approved_by(name)')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .lt('created_at', oldest)
        .limit(OPNAME_PAGE_SIZE);
      if (error) throw error;

      const raw: StockOpname[] = (data ?? []).map((row: any) => ({
        ...row,
        creator_name: row.creator?.name ?? null,
        approver_name: row.approver?.name ?? null,
      }));
      const more = await attachOpnameCounts(raw);

      set({
        opnames: [...opnames, ...more],
        opnamesHasMore: more.length === OPNAME_PAGE_SIZE,
      });
    } catch (error: any) {
      console.error('[StockStore] loadMoreOpnames failed:', error);
    }
  },

  loadOpnameDetail: async (opnameId: string) => {
    try {
      const { data: opname, error: opError } = await supabase
        .from('stock_opname')
        .select('*, creator:users!created_by(name), approver:users!approved_by(name), reviewer:users!reviewed_by(name)')
        .eq('id', opnameId)
        .single();
      if (opError) throw opError;

      // Hanya ambil 20 item pertama — detail screen handle load more sendiri
      const { data: items, error: itemError } = await supabase
        .from('stock_opname_items')
        .select('*, products(name, unit)')
        .eq('opname_id', opnameId)
        .order('created_at', { ascending: true })
        .limit(20);
      if (itemError) throw itemError;

      return {
        ...opname,
        creator_name: (opname as any).creator?.name ?? null,
        approver_name: (opname as any).approver?.name ?? null,
        reviewer_name: (opname as any).reviewer?.name ?? null,
        items: (items ?? []).map((i: any) => ({
          ...i,
          product_name: i.products?.name ?? null,
          product_unit: i.products?.unit ?? null,
        })),
      } as StockOpname;
    } catch (error: any) {
      console.error('[StockStore] loadOpnameDetail failed:', error);
      return null;
    }
  },

  createOpname: async () => {
    try {
      set({ isLoading: true, error: null });

      const authState = useAuthStore.getState();
      const branchId = authState.currentBranch?.id;
      const userId = authState.user?.id;
      if (!branchId || !userId) throw new Error('Tidak ada cabang atau user aktif');

      const { data: row, error } = await supabase
        .from('stock_opname')
        .insert({ branch_id: branchId, status: 'draft', created_by: userId })
        .select('id')
        .single();
      if (error) throw error;

      await get().loadOpnames();
      set({ isLoading: false });
      return row.id as string;
    } catch (error: any) {
      console.error('[StockStore] createOpname failed:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  updateOpnameItem: async (opnameId: string, productId: string, physicalStock: number, notes?: string) => {
    try {
      // Cek apakah item sudah ada
      const { data: existing } = await supabase
        .from('stock_opname_items')
        .select('id, system_stock')
        .eq('opname_id', opnameId)
        .eq('product_id', productId)
        .maybeSingle();

      if (existing) {
        // Update item yang sudah ada
        const difference = physicalStock - existing.system_stock;
        const { error } = await supabase
          .from('stock_opname_items')
          .update({ physical_stock: physicalStock, difference, notes: notes ?? null })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // Item belum ada — ambil system_stock dari branch_products lalu insert
        const branchId = useAuthStore.getState().currentBranch?.id;
        const { data: bp, error: prodError } = await supabase
          .from('branch_products')
          .select('stock')
          .eq('product_id', productId)
          .eq('branch_id', branchId ?? '')
          .maybeSingle();
        if (prodError) throw prodError;

        const systemStock = bp?.stock ?? 0;
        const difference = physicalStock - systemStock;
        const { error } = await supabase
          .from('stock_opname_items')
          .insert({
            opname_id: opnameId,
            product_id: productId,
            system_stock: systemStock,
            physical_stock: physicalStock,
            difference,
            notes: notes ?? null,
          });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error('[StockStore] updateOpnameItem failed:', error);
      throw error;
    }
  },

  submitOpname: async (opnameId: string) => {
    try {
      set({ isLoading: true, error: null });

      const { error } = await supabase
        .from('stock_opname')
        .update({ status: 'submitted', updated_at: new Date().toISOString() })
        .eq('id', opnameId);
      if (error) throw error;

      await get().loadOpnames();
      set({ isLoading: false });
    } catch (error: any) {
      console.error('[StockStore] submitOpname failed:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  approveOpname: async (opnameId: string) => {
    try {
      set({ isLoading: true, error: null });

      const authState = useAuthStore.getState();
      const branchId = authState.currentBranch?.id;
      const userId = authState.user?.id;
      if (!branchId || !userId) throw new Error('Tidak ada cabang atau user aktif');

      // Ambil semua item opname
      const { data: items, error: itemError } = await supabase
        .from('stock_opname_items')
        .select('*')
        .eq('opname_id', opnameId);
      if (itemError) throw itemError;

      const now = new Date().toISOString();

      for (const item of (items ?? [])) {
        if (item.difference === 0) continue;

        // Baca stok terkini dari branch_products
        const { data: bp } = await supabase
          .from('branch_products')
          .select('stock')
          .eq('product_id', item.product_id)
          .eq('branch_id', branchId)
          .maybeSingle();

        const qtyBefore = bp?.stock ?? item.system_stock;
        const qtyAfter = item.physical_stock;

        // Catat movement
        await supabase.from('stock_movements').insert({
          id: generateId(),
          product_id: item.product_id,
          branch_id: branchId,
          type: item.difference > 0 ? 'adjustment_in' : 'adjustment_out',
          quantity: Math.abs(item.difference),
          qty_before: qtyBefore,
          qty_after: qtyAfter,
          reason: 'Stok Opname',
          reference_id: opnameId,
          created_by: userId,
          created_at: now,
        });

        // Update stok di branch_products
        await supabase
          .from('branch_products')
          .upsert(
            { branch_id: branchId, product_id: item.product_id, stock: qtyAfter, updated_at: now },
            { onConflict: 'branch_id,product_id' }
          );
      }

      // Tandai opname approved
      const { error: approveError } = await supabase
        .from('stock_opname')
        .update({ status: 'approved', approved_by: userId, approved_at: now, updated_at: now })
        .eq('id', opnameId);
      if (approveError) throw approveError;

      await get().loadOpnames();
      set({ isLoading: false });
    } catch (error: any) {
      console.error('[StockStore] approveOpname failed:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  deleteOpname: async (opnameId: string) => {
    try {
      set({ isLoading: true, error: null });

      // Cek status
      const { data: opname, error: checkError } = await supabase
        .from('stock_opname')
        .select('status')
        .eq('id', opnameId)
        .single();
      if (checkError) throw checkError;
      if (opname.status === 'approved') throw new Error('Opname yang sudah disetujui tidak dapat dihapus');

      // Hapus items dulu, baru header
      const { error: itemError } = await supabase
        .from('stock_opname_items')
        .delete()
        .eq('opname_id', opnameId);
      if (itemError) throw itemError;

      const { error: opError } = await supabase
        .from('stock_opname')
        .delete()
        .eq('id', opnameId);
      if (opError) throw opError;

      await get().loadOpnames();
      set({ isLoading: false });
    } catch (error: any) {
      console.error('[StockStore] deleteOpname failed:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // ─── Purchase Orders ───────────────────────────────────────────────────────

  loadPurchaseOrders: async () => {
    try {
      set({ isLoading: true, error: null });

      const branchId = useAuthStore.getState().currentBranch?.id;
      if (!branchId) { set({ isLoading: false }); return; }

      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*, creator:users!created_by(name)')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const purchaseOrders: PurchaseOrder[] = (data ?? []).map((row: any) => ({
        ...row,
        creator_name: row.creator?.name ?? null,
      }));

      set({ purchaseOrders, isLoading: false });
    } catch (error: any) {
      console.error('[StockStore] loadPurchaseOrders failed:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  loadPODetail: async (poId: string) => {
    try {
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('*, creator:users!created_by(name)')
        .eq('id', poId)
        .single();
      if (poError) throw poError;

      const { data: items, error: itemError } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', poId)
        .order('created_at', { ascending: true });
      if (itemError) throw itemError;

      return {
        ...po,
        creator_name: (po as any).creator?.name ?? null,
        items: items ?? [],
      } as PurchaseOrder;
    } catch (error: any) {
      console.error('[StockStore] loadPODetail failed:', error);
      return null;
    }
  },

  createPO: async (params: CreatePOParams) => {
    try {
      set({ isLoading: true, error: null });

      const authState = useAuthStore.getState();
      const branchId = authState.currentBranch?.id;
      const userId = authState.user?.id;
      if (!branchId || !userId) throw new Error('Tidak ada cabang atau user aktif');

      const now = new Date().toISOString();
      const poId = generateId();
      const totalAmount = params.items.reduce((s, i) => s + i.quantity * i.costPrice, 0);
      const totalItems = params.items.reduce((s, i) => s + i.quantity, 0);

      // Buat header PO
      const { error: poError } = await supabase.from('purchase_orders').insert({
        id: poId,
        branch_id: branchId,
        supplier_name: params.supplierName,
        supplier_phone: params.supplierPhone ?? null,
        notes: params.notes ?? null,
        total_items: totalItems,
        total_amount: totalAmount,
        status: 'draft',
        created_by: userId,
        created_at: now,
        updated_at: now,
      });
      if (poError) throw poError;

      // Insert items PO
      const poItems = params.items.map((item) => ({
        id: generateId(),
        po_id: poId,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        cost_price: item.costPrice,
        subtotal: item.quantity * item.costPrice,
        created_at: now,
      }));

      const { error: itemError } = await supabase.from('purchase_order_items').insert(poItems);
      if (itemError) throw itemError;

      if (params.receiveImmediately) {
        await get().receivePO(poId);
      } else {
        await get().loadPurchaseOrders();
      }

      set({ isLoading: false });
      return poId;
    } catch (error: any) {
      console.error('[StockStore] createPO failed:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  receivePO: async (poId: string) => {
    try {
      set({ isLoading: true, error: null });

      const authState = useAuthStore.getState();
      const branchId = authState.currentBranch?.id;
      const userId = authState.user?.id;
      if (!branchId || !userId) throw new Error('Tidak ada cabang atau user aktif');

      // Ambil items PO
      const { data: items, error: itemError } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', poId);
      if (itemError) throw itemError;

      const now = new Date().toISOString();

      for (const item of (items ?? [])) {
        if (!item.product_id) continue;

        // Baca stok terkini dari branch_products (stok per cabang)
        const { data: bp } = await supabase
          .from('branch_products')
          .select('stock')
          .eq('product_id', item.product_id)
          .eq('branch_id', branchId)
          .maybeSingle();

        const qtyBefore = bp?.stock ?? 0;
        const qtyAfter = qtyBefore + item.quantity;

        // Catat movement
        await supabase.from('stock_movements').insert({
          id: generateId(),
          product_id: item.product_id,
          branch_id: branchId,
          type: 'purchase',
          quantity: item.quantity,
          qty_before: qtyBefore,
          qty_after: qtyAfter,
          reason: 'Pembelian dari PO',
          reference_id: poId,
          created_by: userId,
          created_at: now,
        });

        // Update stok di branch_products (upsert jika produk global belum punya baris untuk cabang ini)
        await supabase
          .from('branch_products')
          .upsert(
            { branch_id: branchId, product_id: item.product_id, stock: qtyAfter, updated_at: now },
            { onConflict: 'branch_id,product_id' }
          );
      }

      // Tandai PO received
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({ status: 'received', received_at: now, updated_at: now })
        .eq('id', poId);
      if (updateError) throw updateError;

      await get().loadPurchaseOrders();
      set({ isLoading: false });
    } catch (error: any) {
      console.error('[StockStore] receivePO failed:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  deletePO: async (poId: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data: po, error: checkError } = await supabase
        .from('purchase_orders')
        .select('status')
        .eq('id', poId)
        .single();
      if (checkError) throw checkError;
      if (po.status === 'received') throw new Error('Tidak dapat menghapus pembelian yang sudah diterima');

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

      await get().loadPurchaseOrders();
      set({ isLoading: false });
    } catch (error: any) {
      console.error('[StockStore] deletePO failed:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
