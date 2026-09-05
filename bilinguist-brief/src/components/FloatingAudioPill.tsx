import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '../hooks/useTheme';
import { useAudioStore } from '../store/useAudioStore';
import { useNavPillStore } from '../store/useNavPillStore';
import { pauseAudio, resumeAudio } from '../services/audioPlayer';
import { BlurView } from 'expo-blur';
import { FLOAT_TAB_H, FLOAT_TAB_H_SMALL, FLOAT_TAB_BOTTOM } from './FloatingTabBar';

// Same hex colors.card the flag/newspaper pills paint their own background
// with (see FloatingTabBar's `pillBg = colors.card`) — converted to rgba so
// this pill can use the literal same color at a chosen translucency instead
// of a separately-invented tint.
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

const PILL_H        = FLOAT_TAB_H_SMALL; // 52px — matches nav pill height
const NUM_BARS      = 4;
const BAR_MAX       = 12;
const GAP_ABOVE_TAB = 12;
const MARQUEE_SPEED = 38;
const FADE_WIDTH    = 24;

const SIDE_NORMAL = 16;

// When docked the pill drops down by exactly FLOAT_TAB_H + GAP_ABOVE_TAB.
// Insets cancel out so this is a compile-time constant — safe on native driver.
const DOCK_OFFSET = FLOAT_TAB_H + GAP_ABOVE_TAB; // 64px

// Horizontal margin added each side when docked — pushes pill to sit between
// the two mini nav pills (each FLOAT_TAB_H_SMALL wide + 8px gap). Was using
// FLOAT_TAB_H (the *open* pill height, 68) instead of FLOAT_TAB_H_SMALL (the
// actual mini/closed pill width, 52) — 16px too much margin per side, making
// the docked pill narrower than it needed to be to just clear the mini pills.
const DOCK_SIDE = FLOAT_TAB_H_SMALL + 8; // 60px each side

// ─── Component ────────────────────────────────────────────────────────────────

