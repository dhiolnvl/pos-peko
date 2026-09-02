import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, useWindowDimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { useOfflineSync } from '@/hooks/useOfflineSync';

interface Props {
  title?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  onLogout?: () => void;
  rightElement?: React.ReactNode;
  searchElement?: React.ReactNode;
}

export function CashierHeader({ title, rightIcon, onRightPress, onLogout, rightElement, searchElement }: Props) {
  const insets = useSafeAreaInsets();
  const { user, currentBranch } = useAuth();
  const { width } = useWindowDimensions();
  const { isOnline, pendingCount, isSyncing, flushQueue } = useOfflineSync();
  const isTablet = width >= 768;

  const logoW = isTablet ? 120 : 110;
  const logoH = isTablet ? 54 : 50;
  const iconSize = isTablet ? 28 : 22;

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.left}>
          <Image
            source={require('@/assets/logo.png')}
            style={{ width: logoW, height: logoH, flexShrink: 0 }}
            resizeMode="contain"
          />
          {!searchElement && isTablet && (
            <View style={styles.leftInfo}>
              {title ? (
                <Text style={[styles.title, { fontSize: 20 }]} numberOfLines={1}>{title}</Text>
              ) : null}
              <Text style={[styles.sub, { fontSize: 13 }]} numberOfLines={1}>
                {user?.name || 'Kasir'} · {currentBranch?.name || '-'}
              </Text>
            </View>
          )}
        </View>

        {searchElement ? (
          <View style={styles.searchWrap}>
            {searchElement}
          </View>
        ) : null}

        <View style={styles.right}>
          {/* Indikator offline */}
          {!isOnline && (
            <View style={styles.offlineBadge}>
              <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
              <Text style={styles.offlineBadgeText}>Offline</Text>
            </View>
          )}
          {/* Badge pending orders yang belum tersync */}
          {pendingCount > 0 && (
            <TouchableOpacity
              style={styles.pendingBadge}
              onPress={() => {
                if (isSyncing) return;
                if (!isOnline) {
                  Alert.alert('Offline', 'Tidak ada koneksi internet. Transaksi akan otomatis tersync saat koneksi kembali.');
                  return;
                }
                flushQueue();
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isSyncing ? 'sync-outline' : 'time-outline'}
                size={14}
                color="#fff"
              />
              <Text style={styles.pendingBadgeText}>
                {isSyncing ? 'Sync...' : `${pendingCount} pending`}
              </Text>
            </TouchableOpacity>
          )}
          {rightElement}
          {rightIcon && onRightPress && (
            <TouchableOpacity onPress={onRightPress} style={styles.iconBtn}>
              <Ionicons name={rightIcon} size={iconSize} color="#fff" />
            </TouchableOpacity>
          )}
          {onLogout && (
            <TouchableOpacity onPress={onLogout} style={styles.iconBtn}>
              <Ionicons name="log-out-outline" size={iconSize} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#56B2C1',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 8,
  },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  leftInfo: { flex: 1, minWidth: 0 },
  title: { fontWeight: '700', color: '#fff' },
  sub: { color: '#D4EFF4', marginTop: 1 },
  searchWrap: { flex: 1, minWidth: 0 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  iconBtn: { padding: 8 },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E53E3E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  offlineBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E69738',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pendingBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});
