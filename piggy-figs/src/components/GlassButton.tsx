import React, { useRef } from 'react';
import {
  Animated, Pressable, StyleSheet, type ViewStyle, type StyleProp, type GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

// iOS 26's native Liquid Glass, via expo-glass-effect's GlassView, styled to
// the Bilinguist Brief design system's GlassButton spec: spring squeeze on
// press-in (0.88x), bounce past 1x (1.12x) then settle on release, haptic on
// every press, shadowOpacity 0.18 / shadowRadius 12, disabled opacity 0.35.
// On anything that isn't iOS 26 (older iOS, Android, simulator without the
// glass API), GlassView quietly renders as a plain <View> with none of its
// props applied — so `fallbackBackground` keeps buttons legible instead of
// turning invisible/transparent-on-black in that case.
interface Props {
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  active?: boolean;
  tintColor?: string;
  fallbackBackground?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

const GLASS_AVAILABLE = isLiquidGlassAvailable();

export function GlassButton({
  onPress,
  onLongPress,
  disabled,
  active,
  tintColor = '#3987e5',
  fallbackBackground = 'rgba(255,255,255,0.08)',
  style,
  children,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, { toValue: 0.88, tension: 400, friction: 8, useNativeDriver: true }).start();
  }

  function pressOut() {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.12, tension: 400, friction: 8, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 300, friction: 10, useNativeDriver: true }),
    ]).start();
  }

  function handlePress(e: GestureResponderEvent) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress?.(e);
  }

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
    >
      <Animated.View style={[{ transform: [{ scale }] }, disabled && styles.disabled]}>
        <GlassView
          style={[
            styles.base,
            !GLASS_AVAILABLE && { backgroundColor: active ? tintColor : fallbackBackground },
            !GLASS_AVAILABLE && active && { borderColor: tintColor },
            style,
          ]}
          glassEffectStyle="regular"
          tintColor={active ? tintColor : undefined}
          isInteractive
          colorScheme="dark"
        >
          {children}
        </GlassView>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  disabled: { opacity: 0.35 },
});
