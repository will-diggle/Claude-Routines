import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Constants from 'expo-constants';
import { BlurView } from 'expo-blur';

// Expo Go can't use expo-blur or local native modules.
const isExpoGo = Constants.appOwnership === 'expo';

// Always try to load the native view — works in EAS/TestFlight builds.
// Throws in Expo Go (requireNativeView finds no registered view), which is caught below.
// NOTE: NativeModules.LiquidGlass is NOT the right check — Expo Modules SDK does not
// inject into NativeModules. The try-catch on requireNativeView is the correct gate.
let NativeGlassView: React.ComponentType<any> | null = null;
if (!isExpoGo) {
  try {
    const mod = require('../../modules/liquid-glass/src');
    NativeGlassView = mod.LiquidGlassView ?? null;
  } catch {
    // Module not compiled in this build — fall back to expo-blur
  }
}

interface Props {
  style?: ViewStyle | ViewStyle[];
  cornerRadius?: number;
  intensity?: number;
  children?: React.ReactNode;
}

const styles = StyleSheet.create({
  expoGoFallback: {
    backgroundColor: 'rgba(240, 236, 228, 0.82)',
  },
});

export function GlassSurface({ style, cornerRadius = 100, intensity = 1, children }: Props) {
  const flatStyle = StyleSheet.flatten(style) ?? {};

  if (NativeGlassView) {
    return (
      <NativeGlassView
        style={[StyleSheet.absoluteFillObject, flatStyle]}
        cornerRadius={cornerRadius}
        intensity={intensity}
      >
        {children}
      </NativeGlassView>
    );
  }

  // Expo Go — no BlurView support, use a plain semi-transparent background
  if (isExpoGo) {
    return (
      <View style={[StyleSheet.absoluteFillObject, flatStyle, styles.expoGoFallback]}>
        {children}
      </View>
    );
  }

  // EAS build without the native module compiled — expo-blur fallback
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
