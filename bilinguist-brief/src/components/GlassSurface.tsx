import React from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import Constants from 'expo-constants';
import { BlurView } from 'expo-blur';

const isExpoGo = Constants.appOwnership === 'expo';

// iOS 26+ gets true Liquid Glass via patched expo-blur; older iOS gets systemUltraThinMaterial
const iosMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version), 10) : 0;
const glassTint = iosMajor >= 26 ? ('glass' as any) : 'systemUltraThinMaterial';

interface Props {
  style?: ViewStyle | ViewStyle[];
  cornerRadius?: number;
  intensity?: number;
  children?: React.ReactNode;
  fallbackColor?: string;
}

const styles = StyleSheet.create({
  expoGoFallback: {
    backgroundColor: 'rgba(252, 251, 250, 0.90)',
  },
});

export function GlassSurface({ style, children, fallbackColor }: Props) {
  const flatStyle = StyleSheet.flatten(style) ?? {};

  if (isExpoGo) {
    return (
      <View style={[StyleSheet.absoluteFillObject, flatStyle, styles.expoGoFallback, fallbackColor ? { backgroundColor: fallbackColor } : undefined]}>
        {children}
      </View>
    );
  }

  return (
    <BlurView
      intensity={80}
      tint={glassTint}
      style={[StyleSheet.absoluteFillObject, flatStyle]}
    >
      {children}
    </BlurView>
  );
}
