import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../hooks/useTheme';

const LABEL = 'DAY STREAK';
const FROZEN_COLOR = '#4A90C4'; // light blue — freeze protected

interface Props {
  streak: number;
  frozen?: boolean;
  onPress?: () => void;
}

export function StreakBadge({ streak, frozen = false, onPress }: Props) {
  const { colors, fontFamily } = useTheme();
  if (streak === 0) return null;

  const active = streak >= 3;
  const textColor = frozen ? FROZEN_COLOR : (active ? colors.inkDark : colors.inkFaint);
  const borderColor = frozen ? FROZEN_COLOR : (active ? colors.inkDark : colors.borderLight);

  const inner = (
    <View style={[styles.container, { borderColor }]}>
      <Text style={[styles.count, { color: textColor, fontFamily: fontFamily.bold }]}>
        {streak}
      </Text>
      <Text style={[styles.label, { color: textColor, fontFamily: fontFamily.regular }]}>
        {LABEL}
      </Text>
    </View>
  );

  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>;
  }
  return inner;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  count: { fontSize: 11, lineHeight: 15 },
  label: { fontSize: 9, lineHeight: 15, letterSpacing: 0.8, textTransform: 'uppercase' },
});
