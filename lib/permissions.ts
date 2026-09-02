/**
 * Permissions & Role-based Access Control
 */

export type UserRole = 'owner' | 'back_office' | 'cashier' | 'staff_pusat';

export type Feature =
  // POS
  | 'pos.access'
  | 'pos.void_transaction'

  // Products
  | 'products.view'
  | 'products.create'
  | 'products.update'
  | 'products.delete'

  // Categories
  | 'categories.view'
  | 'categories.manage'

  // Stock
  | 'stock.view'
  | 'stock.adjust'
  | 'stock.opname'

  // Purchase Orders
  | 'purchase.view'
  | 'purchase.create'
  | 'purchase.receive'

  // Warehouse (gudang pusat)
  | 'warehouse.view'
  | 'warehouse.manage'

  // Stock Transfer (distribusi gudang ke cabang)
  | 'transfer.view'
  | 'transfer.create'
  | 'transfer.send'

  // Opname approval
  | 'opname.approve'

  // Reports
  | 'reports.sales'
  | 'reports.stock'
  | 'reports.consolidated'
  | 'reports.transfers'

  // Users
  | 'users.view'
  | 'users.create'
  | 'users.update'
  | 'users.delete'

  // Branches
  | 'branches.view'
  | 'branches.create'
  | 'branches.update'
  | 'branches.delete'
  | 'branches.switch'

  // Settings
  | 'settings.global'
  | 'settings.branch'
  | 'settings.profile';

/**
 * Permission matrix per role
 */
const PERMISSIONS: Record<UserRole, Record<Feature, boolean>> = {
  owner: {
    'pos.access': true,
    'pos.void_transaction': true,
    'products.view': true,
    'products.create': true,
    'products.update': true,
    'products.delete': true,
    'categories.view': true,
    'categories.manage': true,
    'stock.view': true,
    'stock.adjust': true,
    'stock.opname': true,
    'purchase.view': true,
    'purchase.create': true,
    'purchase.receive': true,
    'warehouse.view': true,
    'warehouse.manage': true,
    'transfer.view': true,
    'transfer.create': true,
    'transfer.send': true,
    'opname.approve': true,
    'reports.sales': true,
    'reports.stock': true,
    'reports.consolidated': true,
    'reports.transfers': true,
    'users.view': true,
    'users.create': true,
    'users.update': true,
    'users.delete': true,
    'branches.view': true,
    'branches.create': true,
    'branches.update': true,
    'branches.delete': true,
    'branches.switch': true,
    'settings.global': true,
    'settings.branch': true,
    'settings.profile': true,
  },

  staff_pusat: {
    'pos.access': false,
    'pos.void_transaction': false,
    'products.view': true,
    'products.create': true,
    'products.update': true,
    'products.delete': false,
    'categories.view': true,
    'categories.manage': true,
    'stock.view': true,
    'stock.adjust': true,
    'stock.opname': true,
    'purchase.view': true,
    'purchase.create': true,
    'purchase.receive': true,
    'warehouse.view': true,
    'warehouse.manage': true,
    'transfer.view': true,
    'transfer.create': true,
    'transfer.send': true,
    'opname.approve': true,
    'reports.sales': true,
    'reports.stock': true,
    'reports.consolidated': true,
    'reports.transfers': true,
    'users.view': true,
    'users.create': true,
    'users.update': true,
    'users.delete': false,
    'branches.view': true,
    'branches.create': true,
    'branches.update': true,
    'branches.delete': false,
    'branches.switch': true,
    'settings.global': false,
    'settings.branch': true,
    'settings.profile': true,
  },

  back_office: {
    'pos.access': false,
    'pos.void_transaction': false,
    'products.view': true,
    'products.create': true,
    'products.update': true,
    'products.delete': true,
    'categories.view': true,
    'categories.manage': true,
    'stock.view': true,
    'stock.adjust': true,
    'stock.opname': true,
    'purchase.view': false,
    'purchase.create': false,
    'purchase.receive': false,
    'warehouse.view': false,
    'warehouse.manage': false,
    'transfer.view': true,
    'transfer.create': false,
    'transfer.send': false,
    'opname.approve': false,
    'reports.sales': true,
    'reports.stock': true,
    'reports.consolidated': false,
    'reports.transfers': false,
    'users.view': true,
    'users.create': false,
    'users.update': false,
    'users.delete': false,
    'branches.view': false,
    'branches.create': false,
    'branches.update': false,
    'branches.delete': false,
    'branches.switch': false,
    'settings.global': false,
    'settings.branch': true,
    'settings.profile': true,
  },

  cashier: {
    'pos.access': true,
    'pos.void_transaction': false,
    'products.view': true,
    'products.create': false,
    'products.update': false,
    'products.delete': false,
    'categories.view': true,
    'categories.manage': false,
    'stock.view': false,
    'stock.adjust': false,
    'stock.opname': false,
    'purchase.view': false,
    'purchase.create': false,
    'purchase.receive': false,
    'warehouse.view': false,
    'warehouse.manage': false,
    'transfer.view': false,
    'transfer.create': false,
    'transfer.send': false,
    'opname.approve': false,
    'reports.sales': false,
    'reports.stock': false,
    'reports.consolidated': false,
    'reports.transfers': false,
    'users.view': false,
    'users.create': false,
    'users.update': false,
    'users.delete': false,
    'branches.view': false,
    'branches.create': false,
    'branches.update': false,
    'branches.delete': false,
    'branches.switch': false,
    'settings.global': false,
    'settings.branch': false,
    'settings.profile': true,
  },
};

export const canAccess = (role: UserRole | undefined, feature: Feature): boolean => {
  if (!role) return false;
  return PERMISSIONS[role]?.[feature] ?? false;
};

export const hasRole = (
  userRole: UserRole | undefined,
  allowedRoles: UserRole[]
): boolean => {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
};

export const isOwner = (role: UserRole | undefined): boolean => role === 'owner';

export const isBackOffice = (role: UserRole | undefined): boolean => role === 'back_office';

export const isCashier = (role: UserRole | undefined): boolean => role === 'cashier';

export const isStaffPusat = (role: UserRole | undefined): boolean => role === 'staff_pusat';

export const getAccessibleFeatures = (role: UserRole): Feature[] => {
  return (Object.keys(PERMISSIONS[role]) as Feature[]).filter(
    (feature) => PERMISSIONS[role][feature]
  );
};

export const getRoleDisplayName = (role: UserRole): string => {
  const names: Record<UserRole, string> = {
    owner: 'Pemilik',
    back_office: 'Staff Cabang',
    cashier: 'Kasir',
    staff_pusat: 'Staff Pusat',
  };
  return names[role];
};

export const getRoleDescription = (role: UserRole): string => {
  const descriptions: Record<UserRole, string> = {
    owner: 'Akses penuh ke semua fitur dan semua cabang',
    back_office: 'Kelola produk, stok, dan laporan untuk cabang tertentu',
    cashier: 'Akses kasir untuk transaksi penjualan',
    staff_pusat: 'Kelola gudang, distribusi stok, dan review opname semua cabang',
  };
  return descriptions[role];
};

export const isValidRole = (role: string): role is UserRole => {
  return ['owner', 'back_office', 'cashier', 'staff_pusat'].includes(role);
};

export const canAccessMultipleBranches = (role: UserRole | undefined): boolean => {
  return role === 'owner' || role === 'staff_pusat';
};
