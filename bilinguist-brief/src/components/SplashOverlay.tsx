// SplashOverlay — branded splash shown on every cold start.
// Animation sequence ported from ui_kits/mobile_app/SplashScreen.html.
// Reads the user's current background setting so the crest and colours
// match the theme they chose last session.
//
// ASSET TODO — drop these four files into bilinguist-brief/assets/ and
// uncomment the CRESTS map below to switch from tinted logomark to the
// pre-composed PNGs:
//   splash-crest-cream.png   (navy crest on cream)
//   splash-crest-navy.png    (cream crest on navy)
//   splash-crest-white.png   (dark crest on white)
//   splash-crest-black.png   (white crest on black / night)

import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore } from '../store/useSettingsStore';
import type { BackgroundKey } from '../theme';

// ── Assets ───────────────────────────────────────────────────────────────────

// Pre-composed splash crests — one per background mode
const CRESTS: Record<BackgroundKey, ReturnType<typeof require>> = {
  cream:    require('../../assets/splash-crest-cream.png'),
  softGrey: require('../../assets/splash-crest-navy.png'),
  white:    require('../../assets/splash-crest-white.png'),
  night:    require('../../assets/splash-crest-black.png'),
};

// Pre-composed masthead lockups — one per background mode
const MASTHEADS: Record<BackgroundKey, ReturnType<typeof require>> = {
  cream:    require('../../assets/masthead-cream.png'),
  softGrey: require('../../assets/masthead-navy.png'),
  white:    require('../../assets/masthead-white.png'),
  night:    require('../../assets/masthead-black.png'),
};

// ── Theme map ─────────────────────────────────────────────────────────────────
// Brand pairing rule: cream↔navy, white↔inkDark, night↔cream
// Each tuple is [background hex, chrome/ink hex, hairline rgba]

const THEME_MAP: Record<BackgroundKey, { bg: string; ink: string; hair: string }> = {
  cream:    { bg: '#F5F0E8', ink: '#162032', hair: 'rgba(22,32,50,0.32)' },
  softGrey: { bg: '#162032', ink: '#F5F0E8', hair: 'rgba(245,240,232,0.40)' },
  white:    { bg: '#FFFFFF', ink: '#1A1A1A', hair: 'rgba(26,26,26,0.30)' },
  night:    { bg: '#141414', ink: '#F5F0E8', hair: 'rgba(245,240,232,0.40)' },
};

// ── Constants ─────────────────────────────────────────────────────────────────
const { width: SW } = Dimensions.get('window');
const LAUNCHED_KEY  = 'bilinguist_has_launched';

