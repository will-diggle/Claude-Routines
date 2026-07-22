import React, { useRef, useCallback } from 'react';
import {
  Animated, Pressable, StyleSheet, ViewStyle,
  GestureResponderEvent, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LiquidGlassView } from '../../modules/liquid-glass/src';

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
      toValue: 0.92,
      useNativeDriver: true,
      tension: 400,
      friction: 8,        // low friction = fast snap down
    }).start();
  }, [scale]);

  const pressOut = useCallback(() => {
    // Overshoot to 1.08 then settle — this is the "bounce back" feel
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.08,
        useNativeDriver: true,
        tension: 500,
        friction: 5,      // very low friction = strong overshoot
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 200,
        friction: 12,     // settles cleanly without further wobble
      }),
    ]).start();
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

  const isIOS26 = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

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
        {glass && isIOS26 && (
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
