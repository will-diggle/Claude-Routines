import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';

// Label options: 'DAY STREAK' | 'DAYS READ' | 'STREAK' | 'IN A ROW'
const LABEL = 'DAY STREAK';

interface Props {
  streak: number;
}

export function StreakBadge({ streak }: Props) {
  const { colors, fontFamily } = useTheme();
  if (streak === 0) return null;

  const active = streak >= 3;
  const textColor = active ? colors.inkDark : colors.inkFaint;
  const borderColor = active ? colors.inkDark : colors.borderLight;

  return (
    <View style={[styles.container, { borderColor }]}>
      <Text style={[styles.count, { color: textColor, fontFamily: fontFamily.bold }]}>
        {streak}
      </Text>
      <Text style={[styles.label, { color: textColor, fontFamily: fontFamily.regular }]}>
        {LABEL}
      </Text>
    </View>
  );
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
