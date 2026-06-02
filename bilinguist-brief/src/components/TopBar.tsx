import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import type { BackgroundKey } from '../theme';

const LOGOMARK = require('../../assets/logomark.png');
const LOGOTYPE = require('../../assets/logotype.png');

// Per-theme masthead lockups — logomark + logotype composed in the right ink
// for each background. Used in the compact header so Settings & Practice
// always show the correct colour variant.
const MASTHEADS: Record<BackgroundKey, ReturnType<typeof require>> = {
  cream:    require('../../assets/masthead-cream.png'),
  softGrey: require('../../assets/masthead-navy.png'),
  white:    require('../../assets/masthead-white.png'),
  night:    require('../../assets/masthead-black.png'),
};

const SCREEN_WIDTH = Dimensions.get('window').width;

// Logomark: 600×297 source → 2.02:1 ratio
const LOGOMARK_W = 68;
const LOGOMARK_H = Math.round(LOGOMARK_W * (297 / 600)); // ≈ 34

// Compact logomark — smaller for the Settings / Practice header
const COMPACT_MARK_W = 44;
const COMPACT_MARK_H = Math.round(COMPACT_MARK_W * (297 / 600)); // ≈ 22

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
  const { colors, fontFamily, isNight, background } = useTheme();
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

        {/* Logomark left + logotype centred */}
        <View style={styles.logotypeRow}>
          <Image
            source={LOGOMARK}
            style={[styles.logomark, imageStyle, { tintColor: colors.inkDark }]}
            resizeMode="contain"
          />
          <View style={styles.logotypeWrap}>
            <Image
              source={LOGOTYPE}
              style={[styles.logotype, imageStyle, { tintColor: colors.inkDark }]}
              resizeMode="contain"
            />
          </View>
          {/* Right spacer mirrors logomark width so logotype stays centred */}
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

  // ── Compact header — Settings / Practice ────────────────────────────────────
  // All four masthead variants are rendered stacked and pre-decoded on first
  // mount. Switching theme just flips opacity (instant — no decode latency).
  const bg = (background as BackgroundKey) in MASTHEADS ? (background as BackgroundKey) : 'cream';
  return (
    <View style={[styles.compact, { paddingTop: insets.top + 4, backgroundColor: colors.bg }]}>
      <View style={styles.compactRow}>
        {(Object.keys(MASTHEADS) as BackgroundKey[]).map((key, i) => (
          <Image
            key={key}
            source={MASTHEADS[key]}
            style={[
              styles.compactLockup,
              imageStyle,
              i > 0 && styles.compactLockupAbsolute,
              { opacity: key === bg ? 1 : 0 },
            ]}
            resizeMode="contain"
          />
        ))}
      </View>
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
    paddingBottom: 0,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: SCREEN_WIDTH,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  compactMark: {
    width: COMPACT_MARK_W,
    height: COMPACT_MARK_H,
  },
  compactLockupWrap: {
    flex: 1,
    alignItems: 'center',
  },
  compactLockup: {
    width: '100%',
    height: 32,
  },
  // Layers 2–4 stack absolutely on top of layer 1 (which sets the row height)
  compactLockupAbsolute: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
  },
  compactRule: {
    height: StyleSheet.hairlineWidth,
    width: SCREEN_WIDTH,
  },
});
