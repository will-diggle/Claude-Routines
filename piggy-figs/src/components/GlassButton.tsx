import React, { useRef } from 'react';
import {
  Animated, Pressable, StyleSheet, type ViewStyle, type StyleProp, type GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';

// A plain styled button — same shape, spring-press animation, and haptics as
// the design system's GlassButton spec, but without expo-glass-effect's
// native Liquid Glass material. That module's build tooling (a nested
// xcodebuild + hand-assembled xcframework) turned out to be too fragile to
// depend on right now and required a custom dev client instead of Expo Go.
// Dropped so the app builds and runs in plain Expo Go again — see git
// history on this file if reviving native Liquid Glass later.
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
      <Animated.View
        style={[
          styles.base,
          { backgroundColor: active ? tintColor : fallbackBackground },
          active && { borderColor: tintColor },
          { transform: [{ scale }] },
          disabled && styles.disabled,
          style,
        ]}
      >
        {children}
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
