import React, { useRef, useCallback } from 'react';
import { Animated, Pressable, StyleSheet, View, ViewStyle, GestureResponderEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import { glassAvailable } from './GlassSurface';
let LiquidGlassView: React.ComponentType<any> | null = null;
if (glassAvailable) {
  try { LiquidGlassView = require('../../modules/liquid-glass/src').LiquidGlassView; } catch { /* no-op */ }
}

interface Props {
  onPress: () => void;
  children: React.ReactNode;
  size?: number;
  style?: ViewStyle;
  hitSlop?: { top: number; bottom: number; left: number; right: number };
  cornerRadius?: number;
  disabled?: boolean;
  /** Overshoot-then-settle release feel. Default true, matching every
   *  existing GlassButton (back/close/save-word buttons, etc). Pass false
   *  for a plain press-and-release, matching FloatingTabBar's nav pills and
   *  SpringButton — no overshoot. */
  bounce?: boolean;
}

export function GlassButton({
  onPress,
  children,
  size = 40,
  style,
  hitSlop = { top: 8, bottom: 8, left: 8, right: 8 },
  cornerRadius,
  disabled = false,
  bounce = true,
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
    if (!bounce) {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 20,
      }).start();
      return;
    }
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
  }, [scale, bounce]);

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
        {/* Glass clip — overflow:hidden here to keep glass within the circle.
            The translucent backing matters: UIGlassEffect refracts whatever is
            behind it, and these buttons sit on GameHeader's solid flat
            background, so with nothing behind them the glass rendered as
            literally nothing. Same backing the Save-word pill in WordPopup
            uses, which is why that one reads correctly. */}
        <View style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            overflow: 'hidden',
            backgroundColor: isDark ? 'rgba(40,40,40,0.80)' : 'rgba(255,255,255,0.80)',
          },
        ]}>
          {glassAvailable && LiquidGlassView ? (
            <LiquidGlassView cornerRadius={radius} style={StyleSheet.absoluteFill} />
          ) : (
            <BlurView
              intensity={isDark ? 60 : 70}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          )}
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
