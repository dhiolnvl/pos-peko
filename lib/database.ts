/**
 * SQLite Local Database
 * Offline-first storage with sync capabilities
 */

import * as SQLite from 'expo-sqlite';
import { DB_NAME } from '@/constants/config';

// Database instance
let dbInstance: SQLite.SQLiteDatabase | null = null;

export const invalidateDatabaseInstance = () => {
  dbInstance = null;
};

/**
 * Get database instance — reopens if the native handle was invalidated (e.g. after Android cold start)
 */
export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (dbInstance) {
    try {
      // Cheap probe: if the native DB is gone this throws NullPointerException
      await dbInstance.getFirstAsync('SELECT 1');
    } catch {
      // Native handle is dead — discard and reopen
      dbInstance = null;
    }
  }
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbInstance;
};

/**
 * Initialize database with tables
 */
export const initDatabase = async (): Promise<void> => {
  const database = await getDatabase();

  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- ================================================
    -- 1. BRANCHES TABLE
    -- ================================================
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    -- ================================================
    -- 2. USERS TABLE
    -- ================================================
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'back_office', 'cashier')),
      branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    -- ================================================
    -- 3. CATEGORIES TABLE
    -- ================================================
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    -- ================================================
    -- 4. PRODUCTS TABLE
    -- ================================================
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
      price REAL NOT NULL,
      cost_price REAL,
      stock INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 5,
      unit TEXT,
      barcode TEXT,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now')),

      UNIQUE(barcode, branch_id)
    );

    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branch_id);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_is_synced ON products(is_synced);

    -- ================================================
    -- SUPPLIERS TABLE
    -- ================================================
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_suppliers_branch ON suppliers(branch_id);
    CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

    -- ================================================
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
      cashier_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      invoice_number TEXT UNIQUE NOT NULL,
      subtotal REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      discount_type TEXT DEFAULT 'nominal',
      tax_amount REAL DEFAULT 0,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'qris')),
      payment_amount REAL NOT NULL,
      change_amount REAL DEFAULT 0,
      notes TEXT,
      status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'void', 'refunded')),
      voided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      voided_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_branch ON transactions(branch_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_cashier ON transactions(cashier_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(invoice_number);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_is_synced ON transactions(is_synced);

    -- ================================================
    -- 6. TRANSACTION_ITEMS TABLE
    -- ================================================
    CREATE TABLE IF NOT EXISTS transaction_items (
      id TEXT PRIMARY KEY,
      transaction_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      product_barcode TEXT,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      discount_type TEXT DEFAULT 'nominal',
      subtotal REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction ON transaction_items(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_items_product ON transaction_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_items_is_synced ON transaction_items(is_synced);

    -- ================================================
    -- 7. STOCK_MOVEMENTS TABLE
    -- ================================================
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
      branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'adjustment_in', 'adjustment_out', 'opname', 'void')),
      quantity INTEGER NOT NULL,
      qty_before INTEGER NOT NULL,
      qty_after INTEGER NOT NULL,
      reason TEXT,
      reference_id TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON stock_movements(branch_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(type);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_is_synced ON stock_movements(is_synced);

    -- ================================================
    -- 8. STOCK_OPNAME TABLE
    -- ================================================
    CREATE TABLE IF NOT EXISTS stock_opname (
      id TEXT PRIMARY KEY,
      branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
      notes TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      approved_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_stock_opname_branch ON stock_opname(branch_id);
    CREATE INDEX IF NOT EXISTS idx_stock_opname_status ON stock_opname(status);
    CREATE INDEX IF NOT EXISTS idx_stock_opname_is_synced ON stock_opname(is_synced);

    -- ================================================
    -- 9. STOCK_OPNAME_ITEMS TABLE
    -- ================================================
    CREATE TABLE IF NOT EXISTS stock_opname_items (
      id TEXT PRIMARY KEY,
      opname_id TEXT REFERENCES stock_opname(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
      system_stock INTEGER NOT NULL,
      physical_stock INTEGER NOT NULL,
      difference INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_stock_opname_items_opname ON stock_opname_items(opname_id);
    CREATE INDEX IF NOT EXISTS idx_stock_opname_items_product ON stock_opname_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_opname_items_is_synced ON stock_opname_items(is_synced);

    -- ================================================
    -- 10. PURCHASE_ORDERS TABLE
    -- ================================================
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
      supplier_name TEXT NOT NULL,
      supplier_phone TEXT,
      notes TEXT,
      total_items INTEGER DEFAULT 0,
      total_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'received')),
      received_at TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch ON purchase_orders(branch_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_is_synced ON purchase_orders(is_synced);

    -- ================================================
    -- 11. PURCHASE_ORDER_ITEMS TABLE
    -- ================================================
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      po_id TEXT REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      cost_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items(po_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product ON purchase_order_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_order_items_is_synced ON purchase_order_items(is_synced);


    -- ================================================
    -- SYNC_QUEUE TABLE (for tracking pending syncs)
    -- ================================================
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
      data TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      synced_at TEXT,
      error TEXT,
      retry_count INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON sync_queue(table_name);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced_at);

    -- ================================================
    -- 14. REWARD ITEMS TABLE (header reward)
    -- ================================================
    CREATE TABLE IF NOT EXISTS reward_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      points_required INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    -- ================================================
    -- 14b. REWARD ITEM PRODUCTS TABLE (detail produk per reward)
    -- ================================================
    CREATE TABLE IF NOT EXISTS reward_item_products (
      id TEXT PRIMARY KEY,
      reward_item_id TEXT NOT NULL REFERENCES reward_items(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_reward_products_reward ON reward_item_products(reward_item_id);

    -- ================================================
    -- 15. POINT REDEMPTIONS TABLE
    -- ================================================
    CREATE TABLE IF NOT EXISTS point_redemptions (
      id TEXT PRIMARY KEY,
      member_id TEXT,
      reward_item_id TEXT REFERENCES reward_items(id) ON DELETE SET NULL,
      reward_name TEXT NOT NULL,
      points_used INTEGER NOT NULL,
      transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      local_created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_redemptions_member ON point_redemptions(member_id);
  `);

  // Tabel shifts
  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        cashier_id TEXT NOT NULL,
        cashier_name TEXT NOT NULL,
        opening_cash REAL DEFAULT 0,
        closing_cash REAL,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        notes TEXT,
        total_transactions INTEGER,
        total_sales REAL,
        created_at TEXT DEFAULT (datetime('now')),
        is_synced INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_shifts_cashier ON shifts(cashier_id);
      CREATE INDEX IF NOT EXISTS idx_shifts_branch ON shifts(branch_id);
      CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
    `);
  } catch {}

  // Tabel refunds
  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS refunds (
        id TEXT PRIMARY KEY,
        original_transaction_id TEXT NOT NULL,
        refund_invoice TEXT UNIQUE NOT NULL,
        branch_id TEXT NOT NULL,
        cashier_id TEXT NOT NULL,
        total_refund REAL NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        is_synced INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS refund_items (
        id TEXT PRIMARY KEY,
        refund_id TEXT NOT NULL,
        product_id TEXT,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        subtotal REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        is_synced INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_refunds_transaction ON refunds(original_transaction_id);
      CREATE INDEX IF NOT EXISTS idx_refunds_branch ON refunds(branch_id);
      CREATE INDEX IF NOT EXISTS idx_refund_items_refund ON refund_items(refund_id);
    `);
  } catch {}

  // Tabel expenses
  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'transfer', 'qris')),
        date TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        is_synced INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
      CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
      CREATE INDEX IF NOT EXISTS idx_expenses_is_synced ON expenses(is_synced);
    `);
  } catch {}

  // ALTER TABLE harus dijalankan satu per satu — tidak bisa dalam execAsync batch
  // try/catch per kolom karena SQLite error jika kolom sudah ada
  const alters = [
    `ALTER TABLE transactions ADD COLUMN member_id TEXT`,
    `ALTER TABLE transactions ADD COLUMN points_earned INTEGER DEFAULT 0`,
    `ALTER TABLE transactions ADD COLUMN shift_id TEXT REFERENCES shifts(id) ON DELETE SET NULL`,
    `ALTER TABLE transactions ADD COLUMN discount_type TEXT DEFAULT 'nominal'`,
    `ALTER TABLE transaction_items ADD COLUMN discount_amount REAL DEFAULT 0`,
    `ALTER TABLE transaction_items ADD COLUMN discount_type TEXT DEFAULT 'nominal'`,
  ];
  for (const sql of alters) {
    try { await database.execAsync(sql); } catch { /* kolom sudah ada */ }
  }

  console.log('✅ Database initialized successfully');
};

/**
 * Hard Reset Database (Delete all tables and data)
 * Used for development / clearing cache
 */
export const resetDatabase = async (): Promise<void> => {
  const database = await getDatabase();

  const drops = [
    'PRAGMA foreign_keys = OFF',
    'DROP TABLE IF EXISTS sync_queue',
    'DROP TABLE IF EXISTS stock_opname_items',
    'DROP TABLE IF EXISTS stock_opname',
    'DROP TABLE IF EXISTS stock_movements',
    'DROP TABLE IF EXISTS transaction_items',
    'DROP TABLE IF EXISTS transactions',
    'DROP TABLE IF EXISTS purchase_order_items',
    'DROP TABLE IF EXISTS purchase_orders',
    'DROP TABLE IF EXISTS products',
    'DROP TABLE IF EXISTS categories',
    'DROP TABLE IF EXISTS suppliers',
    'DROP TABLE IF EXISTS members',
    'DROP TABLE IF EXISTS member_point_logs',
    'DROP TABLE IF EXISTS shifts',
    'DROP TABLE IF EXISTS users',
    'DROP TABLE IF EXISTS branches',
    'PRAGMA foreign_keys = ON',
  ];

  for (const sql of drops) {
    try {
      await database.execAsync(sql);
    } catch (e) {
      console.warn('[Database] drop warning:', sql, e);
    }
  }

  console.log('[Database] All tables dropped.');

  // Invalidate instance so initDatabase opens a fresh connection
  dbInstance = null;
};

/**
 * Generate UUID (simple version for local use)
 */
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Database Helper Functions
 */

/**
 * Insert a record into a table
 */
export const insert = async <T extends Record<string, any>>(
  table: string,
  data: Omit<T, 'id' | 'created_at' | 'updated_at' | 'is_synced' | 'local_created_at'>
): Promise<string> => {
  const database = await getDatabase();
  const id = generateUUID();
  const now = new Date().toISOString();

  const columns = ['id', ...Object.keys(data), 'is_synced', 'local_created_at'];
  const placeholders = columns.map(() => '?').join(', ');
  const values = [id, ...Object.values(data), 0, now];

  const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

  await database.runAsync(query, values);

  // Add to sync queue
  await addToSyncQueue(table, id, 'insert', { id, ...data });

  return id;
};

/**
 * Update a record in a table
 */
export const update = async <T extends Record<string, any>>(
  table: string,
  id: string,
  data: Partial<T>
): Promise<void> => {
  const database = await getDatabase();
  const now = new Date().toISOString();

  const setClause = Object.keys(data)
    .map((key) => `${key} = ?`)
    .join(', ');
  const values = [...Object.values(data), now, 0, id];

  const query = `UPDATE ${table} SET ${setClause}, updated_at = ?, is_synced = ? WHERE id = ?`;

  await database.runAsync(query, values);

  // Add to sync queue
  await addToSyncQueue(table, id, 'update', data);
};

/**
 * Delete a record from a table
 */
export const deleteRecord = async (table: string, id: string): Promise<void> => {
  const database = await getDatabase();

  const query = `DELETE FROM ${table} WHERE id = ?`;
  await database.runAsync(query, [id]);

  // Add to sync queue
  await addToSyncQueue(table, id, 'delete', null);
};

/**
 * Query records from a table
 */
export const query = async <T = any>(
  table: string,
  where?: { [key: string]: any },
  orderBy?: string,
  limit?: number
): Promise<T[]> => {
  const database = await getDatabase();

  let query = `SELECT * FROM ${table}`;
  const values: any[] = [];

  if (where && Object.keys(where).length > 0) {
    const whereClause = Object.keys(where)
      .map((key) => `${key} = ?`)
      .join(' AND ');
    query += ` WHERE ${whereClause}`;
    values.push(...Object.values(where));
  }

  if (orderBy) {
    query += ` ORDER BY ${orderBy}`;
  }

  if (limit) {
    query += ` LIMIT ?`;
    values.push(limit);
  }

  const result = await database.getAllAsync<T>(query, values);
  return result;
};

/**
 * Query single record from a table
 */
export const queryOne = async <T = any>(
  table: string,
  where: { [key: string]: any }
): Promise<T | null> => {
  const results = await query<T>(table, where, undefined, 1);
  return results.length > 0 ? results[0] : null;
};

/**
 * Execute raw SQL query
 */
export const executeRaw = async <T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> => {
  const database = await getDatabase();
  return await database.getAllAsync<T>(sql, params);
};

/**
 * Execute raw SQL statement (INSERT, UPDATE, DELETE)
 */
export const executeStatement = async (
  sql: string,
  params: any[] = []
): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync(sql, params);
};

/**
 * Get unsynced records from a table
 */
export const getUnsyncedRecords = async <T = any>(table: string): Promise<T[]> => {
  return await query<T>(table, { is_synced: 0 });
};

/**
 * Mark a record as synced
 */
export const markSynced = async (table: string, id: string): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync(`UPDATE ${table} SET is_synced = 1 WHERE id = ?`, [id]);
};

/**
 * Mark multiple records as synced
 */
export const markMultipleSynced = async (
  table: string,
  ids: string[]
): Promise<void> => {
  if (ids.length === 0) return;

  const database = await getDatabase();
  const placeholders = ids.map(() => '?').join(', ');
  await database.runAsync(
    `UPDATE ${table} SET is_synced = 1 WHERE id IN (${placeholders})`,
    ids
  );
};

/**
 * Add operation to sync queue
 */
export const addToSyncQueue = async (
  table: string,
  recordId: string,
  operation: 'insert' | 'update' | 'delete',
  data: any
): Promise<void> => {
  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `INSERT INTO sync_queue (table_name, record_id, operation, data, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [table, recordId, operation, JSON.stringify(data), now]
  );
};

/**
 * Get pending sync queue items
 */
export const getSyncQueue = async (limit: number = 100): Promise<any[]> => {
  const database = await getDatabase();
  return await database.getAllAsync(
    `SELECT * FROM sync_queue
     WHERE synced_at IS NULL
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit]
  );
};

/**
 * Mark sync queue item as synced
 */
export const markQueueItemSynced = async (queueId: number): Promise<void> => {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE sync_queue SET synced_at = ? WHERE id = ?`,
    [now, queueId]
  );
};

/**
 * Mark sync queue item as failed
 */
export const markQueueItemFailed = async (
  queueId: number,
  error: string
): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE sync_queue SET error = ?, retry_count = retry_count + 1 WHERE id = ?`,
    [error, queueId]
  );
};