// Distance from top/bottom edge to the outer rule (px)
const RULE_EDGE = 76;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  onDone: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SplashOverlay({ onDone }: Props) {
  const { background } = useSettingsStore();
  const t = THEME_MAP[background as BackgroundKey] ?? THEME_MAP.cream;

  // ── Animated values ───────────────────────────────────────────────────────
  // Crest — scale(0.30→1) + opacity(0→1), 1.40 s spring
  const crestOpacity   = useRef(new Animated.Value(0)).current;
  const crestScale     = useRef(new Animated.Value(0.30)).current;

  // Tagline — translateY(20→0) + opacity(0→1), 0.80 s spring, delay 1.20 s
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTransY  = useRef(new Animated.Value(20)).current;

  // Edition line — opacity(0→0.6), 0.60 s ease-out, delay 1.60 s
  const editionOpacity = useRef(new Animated.Value(0)).current;

  // Rules — scaleX(0→1), 0.75 s ease-out, staggered delays
  const topOuterScaleX = useRef(new Animated.Value(0)).current;
  const topInnerScaleX = useRef(new Animated.Value(0)).current;
  const botOuterScaleX = useRef(new Animated.Value(0)).current;
  const botInnerScaleX = useRef(new Animated.Value(0)).current;

  // Dive — scale(1→16) + opacity(1→0), 1.20 s, delay 2.10 s
  const diveScale   = useRef(new Animated.Value(1)).current;
  const diveOpacity = useRef(new Animated.Value(1)).current;

  // Reveal — opacity(0→1), 0.55 s ease-out, delay 3.10 s
  const revealOpacity = useRef(new Animated.Value(0)).current;

  // Track whether the crest image has decoded — the PNG files are large
  // (5–9 MB) and may take a moment to decode on device. The crest animation
  // starts only after the image signals it is ready via onLoadEnd.
  const crestReadyRef = useRef(false);
  const mainAnimDoneRef = useRef(false);

  const startCrestAnim = useCallback(() => {
    if (!crestReadyRef.current) return;
    const spring = Easing.bezier(0.16, 0.84, 0.24, 1.0);
    const anim = (v: Animated.Value, to: number, dur: number, delay: number) =>
      Animated.timing(v, { toValue: to, duration: dur, delay, easing: spring, useNativeDriver: true });
    Animated.parallel([
      anim(crestOpacity, 1, 1400, 0),
      anim(crestScale,   1, 1400, 0),
    ]).start();
  }, [crestOpacity, crestScale]);

  useEffect(() => {
    const spring = Easing.bezier(0.16, 0.84, 0.24, 1.0);
    const dive   = Easing.bezier(0.55, 0, 0.85, 0.4);
    const eOut   = Easing.out(Easing.quad);

    const anim = (
      v: Animated.Value,
      to: number,
      dur: number,
      delay: number,
      easing: (n: number) => number,
    ) => Animated.timing(v, { toValue: to, duration: dur, delay, easing, useNativeDriver: true });

    // Rules, tagline, edition, dive, and reveal run immediately.
    // Crest is triggered separately via startCrestAnim once the image loads.
    Animated.parallel([
      // Rules draw in
      anim(topOuterScaleX, 1,  750,  400, eOut),
      anim(topInnerScaleX, 1,  750,  550, eOut),
      anim(botOuterScaleX, 1,  750,  500, eOut),
      anim(botInnerScaleX, 1,  750,  650, eOut),
      // Tagline floats up
      anim(taglineOpacity, 1,  800, 1200, spring),
      anim(taglineTransY,  0,  800, 1200, spring),
      // Edition line
      anim(editionOpacity, 0.6, 600, 1600, eOut),
      // Splash dives
      anim(diveScale,      16, 1200, 2100, dive),
      anim(diveOpacity,    0,  1200, 2100, dive),
      // Brief masthead reveals
      anim(revealOpacity,  1,   550, 3100, eOut),
    ]).start(() => onDone());

    // Fallback: if image hasn't loaded within 300 ms, start the crest
    // animation anyway so it doesn't silently skip on slow decoders.
    const fallback = setTimeout(() => {
      crestReadyRef.current = true;
      startCrestAnim();
    }, 300);

    return () => clearTimeout(fallback);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // overflow:hidden clips the 16× scaled splash to screen bounds
    <View style={[styles.stage, { backgroundColor: t.bg }]}>

      {/* ── Reveal layer — masthead preview, fades in after the dive ── */}
      <Animated.View style={[styles.revealLayer, { opacity: revealOpacity, backgroundColor: t.bg }]}>
        <RevealMasthead t={t} background={background} />
      </Animated.View>

      {/* ── Splash cover — dives away ─────────────────────────────── */}
      <Animated.View
        style={[
          styles.splash,
          { backgroundColor: t.bg, transform: [{ scale: diveScale }], opacity: diveOpacity },
        ]}
      >
        {/* Top outer rule */}
        <Animated.View
          style={[styles.ruleOuter, styles.ruleTopOuter, { backgroundColor: t.ink, transform: [{ scaleX: topOuterScaleX }] }]}
        />
        {/* Top inner rule */}
        <Animated.View
          style={[styles.ruleInner, styles.ruleTopInner, { backgroundColor: t.hair, transform: [{ scaleX: topInnerScaleX }] }]}
        />

        {/* Crest — zooms in once the PNG has decoded (onLoadEnd) */}
        <Animated.View
          style={[styles.crestWrap, { opacity: crestOpacity, transform: [{ scale: crestScale }] }]}
        >
          <Image
            source={CRESTS[background as BackgroundKey] ?? CRESTS.cream}
            style={styles.crest}
            resizeMode="contain"
            onLoadEnd={() => {
              crestReadyRef.current = true;
              startCrestAnim();
            }}
          />
        </Animated.View>

        {/* Tagline — floats up */}
        <Animated.Text
          style={[styles.tagline, { color: t.ink, opacity: taglineOpacity, transform: [{ translateY: taglineTransY }] }]}
        >
          Your bilingual morning brief
        </Animated.Text>

        {/* Edition line — near bottom rule */}
        <Animated.Text style={[styles.edition, { color: t.ink, opacity: editionOpacity }]}>
          First Edition · Spring 2026
        </Animated.Text>

        {/* Bottom inner rule */}
        <Animated.View
          style={[styles.ruleInner, styles.ruleBotInner, { backgroundColor: t.hair, transform: [{ scaleX: botInnerScaleX }] }]}
        />
        {/* Bottom outer rule */}
        <Animated.View
          style={[styles.ruleOuter, styles.ruleBotOuter, { backgroundColor: t.ink, transform: [{ scaleX: botOuterScaleX }] }]}
        />
      </Animated.View>
    </View>
  );
}

// ── RevealMasthead ─────────────────────────────────────────────────────────────

interface RevealProps { t: { bg: string; ink: string; hair: string }; background: string }

function RevealMasthead({ t, background }: RevealProps) {
  const d       = new Date();
  const datePart = d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View>
      <Text style={[rm.cities, { color: t.ink }]}>London · Paris</Text>
      <View style={[rm.ruleOuter, { backgroundColor: t.ink }]} />
      <View style={[rm.ruleHairline, { backgroundColor: t.hair }]} />
      <View style={rm.lockupPad}>
        <Image
          source={MASTHEADS[background as BackgroundKey] ?? MASTHEADS.cream}
          style={rm.lockup}
          resizeMode="contain"
        />
      </View>
      <View style={rm.metaRow}>
        <Text style={[rm.date, { color: t.ink }]}>Published: {datePart} · {timePart}</Text>
        <Text style={[rm.vol, { color: t.ink }]}>Vol. II</Text>
      </View>
      <View style={[rm.ruleHairline, { backgroundColor: t.hair }]} />
      <View style={[rm.ruleOuter, { backgroundColor: t.ink }]} />
      <Text style={[rm.taglineText, { color: t.ink }]}>Your bilingual morning brief</Text>
    </View>
  );
}

