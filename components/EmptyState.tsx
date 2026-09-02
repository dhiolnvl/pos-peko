/**
 * EmptyState
 * Reusable empty/no-data illustration component.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type IllustrationKey =
  | 'no-products'
  | 'no-transactions'
  | 'offline'
  | 'no-results'
  | 'no-stock'
  | 'no-reports'
  | 'no-users'
  | 'all-done';

interface IllustrationConfig {
  icon: string;
  color: string;
  bg: string;
}

const ILLUSTRATIONS: Record<IllustrationKey, IllustrationConfig> = {
  'no-products':     { icon: 'pricetag-outline',       color: '#347385', bg: '#EEF8FA' },
  'no-transactions': { icon: 'receipt-outline',         color: '#56B2C1', bg: '#EEF8FA' },
  'offline':         { icon: 'cloud-offline-outline',   color: '#EF4444', bg: '#FEF2F2' },
  'no-results':      { icon: 'search-outline',          color: '#9CA3AF', bg: '#F3F4F6' },
  'no-stock':        { icon: 'cube-outline',            color: '#F59E0B', bg: '#FFFBEB' },
  'no-reports':      { icon: 'stats-chart-outline',     color: '#22C55E', bg: '#F0FDF4' },
  'no-users':        { icon: 'people-outline',          color: '#347385', bg: '#EEF8FA' },
  'all-done':        { icon: 'checkmark-circle-outline',color: '#22C55E', bg: '#F0FDF4' },
};

interface EmptyStateProps {
  illustration: IllustrationKey;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  illustration,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const cfg = ILLUSTRATIONS[illustration];

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon as any} size={40} color={cfg.color} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {!!actionLabel && !!onAction && (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: cfg.color }]}
          onPress={onAction}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 48, paddingHorizontal: 32, gap: 10,
  },
  iconWrap: {
    width: 80, height: 80, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
  btn: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 11,
    borderRadius: 12,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
