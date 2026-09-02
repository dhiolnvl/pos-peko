import React from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Dashboard header (logo + greeting) ──────────────────────────────────────

interface DashboardHeaderProps {
  userName?: string;
  dateLabel?: string;
  onLogout: () => void;
}

export function OwnerDashboardHeader({ userName, dateLabel, onLogout }: DashboardHeaderProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const logoW = isTablet ? 150 : 100;
  const logoH = isTablet ? 68 : 46;
  const iconSize = isTablet ? 28 : 22;
  const titleSize = isTablet ? 18 : 14;
  const subSize = isTablet ? 13 : 10;

  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <View style={styles.left}>
        <Image
          source={require('@/assets/logo.png')}
          style={{ width: logoW, height: logoH }}
          resizeMode="contain"
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { fontSize: titleSize }]} numberOfLines={1}>
            Halo, {userName || 'Owner'}
          </Text>
          {!!dateLabel && (
            <Text style={[styles.date, { fontSize: subSize }]} numberOfLines={1}>
              {dateLabel}
            </Text>
          )}
        </View>
      </View>
      <TouchableOpacity onPress={onLogout} style={styles.iconBtn}>
        <Ionicons name="log-out-outline" size={iconSize} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Page header (sub-screens) ────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  // right slot: add button
  onAdd?: () => void;
  // right slot: save button
  onSave?: () => void;
  saving?: boolean;
  // right slot: badge count
  badgeCount?: number;
  // right slot: fully custom node
  rightElement?: React.ReactNode;
  // subtitle below title
  subtitle?: string;
}

export function OwnerPageHeader({
  title,
  onBack,
  onClose,
  onAdd,
  onSave,
  saving,
  badgeCount,
  rightElement,
  subtitle,
}: PageHeaderProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const iconSize = isTablet ? 26 : 22;
  const titleSize = isTablet ? 18 : 14;
  const subSize = isTablet ? 13 : 10;
  const logoW = isTablet ? 150 : 100;
  const logoH = isTablet ? 68 : 46;

  const leftIcon = onClose ? 'close' : 'arrow-back';
  const leftAction = onClose ?? onBack;

  return (
    <View style={[styles.pageHeader, { paddingTop: insets.top + 6 }]}>
      {/* Left — logo (root tab) atau back/close (sub-screen) */}
      {leftAction ? (
        <TouchableOpacity onPress={leftAction} style={styles.iconBtn}>
          <Ionicons name={leftIcon} size={iconSize} color="#fff" />
        </TouchableOpacity>
      ) : (
        <Image
          source={require('@/assets/logo.png')}
          style={{ width: logoW, height: logoH }}
          resizeMode="contain"
        />
      )}

      {/* Center — title */}
      <View style={styles.titleBlock}>
        <Text style={[styles.pageTitle, { fontSize: titleSize }]} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={[styles.pageSub, { fontSize: subSize }]} numberOfLines={1}>{subtitle}</Text>
        )}
      </View>

      {/* Right — action */}
      {rightElement ? (
        <View style={styles.rightSlot}>{rightElement}</View>
      ) : onAdd ? (
        <TouchableOpacity onPress={onAdd} style={styles.addBtn}>
          <Ionicons name="add" size={iconSize} color="#fff" />
        </TouchableOpacity>
      ) : onSave ? (
        <TouchableOpacity onPress={onSave} disabled={saving} style={styles.saveBtn}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Simpan</Text>
          )}
        </TouchableOpacity>
      ) : badgeCount != null && badgeCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeCount}</Text>
        </View>
      ) : (
        <View style={{ width: 38 }} />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Dashboard header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#56B2C1',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  greeting: { fontWeight: '700', color: '#fff' },
  date: { color: '#D4EFF4', marginTop: 1 },
  iconBtn: { padding: 8 },

  // Page header
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#56B2C1',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  titleBlock: { flex: 1 },
  pageTitle: { fontWeight: '700', color: '#fff' },
  pageSub: { color: '#D4EFF4', marginTop: 1 },
  rightSlot: { minWidth: 38, alignItems: 'flex-end' },
  addBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 10, minWidth: 72, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  badge: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 9, paddingVertical: 3,
    minWidth: 38, alignItems: 'center',
  },
  badgeText: { color: '#347385', fontSize: 12, fontWeight: '700' },
});
