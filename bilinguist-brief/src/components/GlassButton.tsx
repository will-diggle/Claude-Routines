import React, { useRef, useCallback } from 'react';
import { Animated, Pressable, StyleSheet, View, ViewStyle, GestureResponderEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import { GlassSurface } from './GlassSurface';

interface Props {
  onPress: () => void;
  children: React.ReactNode;
  size?: number;
  style?: ViewStyle;
  hitSlop?: { top: number; bottom: number; left: number; right: number };
  cornerRadius?: number;
  disabled?: boolean;
}

export function GlassButton({
  onPress,
  children,
  size = 40,
  style,
  hitSlop = { top: 8, bottom: 8, left: 8, right: 8 },
  cornerRadius,
  disabled = false,
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
      onPressIn={disabled ? undefined : pressIn}
      onPressOut={disabled ? undefined : pressOut}
      onPress={disabled ? undefined : handlePress}
      hitSlop={hitSlop}
    >
      {/* Shadow lives here — separated from overflow:hidden so it isn't clipped */}
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: radius,
            opacity: disabled ? 0.35 : 1,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 12,
            elevation: 6,
          },
          style,
          { transform: [{ scale }] },
        ]}
      >
        {/* GlassSurface — the same path the tab bar and the Save-word pill use,
            self-closing (no children). GlassButton previously called
            requireNativeView itself via modules/liquid-glass/src, a second,
            independent binding to the same native view — mounted correctly
            (confirmed live) but rendered nothing. Converging on the one
            binding used everywhere else in the app rather than maintaining two
            separate paths to the same native effect. */}
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
          <GlassSurface
            cornerRadius={radius}
            colorScheme={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
        <Animated.View style={styles.iconWrapper}>
          {children}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
