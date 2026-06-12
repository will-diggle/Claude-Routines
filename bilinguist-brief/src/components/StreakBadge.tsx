import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface Props {
  streak: number;
}

export function StreakBadge({ streak }: Props) {
  const { colors, fontFamily } = useTheme();
  if (streak === 0) return null;

  const isWarm = streak >= 3;
  const textColor = isWarm ? colors.inkDark : colors.inkFaint;
  const borderColor = isWarm ? colors.inkDark : colors.borderLight;

  return (
    <View style={[styles.container, { borderColor }]}>
      <Text style={styles.fire}>🔥</Text>
      <Text style={[styles.count, { color: textColor, fontFamily: fontFamily.bold }]}>
        {streak}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  fire: { fontSize: 11, lineHeight: 15 },
  count: { fontSize: 11, lineHeight: 15 },
});
