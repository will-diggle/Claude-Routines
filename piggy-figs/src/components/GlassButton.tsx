import React from 'react';
import { TouchableOpacity, StyleSheet, type ViewStyle, type StyleProp, type GestureResponderEvent } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

// iOS 26's native Liquid Glass, via expo-glass-effect's GlassView. On
// anything that isn't iOS 26 (older iOS, Android, simulator without the
// glass API), GlassView quietly renders as a plain <View> with none of its
// props applied — so `fallbackBackground` below keeps buttons legible
// instead of turning invisible/transparent-on-black in that case.
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
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} disabled={disabled} activeOpacity={0.75}>
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});
