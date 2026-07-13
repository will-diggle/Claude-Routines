import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Constants from 'expo-constants';
import { BlurView } from 'expo-blur';

const isExpoGo = Constants.appOwnership === 'expo';

// Lazy-load expo-glass-effect — if the native module isn't compatible with this
// SDK version it will throw, and glassAvailable stays false (no crash).
let GlassView: React.ComponentType<any> | null = null;
let GlassContainer: React.ComponentType<any> | null = null;
export let glassAvailable = false;

if (!isExpoGo) {
  try {
    const mod = require('expo-glass-effect');
    const available = mod.isGlassEffectAPIAvailable?.();
    if (available) {
      GlassView = mod.GlassView;
      GlassContainer = mod.GlassContainer;
      glassAvailable = true;
    }
  } catch {
    // expo-glass-effect not compatible with this runtime — use blur fallback
  }
}

// Error boundary: if GlassView crashes mid-render, swap to BlurView silently.
interface BoundaryState { crashed: boolean }
class GlassBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  render() { return this.state.crashed ? this.props.fallback : this.props.children; }
}

interface Props {
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
  fallbackColor?: string;
  colorScheme?: 'auto' | 'light' | 'dark';
}

interface ContainerProps {
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
  spacing?: number;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
}

const styles = StyleSheet.create({
  expoGoFallback: { backgroundColor: 'rgba(252, 251, 250, 0.90)' },
});

function BlurFallback({ style, children, fallbackColor }: { style?: object; children?: React.ReactNode; fallbackColor?: string }) {
  return (
    <BlurView intensity={80} tint="systemUltraThinMaterial" style={[StyleSheet.absoluteFillObject, style]}>
      {children}
    </BlurView>
  );
}

export function GlassSurface({ style, children, fallbackColor, colorScheme = 'auto' }: Props) {
  const flatStyle = StyleSheet.flatten(style) ?? {};

  if (isExpoGo) {
    return (
      <View style={[StyleSheet.absoluteFillObject, flatStyle, styles.expoGoFallback, fallbackColor ? { backgroundColor: fallbackColor } : undefined]}>
        {children}
      </View>
    );
  }

  if (glassAvailable && GlassView) {
    const NativeGlass = GlassView;
    const blurFallback = <BlurFallback style={flatStyle} fallbackColor={fallbackColor}>{children}</BlurFallback>;
    return (
      <GlassBoundary fallback={blurFallback}>
        <NativeGlass glassEffectStyle="regular" colorScheme={colorScheme} style={[StyleSheet.absoluteFillObject, flatStyle]}>
          {children}
        </NativeGlass>
      </GlassBoundary>
    );
  }

  return <BlurFallback style={flatStyle} fallbackColor={fallbackColor}>{children}</BlurFallback>;
}

export function GlassGroupContainer({ style, children, spacing, pointerEvents }: ContainerProps) {
  if (glassAvailable && GlassContainer) {
    const NativeContainer = GlassContainer;
    return (
      <GlassBoundary fallback={<View style={style} pointerEvents={pointerEvents}>{children}</View>}>
        <NativeContainer spacing={spacing} style={style} pointerEvents={pointerEvents}>
          {children}
        </NativeContainer>
      </GlassBoundary>
    );
  }
  return <View style={style} pointerEvents={pointerEvents}>{children}</View>;
}
