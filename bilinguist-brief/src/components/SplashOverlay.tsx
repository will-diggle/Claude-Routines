// SplashOverlay — first-launch branded splash.
// Animation sequence ported from ui_kits/mobile_app/SplashScreen.html.
// Always renders in cream mode. Uses logomark.png as crest placeholder;
// swap in splash-crest-cream.png when that asset is available.

import React, { useEffect, useRef } from 'react';
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

// ── Assets ───────────────────────────────────────────────────────────────────
// TODO: replace with require('../../assets/splash-crest-cream.png') once available
const CREST    = require('../../assets/logomark.png');
const LOGOTYPE = require('../../assets/logotype.png');

// ── Constants ─────────────────────────────────────────────────────────────────
const { width: SW } = Dimensions.get('window');
const LAUNCHED_KEY  = 'bilinguist_has_launched';

// Cream mode brand pairing: cream bg → navy ink
const BG       = '#F5F0E8';
const INK      = '#162032';
const HAIRLINE = 'rgba(22,32,50,0.32)';

// Distance from top/bottom edge to the outer rule (px)
const RULE_EDGE = 76;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  onDone: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SplashOverlay({ onDone }: Props) {
  // Crest — scale(0.30→1) + opacity(0→1), 1.40 s spring, delay 0.10 s
  const crestOpacity   = useRef(new Animated.Value(0)).current;
  const crestScale     = useRef(new Animated.Value(0.30)).current;

  // Tagline — translateY(20→0) + opacity(0→1), 0.80 s spring, delay 1.20 s
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTransY  = useRef(new Animated.Value(20)).current;

  // Edition line — opacity(0→0.6), 0.60 s ease-out, delay 1.60 s
  const editionOpacity = useRef(new Animated.Value(0)).current;

  // Rules — scaleX(0→1), 0.75 s ease-out
  const topOuterScaleX = useRef(new Animated.Value(0)).current; // delay 0.40 s
  const topInnerScaleX = useRef(new Animated.Value(0)).current; // delay 0.55 s
  const botOuterScaleX = useRef(new Animated.Value(0)).current; // delay 0.50 s
  const botInnerScaleX = useRef(new Animated.Value(0)).current; // delay 0.65 s

  // Dive — scale(1→16) + opacity(1→0), 1.20 s dive-curve, delay 2.10 s
  const diveScale   = useRef(new Animated.Value(1)).current;
  const diveOpacity = useRef(new Animated.Value(1)).current;

  // Reveal — opacity(0→1), 0.55 s ease-out, delay 3.10 s
  const revealOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spring = Easing.bezier(0.16, 0.84, 0.24, 1.0);
    const dive   = Easing.bezier(0.55, 0, 0.85, 0.4);
    const eOut   = Easing.out(Easing.quad);

    // Shorthand for Animated.timing
    const anim = (
      v: Animated.Value,
      to: number,
      dur: number,
      delay: number,
      easing: (t: number) => number,
    ) => Animated.timing(v, { toValue: to, duration: dur, delay, easing, useNativeDriver: true });

    Animated.parallel([
      // ── Rules drawing in ──────────────────────────────────────────
      anim(topOuterScaleX, 1, 750,  400, eOut),
      anim(topInnerScaleX, 1, 750,  550, eOut),
      anim(botOuterScaleX, 1, 750,  500, eOut),
      anim(botInnerScaleX, 1, 750,  650, eOut),

      // ── Crest zooms in ────────────────────────────────────────────
      anim(crestOpacity,   1,    1400, 100, spring),
      anim(crestScale,     1,    1400, 100, spring),

      // ── Tagline floats up ─────────────────────────────────────────
      anim(taglineOpacity, 1,    800, 1200, spring),
      anim(taglineTransY,  0,    800, 1200, spring),

      // ── Edition line ──────────────────────────────────────────────
      anim(editionOpacity, 0.6,  600, 1600, eOut),

      // ── Splash dives away ─────────────────────────────────────────
      anim(diveScale,      16,  1200, 2100, dive),
      anim(diveOpacity,    0,   1200, 2100, dive),

      // ── Brief masthead reveals ────────────────────────────────────
      anim(revealOpacity,  1,    550, 3100, eOut),
    ]).start(() => onDone());
  // onDone is stable (passed from App.tsx state setter); ref guards not needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // overflow:hidden clips the 16× scaled splash to screen bounds
    <View style={styles.stage}>

      {/* ── Reveal layer ── Brief masthead, fades in after the dive ── */}
      <Animated.View style={[styles.revealLayer, { opacity: revealOpacity }]}>
        <RevealMasthead />
      </Animated.View>

      {/* ── Splash cover ── dives away ─────────────────────────────── */}
      <Animated.View
        style={[
          styles.splash,
          { transform: [{ scale: diveScale }], opacity: diveOpacity },
        ]}
      >
        {/* Top outer rule */}
        <Animated.View
          style={[
            styles.ruleOuter,
            styles.ruleTopOuter,
            { transform: [{ scaleX: topOuterScaleX }] },
          ]}
        />
        {/* Top inner rule */}
        <Animated.View
          style={[
            styles.ruleInner,
            styles.ruleTopInner,
            { transform: [{ scaleX: topInnerScaleX }] },
          ]}
        />

        {/* Crest — slow zoom in */}
        <Animated.View
          style={[
            styles.crestWrap,
            { opacity: crestOpacity, transform: [{ scale: crestScale }] },
          ]}
        >
          <Image source={CREST} style={styles.crest} resizeMode="contain" />
        </Animated.View>

        {/* Tagline — floats up */}
        <Animated.Text
          style={[
            styles.tagline,
            { opacity: taglineOpacity, transform: [{ translateY: taglineTransY }] },
          ]}
        >
          Your bilingual morning brief
        </Animated.Text>

        {/* Edition line — absolute, near bottom rule */}
        <Animated.Text style={[styles.edition, { opacity: editionOpacity }]}>
          First Edition · Spring 2026
        </Animated.Text>

        {/* Bottom inner rule */}
        <Animated.View
          style={[
            styles.ruleInner,
            styles.ruleBotInner,
            { transform: [{ scaleX: botInnerScaleX }] },
          ]}
        />
        {/* Bottom outer rule */}
        <Animated.View
          style={[
            styles.ruleOuter,
            styles.ruleBotOuter,
            { transform: [{ scaleX: botOuterScaleX }] },
          ]}
        />
      </Animated.View>
    </View>
  );
}

