import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { GlassSurface } from './GlassSurface';

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
  const radius = cornerRadius ?? size / 2;

  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={hitSlop}
      activeOpacity={activeOpacity}
      style={[
        { width: size, height: size, borderRadius: radius, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <GlassSurface cornerRadius={radius} style={{ borderRadius: radius }} />
      {children}
    </TouchableOpacity>
  );
}
