import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';

function SkeletonLine({ width, height = 16 }: { width: string | number; height?: number }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.line,
        {
          width: width as any,
          height,
          backgroundColor: colors.borderMid,
          opacity,
        },
      ]}
    />
  );
}

function ArticleSkeleton() {
  return (
    <View style={styles.article}>
      <SkeletonLine width={80} height={10} />
      <View style={styles.gap4} />
      <SkeletonLine width="90%" height={24} />
      <View style={styles.gap2} />
      <SkeletonLine width="70%" height={24} />
      <View style={styles.gap12} />
      <SkeletonLine width="100%" />
      <View style={styles.gap6} />
      <SkeletonLine width="100%" />
      <View style={styles.gap6} />
      <SkeletonLine width="100%" />
      <View style={styles.gap6} />
      <SkeletonLine width="85%" />
    </View>
  );
}

export function BriefingLoading() {
  return (
    <View style={styles.container}>
      <ArticleSkeleton />
      <ArticleSkeleton />
      <ArticleSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: Spacing.xl },
  article: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0DDD5',
  },
  line: { borderRadius: 4 },
  gap2: { height: 2 },
  gap4: { height: 4 },
  gap6: { height: 6 },
  gap12: { height: 12 },
});
