import React from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import Constants from 'expo-constants';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';

const isExpoGo = Constants.appOwnership === 'expo';
// isGlassEffectAPIAvailable checks the API exists — unlike isLiquidGlassAvailable,
// it returns true even if the user has Reduce Transparency or Classic mode enabled.
const glassAvailable = !isExpoGo && isGlassEffectAPIAvailable();

interface Props {
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
  fallbackColor?: string;
  colorScheme?: 'auto' | 'light' | 'dark';
}

const styles = StyleSheet.create({
  expoGoFallback: {
    backgroundColor: 'rgba(252, 251, 250, 0.90)',
  },
});

export function GlassSurface({ style, children, fallbackColor, colorScheme = 'auto' }: Props) {
  const flatStyle = StyleSheet.flatten(style) ?? {};

  // Expo Go — no native modules available
  if (isExpoGo) {
    return (
      <View
        style={[
          StyleSheet.absoluteFillObject,
          flatStyle,
          styles.expoGoFallback,
          fallbackColor ? { backgroundColor: fallbackColor } : undefined,
        ]}
      >
        {children}
      </View>
    );
  }

  // iOS 26+ — true Liquid Glass via expo-glass-effect
  if (glassAvailable) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={colorScheme}
        style={[StyleSheet.absoluteFillObject, flatStyle]}
      >
        {children}
      </GlassView>
    );
  }

  // iOS < 26 — expo-blur frosted glass fallback
  return (
    <BlurView
      intensity={80}
      tint="systemUltraThinMaterial"
      style={[StyleSheet.absoluteFillObject, flatStyle]}
    >
      {children}
    </BlurView>
  );
}
