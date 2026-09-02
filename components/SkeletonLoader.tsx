/**
 * SkeletonLoader
 * Shimmer placeholder for list screens while loading.
 * No external dependency — pure Animated API.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';

interface SkeletonBoxProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: object;
}

export function SkeletonBox({ width, height, borderRadius = 8, style }: SkeletonBoxProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: '#E5E7EB', opacity },
        style,
      ]}
    />
  );
}

/** Single list card skeleton */
export function ListItemSkeleton() {
  return (
    <View style={sk.card}>
      <SkeletonBox width={44} height={44} borderRadius={12} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonBox width="70%" height={14} />
        <SkeletonBox width="45%" height={11} />
      </View>
      <SkeletonBox width={60} height={16} />
    </View>
  );
}

/** Product card skeleton */
export function ProductCardSkeleton() {
  return (
    <View style={sk.productCard}>
      <SkeletonBox width="100%" height={96} borderRadius={10} />
      <View style={{ gap: 6, padding: 8 }}>
        <SkeletonBox width="80%" height={13} />
        <SkeletonBox width="50%" height={11} />
        <SkeletonBox width="60%" height={14} />
      </View>
    </View>
  );
}

/** Render n skeleton list items */
export function ListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={{ gap: 10, padding: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
  },
  productCard: {
    backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    width: 150,
  },
});
