import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

function SkeletonLine({ width, height = 16, delay = 0 }: { width: string | number; height?: number; delay?: number }) {
  const { isDark } = useTheme();
  const translateX = useRef(new Animated.Value(-SCREEN_WIDTH)).current;

  const baseColor = isDark ? '#2A2A2A' : '#E0DDD5';
  const shimmerLight = isDark ? '#3A3A3A' : '#F0EDE6';
  const shimmerDark = isDark ? '#222222' : '#D4D0C8';

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(translateX, {
          toValue: SCREEN_WIDTH,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: -SCREEN_WIDTH,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isDark]);

  return (
    <View style={[styles.line, { width: width as any, height, backgroundColor: baseColor, overflow: 'hidden' }]}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}>
        <LinearGradient
          colors={[shimmerDark, shimmerLight, shimmerDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
    </View>
  );
}

function ArticleSkeleton({ baseDelay = 0, long = false }: { baseDelay?: number; long?: boolean }) {
  return (
    <View style={styles.article}>
      <SkeletonLine width={80} height={10} delay={baseDelay} />
      <View style={styles.gap4} />
      <SkeletonLine width="90%" height={24} delay={baseDelay + 60} />
      <View style={styles.gap2} />
      <SkeletonLine width="70%" height={24} delay={baseDelay + 120} />
      <View style={styles.gap12} />
      <SkeletonLine width="100%" delay={baseDelay + 180} />
      <View style={styles.gap6} />
      <SkeletonLine width="100%" delay={baseDelay + 240} />
      <View style={styles.gap6} />
      <SkeletonLine width="100%" delay={baseDelay + 300} />
      <View style={styles.gap6} />
      <SkeletonLine width="85%" delay={baseDelay + 360} />
      {long && (
        <>
          <View style={styles.gap12} />
          <SkeletonLine width="100%" delay={baseDelay + 420} />
          <View style={styles.gap6} />
          <SkeletonLine width="100%" delay={baseDelay + 480} />
          <View style={styles.gap6} />
          <SkeletonLine width="100%" delay={baseDelay + 540} />
          <View style={styles.gap6} />
          <SkeletonLine width="100%" delay={baseDelay + 600} />
          <View style={styles.gap6} />
          <SkeletonLine width="78%" delay={baseDelay + 660} />
        </>
      )}
    </View>
  );
}

export function BriefingLoading({ long = false }: { long?: boolean }) {
  return (
    <View style={styles.container}>
      <ArticleSkeleton baseDelay={0} long={long} />
      <ArticleSkeleton baseDelay={200} long={long} />
      <ArticleSkeleton baseDelay={400} long={long} />
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
