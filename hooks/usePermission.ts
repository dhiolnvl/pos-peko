import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { canAccess, type Feature } from '@/lib/permissions';

/**
 * usePermission hook
 * Provides permission checking utilities based on current user role
 */
export const usePermission = () => {
  const { user } = useAuth();

  const checkAccess = useMemo(() => {
    return (feature: Feature): boolean => {
      if (!user) return false;
      return canAccess(user.role, feature);
    };
  }, [user]);

  const canAccessKasir = useMemo(() => checkAccess('pos.access'), [checkAccess]);
  const canManageProducts = useMemo(() => checkAccess('products.create'), [checkAccess]);
  const canManageStock = useMemo(() => checkAccess('stock.adjust'), [checkAccess]);
  const canDoStockOpname = useMemo(() => checkAccess('stock.opname'), [checkAccess]);
  const canViewSalesReports = useMemo(() => checkAccess('reports.sales'), [checkAccess]);
  const canViewStockReports = useMemo(() => checkAccess('reports.stock'), [checkAccess]);
  const canViewConsolidatedReports = useMemo(() => checkAccess('reports.consolidated'), [checkAccess]);
  const canManageUsers = useMemo(() => checkAccess('users.create'), [checkAccess]);
  const canManageBranches = useMemo(() => checkAccess('branches.create'), [checkAccess]);
  const canAccessGlobalSettings = useMemo(() => checkAccess('settings.global'), [checkAccess]);

  return {
    checkAccess,
    canAccessKasir,
    canManageProducts,
    canManageStock,
    canDoStockOpname,
    canViewSalesReports,
    canViewStockReports,
    canViewConsolidatedReports,
    canManageUsers,
    canManageBranches,
    canAccessGlobalSettings,
  };
};
