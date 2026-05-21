import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

const LOGOMARK = require('../../assets/logomark.png');
const LOGOTYPE = require('../../assets/logotype.png');

const SCREEN_WIDTH = Dimensions.get('window').width;

// Logomark: 600×297 source → 2.02:1 ratio
const LOGOMARK_W = 68;
const LOGOMARK_H = Math.round(LOGOMARK_W * (297 / 600)); // ≈ 34

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
  const imageStyle = isNight ? { opacity: 0.85 } : undefined;

  if (isBriefing) {
    return (
      <View style={[styles.masthead, { paddingTop: insets.top + 8, backgroundColor: colors.bg }]}>
        {/* Outer dark rule */}
        <View style={[styles.ruleOuter, { backgroundColor: colors.inkDark }]} />
        {/* Inner grey rule */}
        <View style={[styles.ruleInner, { backgroundColor: colors.borderMid }]} />

        {/* Logomark left + logotype centered */}
        <View style={styles.logotypeRow}>
          <Image
            source={LOGOMARK}
            style={[styles.logomark, imageStyle]}
            resizeMode="contain"
          />
          <View style={styles.logotypeWrap}>
            <Image
              source={LOGOTYPE}
              style={[styles.logotype, imageStyle]}
              resizeMode="contain"
            />
          </View>
          {/* Right spacer matches logomark width so logotype stays centred */}
          <View style={styles.logomarkSpacer} />
        </View>

        {/* Inner grey rule */}
        <View style={[styles.ruleInner, { backgroundColor: colors.borderMid }]} />
        {/* Outer dark rule */}
        <View style={[styles.ruleOuter, { backgroundColor: colors.inkDark }]} />

        {/* Date */}
        <Text style={[styles.mastheadDate, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
          {dateStr}
        </Text>

        <View style={[styles.hairline, { backgroundColor: colors.borderLight }]} />
      </View>
    );
  }

  // Compact header for Settings / Practice
  return (
    <View style={[styles.compact, { paddingTop: insets.top + 4, backgroundColor: colors.bg }]}>
      <Image
        source={LOGOTYPE}
        style={[styles.logotypeCompact, imageStyle]}
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

  ruleOuter: {
    height: 2,
    width: SCREEN_WIDTH,
  },
  ruleInner: {
    height: 1,
    width: SCREEN_WIDTH,
    marginVertical: 1,
  },

  logotypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: SCREEN_WIDTH,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  logomark: {
    width: LOGOMARK_W,
    height: LOGOMARK_H,
  },
  logomarkSpacer: {
    width: LOGOMARK_W,
  },
  logotypeWrap: {
    flex: 1,
    alignItems: 'center',
  },
  logotype: {
    width: '100%',
    height: 48,
  },

  mastheadDate: {
    fontSize: 10,
    letterSpacing: 1.5,
    textAlign: 'center',
    paddingVertical: 7,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    width: SCREEN_WIDTH,
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
