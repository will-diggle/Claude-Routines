import React, { useRef, useCallback } from 'react';
import {
  Animated, Pressable, StyleSheet, ViewStyle,
  GestureResponderEvent, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { glassAvailable } from './GlassSurface';
let LiquidGlassView: React.ComponentType<any> | null = null;
if (glassAvailable) {
  try { LiquidGlassView = require('../../modules/liquid-glass/src').LiquidGlassView; } catch { /* no-op */ }
}

interface SpringButtonProps {
  onPress?: (e: GestureResponderEvent) => void;
  style?: ViewStyle | ViewStyle[];
  containerStyle?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
  disabled?: boolean;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  /** Render a liquid glass background instead of solid fill */
  glass?: boolean;
  cornerRadius?: number;
}

export function SpringButton({
  onPress,
  style,
  containerStyle,
  children,
  disabled = false,
  haptic = 'light',
  glass = false,
  cornerRadius = 14,
}: SpringButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      tension: 300,
      friction: 20,
    }).start();
  }, [scale]);

  const pressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 20,
    }).start();
  }, [scale]);

  const handlePress = useCallback((e: GestureResponderEvent) => {
    if (haptic !== 'none') {
      const feedbackStyle =
        haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium
        : haptic === 'heavy'  ? Haptics.ImpactFeedbackStyle.Heavy
        : Haptics.ImpactFeedbackStyle.Light;
      Haptics.impactAsync(feedbackStyle).catch(() => {});
    }
    onPress?.(e);
  }, [haptic, onPress]);

  const isIOS26 = glassAvailable;

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={handlePress}
      disabled={disabled}
      style={containerStyle}
    >
      <Animated.View
        style={[
          style,
          { transform: [{ scale }], opacity: disabled ? 0.4 : 1 },
          glass && styles.glassContainer,
        ]}
      >
        {glass && isIOS26 && LiquidGlassView && (
          <LiquidGlassView
            cornerRadius={cornerRadius}
            style={StyleSheet.absoluteFill}
          />
        )}
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  glassContainer: {
    overflow: 'hidden',
  },
});
