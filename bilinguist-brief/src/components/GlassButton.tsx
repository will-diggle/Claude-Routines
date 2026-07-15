import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface Props {
  onPress: () => void;
  children: React.ReactNode;
  size?: number;
  style?: ViewStyle;
  hitSlop?: { top: number; bottom: number; left: number; right: number };
  activeOpacity?: number;
  cornerRadius?: number;
}

export function GlassButton({
  onPress,
  children,
  size = 40,
  style,
  hitSlop = { top: 8, bottom: 8, left: 8, right: 8 },
  activeOpacity = 0.7,
  cornerRadius,
}: Props) {
  const { colors } = useTheme();
  const radius = cornerRadius ?? size / 2;

  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={hitSlop}
      activeOpacity={activeOpacity}
      delayPressIn={0}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.borderLight,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.08,
          shadowRadius: 3,
        },
        style,
      ]}
    >
      {children}
    </TouchableOpacity>
  );
}
