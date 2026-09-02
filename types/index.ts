// ========================
// CORE TYPES
// ========================

export type Role = 'owner' | 'back_office' | 'cashier' | 'staff_pusat';

export type PaymentMethod = 'cash' | 'debit' | 'credit' | 'qris' | 'transfer';

export type TransactionStatus = 'completed' | 'cancelled' | 'pending';

export type StockMovementType =
  | 'in_purchase'      // Pembelian/purchase order
  | 'out_sale'         // Penjualan
  | 'in_return'        // Retur penjualan
  | 'out_return'       // Retur pembelian
  | 'in_adjustment'    // Penyesuaian tambah (opname)
  | 'out_adjustment'   // Penyesuaian kurang (opname)
  | 'in_transfer'      // Transfer masuk dari cabang lain
  | 'out_transfer'     // Transfer keluar ke cabang lain
  | 'sale'             // DB: penjualan
  | 'purchase'         // DB: pembelian ke gudang
  | 'adjustment_in'    // DB: penyesuaian tambah
  | 'adjustment_out'   // DB: penyesuaian kurang
  | 'opname'           // DB: koreksi opname
  | 'void'             // DB: void transaksi
  | 'transfer_out'     // DB: distribusi keluar dari gudang
  | 'transfer_in';     // DB: distribusi masuk ke cabang

export type StockOpnameStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export type StockTransferStatus = 'draft' | 'sent';

export type PurchaseOrderStatus = 'draft' | 'completed' | 'cancelled';

// ========================
// ENTITIES
// ========================

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  branch_id: string | null; // null untuk owner
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  branch?: Branch;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}


export interface BranchProduct {
  id: string;
  branch_id: string;
  product_id: string;
  price_override: number | null; // null = pakai harga global
  stock: number;
  min_stock: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  category_id: string | null;
  price: number;
  cost_price: number;
  stock: number;
  min_stock: number;
  unit: string;
  barcode: string | null;
  image_url: string | null;
  is_active: boolean;
  is_available?: boolean;
  price_override?: number | null;
  created_at: string;
  updated_at: string;
  // Relations
  category?: Category;
}

export interface Transaction {
  id: string;
  branch_id: string;
  cashier_id: string;
  invoice_number: string;
  total: number;
  discount: number;
  tax: number;
  payment_method: PaymentMethod;
  payment_amount: number;
  change_amount: number;
  status: TransactionStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  branch?: Branch;
  cashier?: User;
  items?: TransactionItem[];
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  product_id: string;
  product_name: string; // Denormalisasi untuk history
  quantity: number;
  price: number;
  subtotal: number;
  created_at: string;
  // Relations
  transaction?: Transaction;
  product?: Product;
}

export interface StockMovement {
  id: string;
  product_id: string;
  branch_id: string;
  type: StockMovementType;
  qty_before: number;
  qty_after: number;
  quantity: number; // Selisih (positif atau negatif)
  reason: string | null;
  reference_id: string | null; // ID transaksi/PO yang terkait
  created_by: string;
  created_at: string;
  // Relations
  product?: Product;
  branch?: Branch;
  user?: User;
}

// ========================
// WAREHOUSE (GUDANG PUSAT)
// ========================

export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WarehouseStock {
  id: string;
  warehouse_id: string;
  product_id: string;
  stock: number;
  min_stock: number;
  created_at: string;
  updated_at: string;
  // Relations
  warehouse?: Warehouse;
  product?: Product;
}

export interface StockTransfer {
  id: string;
  warehouse_id: string;
  branch_id: string;
  status: StockTransferStatus;
  notes: string | null;
  created_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  warehouse?: Warehouse;
  branch?: Branch;
  creator?: User;
  items?: StockTransferItem[];
}

export interface StockTransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  quantity: number;
  cost_price: number | null;
  created_at: string;
  // Relations
  product?: Product;
}

export interface StockOpname {
  id: string;
  branch_id: string;
  status: StockOpnameStatus;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  branch?: Branch;
  creator?: User;
  reviewer?: User;
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
  // Relations
  product?: Product;
}

export interface PurchaseOrder {
  id: string;
  warehouse_id: string | null;
  branch_id: string | null;
  supplier_name: string;
  total_items: number;
  total_amount: number;
  status: PurchaseOrderStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Relations
  warehouse?: Warehouse;
  branch?: Branch;
  user?: User;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  cost_price: number;
  subtotal: number;
  created_at: string;
  // Relations
  purchase_order?: PurchaseOrder;
  product?: Product;
}

// ========================
// SYNC & META
// ========================

export interface SyncStatus {
  lastSyncAt: string | null;
  pendingChanges: number;
  isSyncing: boolean;
  syncErrors: SyncError[];
}

export interface SyncError {
  id: string;
  tableName: string;
  recordId: string;
  operation: 'insert' | 'update' | 'delete';
  error: string;
  timestamp: string;
}

export interface SyncQueue {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'insert' | 'update' | 'delete';
  data: string; // JSON stringified
  created_at: string;
  synced: boolean;
}

// ========================
// UI & STATE MANAGEMENT
// ========================

export interface AuthState {
  user: User | null;
  branch: Branch | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectBranch: (branchId: string) => Promise<void>;
}

export interface CartItem {
  product: Product;
  quantity: number;
  subtotal: number;
}

export interface CartState {
  items: CartItem[];
  total: number;
  discount: number;
  tax: number;
  grandTotal: number;
  addItem: (product: Product, quantity: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  setDiscount: (discount: number) => void;
  setTax: (tax: number) => void;
  clear: () => void;
}

// ========================
// REPORTS & ANALYTICS
// ========================

export interface SalesReport {
  branch_id: string;
  branch_name: string;
  date: string;
  total_transactions: number;
  total_revenue: number;
  total_profit: number;
  total_items_sold: number;
  payment_methods: {
    method: PaymentMethod;
    count: number;
    amount: number;
  }[];
  top_products: {
    product_id: string;
    product_name: string;
    quantity_sold: number;
    revenue: number;
  }[];
}

export interface StockReport {
  branch_id: string;
  branch_name: string;
  products: {
    product_id: string;
    product_name: string;
    category_name: string;
    current_stock: number;
    min_stock: number;
    stock_value: number; // stock * cost_price
    is_low_stock: boolean;
  }[];
  total_stock_value: number;
  low_stock_count: number;
}

export interface ConsolidatedReport {
  date_from: string;
  date_to: string;
  branches: {
    branch_id: string;
    branch_name: string;
    total_revenue: number;
    total_profit: number;
    total_transactions: number;
  }[];
  total_revenue: number;
  total_profit: number;
  total_transactions: number;
}
