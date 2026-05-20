import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';

interface Props {
  title: string;
  current: number;
  total: number;
}

export function GameHeader({ title, current, total }: Props) {
  const navigation = useNavigation();
  const { colors, fontFamily } = useTheme();
  const insets = useSafeAreaInsets();

  const progress = total > 0 ? current / total : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 4, backgroundColor: colors.bg }]}>
      <View style={styles.row}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.inkMid} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
          {title}
        </Text>

        <Text style={[styles.counter, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
          {current}/{total}
        </Text>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.borderLight }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.accentGold }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0DDD5',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: 12,
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
  },
  counter: {
    fontSize: 13,
    width: 40,
    textAlign: 'right',
  },
  progressTrack: {
    height: 3,
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
});
