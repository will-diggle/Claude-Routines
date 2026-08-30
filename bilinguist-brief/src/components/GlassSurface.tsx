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

// Why glass fell back, when it does. Every failure here is caught so the app
// never crashes, which also means a silent downgrade to blur is indistinguishable
// from success on screen — this records enough to tell them apart.
export const glassDiag: {
  expoGo: boolean;
  viewLoaded: boolean;
  loadError: string | null;
  boundaryError: string | null;
  glassBranch: boolean | null;
  osVersion: string | null;
  moduleError: string | null;
} = {
  expoGo: isExpoGo,
  viewLoaded: false,
  loadError: null,
  boundaryError: null,
  glassBranch: null,
  osVersion: null,
  moduleError: null,
};

if (!isExpoGo) {
  try {
    // requireNativeView is the Expo Modules SDK way to get a native view by module name.
    // LiquidGlassModule registers 'LiquidGlass' and LiquidGlassView under it.
    const { requireNativeView } = require('expo');
    NativeGlassView = requireNativeView('LiquidGlass');
    glassAvailable = true;
    glassDiag.viewLoaded = true;
  } catch (e: any) {
    NativeGlassView = null;
    glassDiag.loadError = String(e?.message ?? e);
  }

  // Ask the native module which branch setupGlass() takes. Separate from the
  // view lookup above: the module can answer even if the view fails to mount.
  try {
    const { requireNativeModule } = require('expo');
    const d = requireNativeModule('LiquidGlass').diagnostics();
    glassDiag.glassBranch = !!d.glassBranch;
    glassDiag.osVersion   = String(d.osVersion);
  } catch (e: any) {
    glassDiag.moduleError = String(e?.message ?? e);
  }
}

// One line, short enough to read off a phone screen and repeat back.
export function glassDiagSummary(): string {
  if (glassDiag.expoGo) return 'glass: expo-go (never available)';
  const parts: string[] = [];
  parts.push(glassDiag.viewLoaded ? 'view:ok' : `view:FAIL(${glassDiag.loadError ?? '?'})`);
  parts.push(
    glassDiag.glassBranch === null
      ? `module:FAIL(${glassDiag.moduleError ?? '?'})`
      : glassDiag.glassBranch ? 'branch:glass' : 'branch:blur',
  );
  if (glassDiag.osVersion) parts.push(`iOS ${glassDiag.osVersion}`);
  if (glassDiag.boundaryError) parts.push(`boundary:CRASH(${glassDiag.boundaryError})`);
  return `glass: ${parts.join(' · ')}`;
}

// Error boundary: if the native view crashes mid-render, fall back to blur silently.
interface BoundaryState { crashed: boolean }
class GlassBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  BoundaryState
> {
  state: BoundaryState = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(e: Error) { glassDiag.boundaryError = String(e?.message ?? e); }
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

function BlurFallback({ style, children, fallbackColor, colorScheme, intensity }: { style?: object; children?: React.ReactNode; fallbackColor?: string; colorScheme?: 'auto' | 'light' | 'dark'; intensity?: number }) {
  const tint = colorScheme === 'dark'
    ? 'systemUltraThinMaterialDark'
    : colorScheme === 'light'
    ? 'systemUltraThinMaterialLight'
    : 'systemUltraThinMaterial';
  return (
    <BlurView
      intensity={intensity ?? 80}
      tint={tint as any}
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
    const blurFallback = <BlurFallback style={flatStyle} fallbackColor={fallbackColor} colorScheme={colorScheme} intensity={intensity}>{children}</BlurFallback>;
    return (
      <GlassBoundary fallback={blurFallback}>
        <GlassView
          style={[StyleSheet.absoluteFillObject, flatStyle]}
          cornerRadius={cornerRadius}
          colorScheme={colorScheme ?? 'auto'}
          {...(intensity !== undefined ? { intensity } : {})}
        >
          {children}
        </GlassView>
      </GlassBoundary>
    );
  }

  return <BlurFallback style={flatStyle} fallbackColor={fallbackColor} colorScheme={colorScheme}>{children}</BlurFallback>;
}

// On iOS 26+, wraps children in the native GlassContainer so adjacent glass elements merge.
// Falls back to a plain View on older iOS.
export function GlassGroupContainer({ style, children, pointerEvents }: ContainerProps) {
  // GlassContainer merging isn't available via our custom module yet — plain View works fine
  // since each pill has its own GlassView background.
  return <View style={style} pointerEvents={pointerEvents}>{children}</View>;
}
