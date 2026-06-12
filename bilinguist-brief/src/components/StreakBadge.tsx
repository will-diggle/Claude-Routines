import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

interface Props {
  streak: number;
}

export function StreakBadge({ streak }: Props) {
  const { colors, fontFamily } = useTheme();
  if (streak === 0) return null;

  const isGold = streak >= 7;
  const tint = isGold ? colors.accentGold : colors.inkFaint;

  return (
    <View style={[styles.container, { borderColor: isGold ? colors.accentGold : colors.borderLight }]}>
      <Ionicons name="newspaper-outline" size={11} color={tint} />
      <Text style={[styles.count, { color: tint, fontFamily: fontFamily.bold }]}>
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
  count: { fontSize: 11, lineHeight: 15 },
});
