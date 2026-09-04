import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../hooks/useTheme';
import { IPAD_SIDEBAR_W } from './FloatingTabBar';
import type { BackgroundKey } from '../theme';

const LOGOMARK = require('../../assets/logomark.png');
const LOGOTYPE = require('../../assets/logotype.png');

// Compact header lockups (solid-background versions) for Settings & Practice.
const MASTHEADS: Record<BackgroundKey, ReturnType<typeof require>> = {
  cream:    require('../../assets/masthead-compact-cream.png'),
  softGrey: require('../../assets/masthead-compact-navy.png'),
  white:    require('../../assets/masthead-compact-white.png'),
  night:    require('../../assets/masthead-compact-black.png'),
};

// Logomark: 600×297 source → 2.02:1 ratio
const LOGOMARK_W = 68;
const LOGOMARK_H = Math.round(LOGOMARK_W * (297 / 600)); // ≈ 34

interface Props {
  routeName?: string;
  onLogoPress?: () => void;
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

export function TopBar({ routeName, onLogoPress }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { colors, fontFamily, isNight, background } = useTheme();
  const navigation = useNavigation<any>();
  const isBriefing = routeName === 'Briefing';
  const dateStr = new Date().toLocaleDateString('en-GB', DATE_OPTIONS).toUpperCase();
  const imageStyle = isNight ? { opacity: 0.85 } : undefined;
  // iPad: the compact header below is only ever shown inside Settings/Practice
  // content that's already inset by the persistent sidebar's width — size the
  // lockup off the space actually available to it, not the full device width.
  const compactAvailW = winW >= 768 ? winW - IPAD_SIDEBAR_W : winW;

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
            key={`mark-${colors.inkDark}`}
            source={LOGOMARK}
            style={[styles.logomark, imageStyle, { tintColor: colors.inkDark }]}
            resizeMode="contain"
          />
          <View style={styles.logotypeWrap}>
            <Image
              key={`type-${colors.inkDark}`}
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
  // Single Image that swaps source on theme change. The container is a fixed
  // pixel height so the logo's vertical position is identical across all themes.
  const bg = (background as BackgroundKey) in MASTHEADS ? (background as BackgroundKey) : 'cream';
  return (
    <View style={[styles.compact, { paddingTop: insets.top + 4, backgroundColor: colors.bg }]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onLogoPress ?? (() => navigation.navigate('Briefing'))}
        hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
      >
        <Image
          key={bg}
          source={MASTHEADS[bg]}
          style={[styles.compactLockup, { width: compactAvailW - 48, height: Math.round((compactAvailW - 48) / 6.21) }, imageStyle]}
          resizeMode="contain"
        />
      </TouchableOpacity>
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
    alignSelf: 'stretch',
  },
  ruleInner: {
    height: 1,
    alignSelf: 'stretch',
    marginVertical: 1,
  },

  logotypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: 4,
    paddingHorizontal: 6,
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
    alignSelf: 'stretch',
  },

  // ── Compact header ─────────────────────────────────────────────────────────
  compact: {
    zIndex: 10,
    elevation: 10,
    alignItems: 'center',
    paddingBottom: 0,
  },
  // Width/height set inline reactively using winW from useWindowDimensions().
  compactLockup: {
    marginVertical: 6,
  },
  compactRule: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
});
