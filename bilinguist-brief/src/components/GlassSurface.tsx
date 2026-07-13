import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Constants from 'expo-constants';
import { BlurView } from 'expo-blur';
import { GlassView, GlassContainer, isGlassEffectAPIAvailable } from 'expo-glass-effect';

const isExpoGo = Constants.appOwnership === 'expo';
export const glassAvailable = !isExpoGo && isGlassEffectAPIAvailable();

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
  expoGoFallback: {
    backgroundColor: 'rgba(252, 251, 250, 0.90)',
  },
});

export function GlassSurface({ style, children, fallbackColor, colorScheme = 'auto' }: Props) {
  const flatStyle = StyleSheet.flatten(style) ?? {};

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

// Wraps multiple GlassView siblings so they merge when close — iOS 26 only.
// Falls back to a plain View on older iOS (children already handle their own backgrounds).
export function GlassGroupContainer({ style, children, spacing, pointerEvents }: ContainerProps) {
  if (glassAvailable) {
    return (
      <GlassContainer spacing={spacing} style={style} pointerEvents={pointerEvents}>
        {children}
      </GlassContainer>
    );
  }
  return <View style={style} pointerEvents={pointerEvents}>{children}</View>;
}