export function FloatingAudioPill() {
  const { colors, isDark, fontFamily, fontSize } = useTheme();
  const insets    = useSafeAreaInsets();
  const { isPlaying, isLoading, headline } = useAudioStore();
  const { anyPillOpen, audioPillForcedUp } = useNavPillStore(
    useShallow(s => ({
      anyPillOpen: s.anyPillOpen,
      audioPillForcedUp: s.audioPillForcedUp,
    }))
  );
  const isVisible = isPlaying || isLoading;
  // Docks only once both nav pills are in their narrow mini form — that's
  // the only time there's physical room to slot this pill between them.
  // Same formula FloatingTabBar mirrors for its own isAudioDocked.
  const isDocked  = !anyPillOpen && isVisible && !audioPillForcedUp;

  // ── Entrance / exit spring (native driver) ───────────────────────────────
  const showAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(showAnim, {
      toValue: isVisible ? 1 : 0,
      useNativeDriver: true,
      bounciness: 14,
      speed: 16,
    }).start();
  }, [isVisible]);

  // ── Dock: translateY (native driver) ─────────────────────────────────────
  const dockAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(dockAnim, {
      toValue: isDocked ? DOCK_OFFSET : 0,
      useNativeDriver: true,
      bounciness: 4,
      speed: 12,
    }).start();
  }, [isDocked]);

  // ── Dock: side margins (JS driver) — narrows pill to slot between nav pills
  const sideMarginAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(sideMarginAnim, {
      toValue: isDocked ? DOCK_SIDE : 0,
      useNativeDriver: false,
      bounciness: 4,
      speed: 12,
    }).start();
  }, [isDocked]);

  // ── Waveform bars ────────────────────────────────────────────────────────
  const barAnims = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(0.25)),
  ).current;
  const waveRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isPlaying) {
      const loops = barAnims.map((anim, i) => {
        const dur = 300 + i * 60;
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: 1,    duration: dur, useNativeDriver: false }),
            Animated.timing(anim, { toValue: 0.15, duration: dur, useNativeDriver: false }),
          ]),
        );
      });
      const staggered = Animated.stagger(85, loops);
      staggered.start();
      waveRef.current = staggered;
      return () => {
        staggered.stop();
        barAnims.forEach((a) => a.setValue(0.25));
      };
    } else {
      waveRef.current?.stop();
      waveRef.current = null;
    }
  }, [isPlaying]);

  // ── Marquee ──────────────────────────────────────────────────────────────
  const marqAnim      = useRef(new Animated.Value(0)).current;
  const marqLoopRef   = useRef<Animated.CompositeAnimation | null>(null);
  const textWidthRef  = useRef(0);
  const containerWRef = useRef(0);
  const [animTrigger, setAnimTrigger] = useState(0);

  useEffect(() => {
    marqLoopRef.current?.stop();
    marqLoopRef.current = null;
    marqAnim.setValue(0);
    textWidthRef.current = 0;
  }, [headline]);

  function onContainerLayout(w: number) {
    if (Math.abs(w - containerWRef.current) <= 1) return;
    containerWRef.current = w;
    if (textWidthRef.current > 0) setAnimTrigger((t) => t + 1);
  }
  function onTextLayout(w: number) {
    if (Math.abs(w - textWidthRef.current) <= 1) return;
    textWidthRef.current = w;
    if (containerWRef.current > 0) setAnimTrigger((t) => t + 1);
  }

  useEffect(() => {
    const tw = textWidthRef.current;
    const cw = containerWRef.current;
    if (!isVisible || !headline || tw === 0 || cw === 0 || tw <= cw) return;

    const loop = Animated.loop(
      Animated.timing(marqAnim, {
        toValue:  -tw,
        duration: tw * MARQUEE_SPEED,
        easing:   Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    marqLoopRef.current = loop;
    return () => { loop.stop(); marqLoopRef.current = null; };
  }, [animTrigger, isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Theming ──────────────────────────────────────────────────────────────
  // colors.card — same color the flag/newspaper pills use. A translucent tint
  // over a blur always blends with whatever's behind it, so it drifts off
  // colors.card depending on content (this was reading visibly "creamier"
  // than the flag/newspaper pills when floating over article text). Matched
  // to GlassButton's own backing opacity (0.80) instead — high enough that
  // the actual color reads consistently regardless of what's behind it,
  // same reasoning GlassButton already uses for its own colour reliability.
  const tintBg = hexToRgba(colors.card, isDark ? 0.85 : 0.80);
  // Thin light rim at the same opacity as the fill — the classic glass-edge
  // highlight, not a themed border.
  const borderColorRgba = `rgba(255,255,255,${isDark ? 0.35 : 0.30})`;
  const onPill    = colors.chrome;
  const circleIcon = colors.bg;

  const fadeColors: [string, string] = [
    tintBg.replace(/[\d.]+\)$/, '0)'),
    tintBg,
  ];

  // ── Static position — re-calculates only when insets change ─────────────
  const normalBottom = insets.bottom + FLOAT_TAB_BOTTOM + FLOAT_TAB_H + GAP_ABOVE_TAB;

  async function handlePlayPause() {
    try {
      if (isLoading) return;
      if (isPlaying) { await pauseAudio(); } else { await resumeAudio(); }
    } catch {}
  }

  const marqueeText = headline ? `${headline}   ·   ` : '';

  return (
    // Outermost: static absolute position
    <View
      pointerEvents={isVisible ? 'auto' : 'none'}
      style={[styles.wrapper, { bottom: normalBottom, left: SIDE_NORMAL, right: SIDE_NORMAL }]}
    >
      {/* JS driver: horizontal margin shrinks pill to sit between nav pills */}
      <Animated.View style={{ marginHorizontal: sideMarginAnim }}>

        {/* Native driver: entrance slide/scale + dock translateY */}
        <Animated.View
          style={{
            opacity: showAnim,
            transform: [
              { translateY: showAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
              { scale:      showAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
              { translateY: dockAnim },
            ],
          }}
        >
          {/* Shadow lives on this outer view only — a hovering pill casts a
              shadow below/around it, not onto its own face. Separated from
              the inner overflow:hidden — combining both on one view clips
              the shadow (same reason FloatingTabBar's pillWrapper/pill and
              GlassButton keep the two concerns on separate views). */}
          <View
            style={[
              styles.pillShadow,
              { borderWidth: 1, borderColor: borderColorRgba },
            ]}
          >
            <View style={styles.pillClip}>
              {/* Stronger blur across the whole pill — only the thin rim ring
                  (not covered by the inset layer below) actually shows it,
                  giving the edge a more intense "magnified" look than the
                  center, the way a real convex lens bends light more at its
                  edges than through its middle. */}
              <BlurView
                style={StyleSheet.absoluteFill}
                intensity={52}
                tint={isDark ? 'dark' : 'light'}
              />
              <View style={styles.pillRim}>
                <BlurView
                  style={StyleSheet.absoluteFill}
                  intensity={40}
                  tint={isDark ? 'dark' : 'light'}
                />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: tintBg }]} pointerEvents="none" />

                <View style={styles.pillContent}>
              {/* ── Waveform (LEFT) ── */}
            <View style={styles.waveform}>
              {barAnims.map((anim, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.bar,
                    {
                      backgroundColor: onPill,
                      height:  anim.interpolate({ inputRange: [0, 1], outputRange: [3, BAR_MAX] }),
                      opacity: isPlaying ? 0.9 : 0.4,
                    },
                  ]}
                />
              ))}
            </View>

            {/* ── Marquee title (MIDDLE) ── */}
            <View
              style={styles.marqueeContainer}
              onLayout={e => onContainerLayout(e.nativeEvent.layout.width)}
            >
              <Animated.View
                style={[styles.marqueeTrack, { transform: [{ translateX: marqAnim }] }]}
              >
                <Text
                  style={[styles.marqueeText, { color: onPill, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}
                  onLayout={e => onTextLayout(e.nativeEvent.layout.width)}
                >
                  {marqueeText}
                </Text>
                <Text
                  style={[styles.marqueeText, { color: onPill, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}
                >
                  {marqueeText}
                </Text>
              </Animated.View>

              {/* Right-edge fade */}
              <LinearGradient
                colors={fadeColors}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.fadeEdge}
                pointerEvents="none"
              />
            </View>

            {/* ── Play / Pause (RIGHT) ── */}
            <TouchableOpacity
              onPress={handlePlayPause}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={[styles.playCircle, { backgroundColor: onPill }]}>
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={12}
                  color={circleIcon}
                  style={!isPlaying ? { marginLeft: 1 } : undefined}
                />
              </View>
            </TouchableOpacity>
              </View>
              </View>
            </View>
          </View>
        </Animated.View>

      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
  },

  // Shadow only — no overflow:hidden here so the shadow isn't clipped.
  // Matches FloatingTabBar's own pillShadow exactly (same offset/opacity/
  // radius/elevation) so this pill's shadow reads the same as the flag and
  // newspaper pills either side of it.
  pillShadow: {
    width: '100%',
    height: PILL_H,
    borderRadius: PILL_H / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  // Clips the blur + tint to the pill shape.
  pillClip: {
    flex: 1,
    borderRadius: PILL_H / 2,
    overflow: 'hidden',
  },
  // Inset from pillClip's edge — leaves a thin ring around the border where
  // only the stronger outer blur shows through, uncovered by this layer.
  pillRim: {
    position: 'absolute',
    top: 3, bottom: 3, left: 3, right: 3,
    borderRadius: PILL_H / 2 - 3,
    overflow: 'hidden',
  },
  // Row layout for the pill's own content, on top of the blur + tint.
  pillContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 12,
    gap: 6,
  },
  waveform: {
    width: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: BAR_MAX,
    flexShrink: 0,
  },

  bar: {
    width: 3,
    borderRadius: 2,
  },

  marqueeContainer: {
    flex: 1,
    overflow: 'hidden',
    height: PILL_H,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },

  marqueeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    minWidth: 3000,
  },

  // fontFamily and fontSize set inline (fontFamily.regular / fontSize.body —
  // the same reading-font + size the article body uses, from useTheme()).
  // fontSize.body tracks the user's Preferences > Display font-size setting
  // (small/medium/large/extraLarge), so this pill's text scales with it too.
  marqueeText: {
    letterSpacing: 0.2,
    flexShrink: 0,
  },

  fadeEdge: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: FADE_WIDTH,
  },

  playCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
