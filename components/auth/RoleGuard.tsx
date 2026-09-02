/**
 * RoleGuard Component
 * Protects content based on user permissions
 */

import React, { type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import type { Feature } from '@/lib/permissions';

interface RoleGuardProps {
  /**
   * Feature that requires permission check
   */
  feature: Feature;

  /**
   * Content to render if user has access
   */
  children: ReactNode;

  /**
   * Optional fallback content if user doesn't have access
   * If not provided, shows default "Access denied" message
   */
  fallback?: ReactNode;

  /**
   * If true, renders nothing when access is denied
   * Useful for hiding UI elements completely
   */
  hideOnDenied?: boolean;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  feature,
  children,
  fallback,
  hideOnDenied = false,
}) => {
  const { canAccess } = useAuth();

  const hasAccess = canAccess(feature);

  if (hasAccess) {
    return <>{children}</>;
  }

  if (hideOnDenied) {
    return null;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  // Default "Access denied" UI
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="lock-closed" size={48} color="#A0AEC0" style={styles.icon} />
        <Text style={styles.title}>Akses Tidak Diizinkan</Text>
        <Text style={styles.message}>
          Anda tidak memiliki izin untuk mengakses fitur ini
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F7FAFC',
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A202C',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#4A5568',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default RoleGuard;
