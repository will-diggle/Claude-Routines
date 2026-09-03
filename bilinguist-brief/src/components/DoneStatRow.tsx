import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

// The end-of-game stats box's one row — was defined identically three times
// (StatRow in FlashcardsScreen, DoneStatRow in MultipleChoiceScreen, and a
// third copy hand-written inline in MatchingScreen) with no shared source, so
// Fill in the Blank and Translation had nowhere to reach for it and showed no
// stats box at all.

interface Props {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
  label: string;
  value: number;
}

export function DoneStatRow({ icon, tint, label, value }: Props) {
  const { colors, fontFamily } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
      <Ionicons name={icon} size={24} color={tint} style={styles.icon} />
      <Text style={[styles.label, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  icon: { width: 30 },
  label: { flex: 1, fontSize: 19 },
  value: { fontSize: 19 },
});
