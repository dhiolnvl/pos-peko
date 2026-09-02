import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  title: string;
  subtitle?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  onLogout?: () => void;
  rightElement?: React.ReactNode;
}

export function BackofficeHeader({ title, subtitle, rightIcon, onRightPress, onLogout, rightElement }: Props) {
  const insets = useSafeAreaInsets();
  const { user, currentBranch } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const titleSize = isTablet ? 20 : 14;
  const subSize = isTablet ? 15 : 11;
  const logoW = isTablet ? 150 : 110;
  const logoH = isTablet ? 68 : 50;
  const iconSize = isTablet ? 28 : 22;

  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <View style={styles.left}>
        <Image
          source={require('@/assets/logo.png')}
          style={{ width: logoW, height: logoH }}
          resizeMode="contain"
        />
        <View>
          <Text style={[styles.title, { fontSize: titleSize }]}>{title}</Text>
          <Text style={[styles.sub, { fontSize: subSize }]}>
            {subtitle ?? `${user?.name || 'Staff'} · ${currentBranch?.name || '-'}`}
          </Text>
        </View>
      </View>
      <View style={styles.right}>
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
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#56B2C1',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  title: { fontWeight: '700', color: '#fff' },
  sub: { color: '#D4EFF4', marginTop: 1 },
  right: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 8 },
});
