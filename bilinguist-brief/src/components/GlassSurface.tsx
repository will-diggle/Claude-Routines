import React from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import Constants from 'expo-constants';
import { BlurView } from 'expo-blur';

const isExpoGo = Constants.appOwnership === 'expo';

// Lazy-load our custom native module at startup.
// requireNativeView('LiquidGlass') throws if the module didn't autolink — caught here so
// the app never crashes. On success we have real UIGlassEffect on iOS 26+.
let NativeGlassView: React.ComponentType<any> | null = null;
export let glassAvailable = false;

if (!isExpoGo) {
  try {
    // requireNativeView is the Expo Modules SDK way to get a native view by module name.
    // LiquidGlassModule registers 'LiquidGlass' and LiquidGlassView under it.
    const { requireNativeView } = require('expo');
    NativeGlassView = requireNativeView('LiquidGlass');
    glassAvailable = true;
  } catch {
    NativeGlassView = null;
  }
}

// Error boundary: if the native view crashes mid-render, fall back to blur silently.
interface BoundaryState { crashed: boolean }
class GlassBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  BoundaryState
> {
  state: BoundaryState = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  render() { return this.state.crashed ? this.props.fallback : this.props.children; }
}

interface Props {
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
  fallbackColor?: string;
  colorScheme?: 'auto' | 'light' | 'dark';
  cornerRadius?: number;
  intensity?: number;
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
    <BlurView
      intensity={80}
      tint="systemUltraThinMaterial"
      style={[StyleSheet.absoluteFillObject, style]}
    >
      {children}
    </BlurView>
  );
}

export function GlassSurface({ style, children, fallbackColor, colorScheme, cornerRadius = 100, intensity }: Props) {
  const flatStyle = StyleSheet.flatten(style) ?? {};

  if (isExpoGo) {
    return (
      <View style={[StyleSheet.absoluteFillObject, flatStyle, styles.expoGoFallback, fallbackColor ? { backgroundColor: fallbackColor } : undefined]}>
        {children}
      </View>
    );
  }

  if (glassAvailable && NativeGlassView) {
    const GlassView = NativeGlassView;
    const blurFallback = <BlurFallback style={flatStyle} fallbackColor={fallbackColor}>{children}</BlurFallback>;
    return (
      <GlassBoundary fallback={blurFallback}>
        <GlassView
          style={[StyleSheet.absoluteFillObject, flatStyle]}
          cornerRadius={cornerRadius}
          {...(intensity !== undefined ? { intensity } : {})}
        >
          {children}
        </GlassView>
      </GlassBoundary>
    );
  }

  return <BlurFallback style={flatStyle} fallbackColor={fallbackColor}>{children}</BlurFallback>;
}

// On iOS 26+, wraps children in the native GlassContainer so adjacent glass elements merge.
// Falls back to a plain View on older iOS.
export function GlassGroupContainer({ style, children, pointerEvents }: ContainerProps) {
  // GlassContainer merging isn't available via our custom module yet — plain View works fine
  // since each pill has its own GlassView background.
  return <View style={style} pointerEvents={pointerEvents}>{children}</View>;
}
