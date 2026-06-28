import React from 'react';
import { NativeModules, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

// Runtime detection: LiquidGlass native module is registered in EAS builds (TestFlight/App Store)
// but NOT in Expo Go, where expo-blur's BlurView is used instead.
const hasNativeGlass = !!NativeModules.LiquidGlass;

let NativeGlassView: React.ComponentType<any> | null = null;
if (hasNativeGlass) {
  try {
    NativeGlassView = require('../../modules/liquid-glass/src').LiquidGlassView;
  } catch {
    // Module compiled but JS binding failed — fall back gracefully
  }
}

interface Props {
  style?: ViewStyle | ViewStyle[];
  cornerRadius?: number;
  intensity?: number;
  children?: React.ReactNode;
}

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

  // Expo Go fallback: expo-blur
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
