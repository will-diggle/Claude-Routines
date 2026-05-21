import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

interface Props {
  routeName?: string;
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

export function TopBar({ routeName }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, fontFamily } = useTheme();
  const isBriefing = routeName === 'Briefing';
  const dateStr = new Date().toLocaleDateString('en-GB', DATE_OPTIONS).toUpperCase();

  if (isBriefing) {
    return (
      <View style={[styles.masthead, { paddingTop: insets.top + 10, backgroundColor: colors.bg }]}>
        <View style={[styles.ruleThick, { backgroundColor: colors.inkDark }]} />
        <View style={[styles.ruleThin, { backgroundColor: colors.inkDark }]} />
        <Text style={[styles.mastheadTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
          BILINGUIST BRIEF
        </Text>
        <View style={[styles.ruleThin, { backgroundColor: colors.inkDark }]} />
        <View style={[styles.ruleThick, { backgroundColor: colors.inkDark }]} />
        <Text style={[styles.mastheadDate, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
          {dateStr}
        </Text>
        <View style={[styles.hairline, { backgroundColor: colors.borderMid }]} />
      </View>
    );
  }

  return (
    <View style={[styles.compact, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
      <View style={[styles.compactInner, { borderBottomColor: colors.borderLight }]}>
        <Text style={[styles.compactTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
          Bilinguist Brief
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  masthead: {
    zIndex: 10,
    elevation: 10,
    paddingBottom: 0,
  },
  ruleThick: {
    height: 3,
    marginHorizontal: 16,
  },
  ruleThin: {
    height: 1,
    marginHorizontal: 16,
    marginVertical: 2,
  },
  mastheadTitle: {
    fontSize: 32,
    letterSpacing: 5,
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  mastheadDate: {
    fontSize: 10,
    letterSpacing: 1.5,
    textAlign: 'center',
    paddingVertical: 7,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  compact: {
    zIndex: 10,
    elevation: 10,
  },
  compactInner: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  compactTitle: {
    fontSize: 18,
    letterSpacing: 0.5,
    paddingTop: 6,
  },
});