/**
 * Clear synced queue items (older than X days)
 */
export const clearSyncedQueue = async (daysOld: number = 7): Promise<void> => {
  const database = await getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  await database.runAsync(
    `DELETE FROM sync_queue WHERE synced_at IS NOT NULL AND synced_at < ?`,
    [cutoffDate.toISOString()]
  );
};

/**
 * Count records in a table
 */
export const count = async (
  table: string,
  where?: { [key: string]: any }
): Promise<number> => {
  const database = await getDatabase();

  let query = `SELECT COUNT(*) as count FROM ${table}`;
  const values: any[] = [];

  if (where && Object.keys(where).length > 0) {
    const whereClause = Object.keys(where)
      .map((key) => `${key} = ?`)
      .join(' AND ');
    query += ` WHERE ${whereClause}`;
    values.push(...Object.values(where));
  }

  const result = await database.getFirstAsync<{ count: number }>(query, values);
  return result?.count || 0;
};

/**
 * Transaction wrapper for multiple operations
 */
export const transaction = async (
  callback: (db: SQLite.SQLiteDatabase) => Promise<void>
): Promise<void> => {
  const database = await getDatabase();

  try {
    await database.execAsync('BEGIN TRANSACTION');
    await callback(database);
    await database.execAsync('COMMIT');
  } catch (error) {
    await database.execAsync('ROLLBACK');
    throw error;
  }
};

/**
 * Drop all tables (use with caution!)
 */
export const dropAllTables = async (): Promise<void> => {
  const database = await getDatabase();

  await database.execAsync(`
    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS sync_queue;
    DROP TABLE IF EXISTS purchase_order_items;
    DROP TABLE IF EXISTS purchase_orders;
    DROP TABLE IF EXISTS stock_opname_items;
    DROP TABLE IF EXISTS stock_opname;
    DROP TABLE IF EXISTS stock_movements;
    DROP TABLE IF EXISTS transaction_items;
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS branches;

    PRAGMA foreign_keys = ON;
  `);

  console.log('✅ All tables dropped');
};

export const db = {
  getDatabase,
  initDatabase,
  insert,
  update,
  delete: deleteRecord,
  query,
  queryOne,
  executeRaw,
  executeStatement,
  getUnsyncedRecords,
  markSynced,
  markMultipleSynced,
  addToSyncQueue,
  getSyncQueue,
  markQueueItemSynced,
  markQueueItemFailed,
  clearSyncedQueue,
  count,
  transaction,
  dropAllTables,
};

export default db;