// ── RevealMasthead ─────────────────────────────────────────────────────────────
// Static preview of the brief masthead shown after the splash dives away.
// Replaced by the live BriefingScreen once onDone fires and the overlay unmounts.

function RevealMasthead() {
  const d       = new Date();
  const datePart = d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={rm.wrap}>
      <Text style={rm.cities}>London · Paris</Text>
      <View style={rm.ruleOuter} />
      <View style={rm.ruleHairline} />
      <View style={rm.lockupPad}>
        <Image source={LOGOTYPE} style={rm.lockup} resizeMode="contain" />
      </View>
      <View style={rm.metaRow}>
        <Text style={rm.date}>Published: {datePart} · {timePart}</Text>
        <Text style={rm.vol}>Vol. II</Text>
      </View>
      <View style={rm.ruleHairline} />
      <View style={rm.ruleOuter} />
      <Text style={rm.tagline}>Your bilingual morning brief</Text>
    </View>
  );
}

// ── shouldShowSplash ───────────────────────────────────────────────────────────

export async function shouldShowSplash(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(LAUNCHED_KEY);
    if (!val) {
      await AsyncStorage.setItem(LAUNCHED_KEY, '1');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  stage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    zIndex: 999,
    overflow: 'hidden',
  },

  revealLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    paddingTop: RULE_EDGE - 16,
    paddingHorizontal: 16,
  },

  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },

  // Rules — absolute, span full width, animate scaleX from center
  ruleOuter:    { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: INK },
  ruleInner:    { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: HAIRLINE },
  ruleTopOuter: { top: RULE_EDGE },
  ruleTopInner: { top: RULE_EDGE + 5 },   // 2px outer + 2px gap + 1px inner
  ruleBotOuter: { bottom: RULE_EDGE },
  ruleBotInner: { bottom: RULE_EDGE + 5 },

  // Crest
  crestWrap: { width: SW * 0.55, maxWidth: 260, aspectRatio: 1 },
  crest:     { width: '100%', height: '100%' },

  // Tagline
  tagline: {
    marginTop: 28,
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 18,
    letterSpacing: 0.18,
    textAlign: 'center',
    color: INK,
  },

  // Edition line — sits just above the bottom inner rule
  edition: {
    position: 'absolute',
    bottom: RULE_EDGE + 22,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: 'PTSerif_400Regular',
    fontSize: 10,
    letterSpacing: 2.8,
    textTransform: 'uppercase',
    color: INK,
  },
});

// RevealMasthead styles
const rm = StyleSheet.create({
  wrap:      {},
  cities: {
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: INK,
    fontFamily: 'PTSerif_400Regular',
    paddingTop: 4,
    marginBottom: 4,
  },
  ruleOuter:    { height: 2, backgroundColor: INK },
  ruleHairline: { height: 1, backgroundColor: HAIRLINE, marginVertical: 2 },
  lockupPad:    { paddingTop: 5 },
  lockup:       { width: '100%', height: 52, tintColor: INK },
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
    fontFamily: 'PTSerif_400Regular_Italic',
    fontStyle: 'italic',
    fontSize: 10,
    color: INK,
    opacity: 0.6,
  },
  vol: {
    fontFamily: 'PTSerif_400Regular',
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: INK,
  },
  tagline: {
    textAlign: 'center',
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 14,
    color: INK,
    paddingTop: 8,
    paddingBottom: 6,
  },
});