// ── shouldShowSplash ───────────────────────────────────────────────────────────
// Shows on every cold start. The AsyncStorage key is kept so we can gate
// behaviour on first-vs-returning launch in future (e.g. skip onboarding).

export async function shouldShowSplash(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(LAUNCHED_KEY);
    if (!val) await AsyncStorage.setItem(LAUNCHED_KEY, '1');
    // Always show — theme-aware splash runs on every launch
    return true;
  } catch {
    return true;
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  stage: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    overflow: 'hidden',
  },
  revealLayer: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: RULE_EDGE - 16,
    paddingHorizontal: 16,
  },
  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Rules — absolute, full width, animate scaleX from centre
  ruleOuter:    { position: 'absolute', left: 0, right: 0, height: 2 },
  ruleInner:    { position: 'absolute', left: 0, right: 0, height: 1 },
  ruleTopOuter: { top: RULE_EDGE },
  ruleTopInner: { top: RULE_EDGE + 5 },    // 2px rule + 2px gap + 1px inner
  ruleBotOuter: { bottom: RULE_EDGE },
  ruleBotInner: { bottom: RULE_EDGE + 5 },

  // Crest
  crestWrap: { width: SW * 0.62, maxWidth: 280, aspectRatio: 1 },
  crest:     { width: '100%', height: '100%' },

  // Tagline
  tagline: {
    marginTop: 28,
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 18,
    letterSpacing: 0.18,
    textAlign: 'center',
  },

  // Edition line — absolute above the bottom inner rule
  edition: {
    position: 'absolute',
    bottom: RULE_EDGE + 22,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: 'EBGaramond_400Regular',
    fontSize: 10,
    letterSpacing: 2.8,
    textTransform: 'uppercase',
  },
});

const rm = StyleSheet.create({
  cities: {
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    fontFamily: 'EBGaramond_400Regular',
    paddingTop: 4,
    marginBottom: 4,
  },
  ruleOuter:    { height: 2 },
  ruleHairline: { height: 1, marginVertical: 2 },
  lockupPad:    { paddingTop: 5 },
  lockup:       { width: '100%', height: 52 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingTop: 2,
    paddingBottom: 6,
  },
  date: {
    flex: 1,
    fontFamily: 'EBGaramond_400Regular_Italic',
    fontStyle: 'italic',
    fontSize: 10,
    opacity: 0.6,
  },
  vol: {
    fontFamily: 'EBGaramond_400Regular',
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  taglineText: {
    textAlign: 'center',
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 14,
    paddingTop: 8,
    paddingBottom: 6,
  },
});
