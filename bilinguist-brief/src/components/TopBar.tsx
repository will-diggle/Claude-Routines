import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

const LOGOMARK = require('../../assets/logomark.png');
const LOGOTYPE = require('../../assets/logotype.png');

const SCREEN_WIDTH = Dimensions.get('window').width;

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
  const { colors, fontFamily, isNight } = useTheme();
  const isBriefing = routeName === 'Briefing';
  const dateStr = new Date().toLocaleDateString('en-GB', DATE_OPTIONS).toUpperCase();

  // Black images need inverting to show on dark background
  const tintColor = isNight ? (colors.inkDark as string) : '#1A1A1A';

  if (isBriefing) {
    return (
      <View style={[styles.masthead, { paddingTop: insets.top + 8, backgroundColor: colors.bg }]}>
        {/* Coat of arms logomark */}
        <Image
          source={LOGOMARK}
          style={[styles.logomarkLarge, { tintColor }]}
          resizeMode="contain"
        />

        {/* Double rule + logotype */}
        <View style={[styles.ruleThick, { backgroundColor: colors.inkDark }]} />
        <View style={[styles.ruleThin, { backgroundColor: colors.inkDark }]} />

        <Image
          source={LOGOTYPE}
          style={[styles.logotypeLarge, { tintColor }]}
          resizeMode="contain"
        />

        <View style={[styles.ruleThin, { backgroundColor: colors.inkDark }]} />
        <View style={[styles.ruleThick, { backgroundColor: colors.inkDark }]} />

        {/* Date */}
        <Text style={[styles.mastheadDate, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
          {dateStr}
        </Text>

        <View style={[styles.hairline, { backgroundColor: colors.borderMid }]} />
      </View>
    );
  }

  // Compact header for Settings / Practice
  return (
    <View style={[styles.compact, { paddingTop: insets.top + 4, backgroundColor: colors.bg }]}>
      <Image
        source={LOGOTYPE}
        style={[styles.logotypeCompact, { tintColor }]}
        resizeMode="contain"
      />
      <View style={[styles.compactRule, { backgroundColor: colors.borderLight }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Briefing masthead ──────────────────────────────────────────────────────
  masthead: {
    zIndex: 10,
    elevation: 10,
    alignItems: 'center',
    paddingBottom: 0,
  },
  logomarkLarge: {
    width: 100,
    height: 100,
    marginBottom: 6,
  },
  ruleThick: {
    height: 3,
    width: SCREEN_WIDTH - 32,
  },
  ruleThin: {
    height: 1,
    width: SCREEN_WIDTH - 32,
    marginVertical: 2,
  },
  logotypeLarge: {
    width: SCREEN_WIDTH - 48,
    height: 52,
    marginVertical: 4,
  },
  mastheadDate: {
    fontSize: 10,
    letterSpacing: 1.5,
    textAlign: 'center',
    paddingVertical: 7,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    width: SCREEN_WIDTH - 32,
  },

  // ── Compact header ─────────────────────────────────────────────────────────
  compact: {
    zIndex: 10,
    elevation: 10,
    alignItems: 'center',
    paddingBottom: 0,
  },
  logotypeCompact: {
    width: SCREEN_WIDTH - 80,
    height: 28,
    marginVertical: 6,
  },
  compactRule: {
    height: StyleSheet.hairlineWidth,
    width: SCREEN_WIDTH,
  },
});
