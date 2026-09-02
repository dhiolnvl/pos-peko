/**
 * useAuth Hook
 * Convenient hook to access auth state and helpers
 */

import { useAuthStore } from '@/store/authStore';
import { isOwner, isBackOffice, isCashier, isStaffPusat, canAccess } from '@/lib/permissions';
import type { Feature } from '@/lib/permissions';

export const useAuth = () => {
  const {
    user,
    session,
    currentBranch,
    isLoading,
    isInitialized,
    isOfflineMode,
    error,
    initialize,
    login,
    logout,
    switchBranch,
    changePassword,
    refreshUser,
    clearError,
  } = useAuthStore();

  return {
    // State
    user,
    session,
    currentBranch,
    isLoading,
    isInitialized,
    isOfflineMode,
    error,

    // Computed
    isAuthenticated: !!user && (isOfflineMode || !!session),
    isOwner: isOwner(user?.role),
    isBackOffice: isBackOffice(user?.role),
    isCashier: isCashier(user?.role),
    isStaffPusat: isStaffPusat(user?.role),
    needsBranchSelection: user?.role === 'owner' && !currentBranch,

    // Helpers
    canAccess: (feature: Feature) => canAccess(user?.role, feature),

    // Actions
    initialize,
    login,
    logout,
    switchBranch,
    changePassword,
    refreshUser,
    clearError,
  };
};

export default useAuth;
