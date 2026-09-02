/**
 * TabletCenteredView
 * A wrapper that centers content with a max-width on tablet landscape screens.
 * Usage: wrap all main content (below header) inside this component.
 */

import React from 'react';
import { View, useWindowDimensions, StyleSheet } from 'react-native';

interface TabletCenteredViewProps {
  children: React.ReactNode;
  maxWidth?: number;
  style?: object;
}

export function TabletCenteredView({
  children,
  maxWidth = 900,
  style,
}: TabletCenteredViewProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  if (!isTablet) {
    return <View style={[{ flex: 1 }, style]}>{children}</View>;
  }

  return (
    <View style={styles.outer}>
      <View style={[styles.inner, { maxWidth, paddingHorizontal: 16 }, style]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: 'center',
    width: '100%',
  },
  inner: {
    flex: 1,
    width: '100%',
  },
});
