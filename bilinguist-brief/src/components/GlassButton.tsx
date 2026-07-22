import React, { useRef, useCallback } from 'react';
import { Animated, Pressable, StyleSheet, ViewStyle, GestureResponderEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';

interface Props {
  onPress: () => void;
  children: React.ReactNode;
  size?: number;
  style?: ViewStyle;
  hitSlop?: { top: number; bottom: number; left: number; right: number };
  cornerRadius?: number;
}

export function GlassButton({
  onPress,
  children,
  size = 40,
  style,
  hitSlop = { top: 8, bottom: 8, left: 8, right: 8 },
  cornerRadius,
}: Props) {
  const { isDark } = useTheme();
  const radius = cornerRadius ?? size / 2;
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.88,
      useNativeDriver: true,
      tension: 400,
      friction: 8,
    }).start();
  }, [scale]);

  const pressOut = useCallback(() => {
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.12,
        useNativeDriver: true,
        tension: 500,
        friction: 5,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 200,
        friction: 12,
      }),
    ]).start();
  }, [scale]);

  const handlePress = useCallback((e: GestureResponderEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={handlePress}
      hitSlop={hitSlop}
    >
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: radius,
            overflow: 'hidden',
          },
          style,
          { transform: [{ scale }] },
        ]}
      >
        <BlurView
          intensity={isDark ? 60 : 70}
          tint={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, styles.blur]}
        />
        <Animated.View style={styles.iconWrapper}>
          {children}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  blur: {
    borderRadius: 999,
  },
  iconWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
