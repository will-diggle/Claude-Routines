import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';

const GENERATING_PHRASES = [
  'Generating your brief',     // English
  'Génération en cours',       // French
  'Brief wird erstellt',       // German
  'Genererar nyhetsbrevet',    // Swedish
  'Generazione in corso',      // Italian
  'Generando tu briefing',     // Spanish
  'Bülteniniz hazırlanıyor',   // Turkish
];

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

function SweepBar() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1100, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-width, width] });

  return (
    <View style={{ height: 1.5, width, overflow: 'hidden', opacity: 0.5 }}>
      <Animated.View
        style={{
          position: 'absolute', top: 0, left: 0,
          height: 1.5, width,
          backgroundColor: colors.inkMid,
          transform: [{ translateX }],
        }}
      />
    </View>
  );
}

export function BriefingLoading() {
  const { colors, fontFamily } = useTheme();
  const [phraseIndex, setPhraseIndex] = useState(0);
  const textOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let index = 0;
    const cycle = () => {
      Animated.timing(textOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        index = (index + 1) % GENERATING_PHRASES.length;
        setPhraseIndex(index);
        Animated.timing(textOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    };
    const timer = setInterval(cycle, 600);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.spinnerBlock}>
        <SweepBar />
        <Animated.Text
          style={[styles.phraseText, { color: colors.inkLight, fontFamily: fontFamily.italic, opacity: textOpacity }]}
        >
          {GENERATING_PHRASES[phraseIndex]}
        </Animated.Text>
        <SweepBar />
      </View>
      <ArticleSkeleton />
      <ArticleSkeleton />
      <ArticleSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: Spacing.xl },
  spinnerBlock: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: 14,
  },
  phraseText: {
    fontSize: 15,
    letterSpacing: 0.3,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
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
