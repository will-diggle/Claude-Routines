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
import { pauseAudio, resumeAudio, LANG_LOCALE } from '../services/audioPlayer';
import { FLOAT_TAB_H, FLOAT_TAB_H_SMALL, FLOAT_TAB_BOTTOM } from './FloatingTabBar';
import { BlurView } from 'expo-blur';
// Deliberately BlurView-only, not the native LiquidGlassView used elsewhere
// (GlassButton, the nav pills) — confirmed by direct on-device comparison
// that real UIGlassEffect composites far more transparently on this pill's
// large capsule surface than it does on GlassButton's small circles, even
// with an identical opaque-ish backing tint underneath it. BlurView with
// that same backing tint renders solid and legible, so it's the right
// choice here specifically, not a fallback being settled for.

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

// English has no Intl-native ordinal day ("8th") — every other supported
// language's Intl long-date output already matches its own convention as-is
// (German's "8. September" already carries its own ordinal marker, French's
// "8 septembre" takes none for most days, etc.), so only English needs this.
function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

// Full (non-abbreviated) day + month, localized to the playing article's
// language rather than the device locale — parsed/formatted pinned to UTC
// so the date never rolls back a day from a timezone offset alone.
function formatAudioDate(dateStr: string, language: string | null): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const locale = (language && LANG_LOCALE[language]) || 'en-GB';
  if (locale.startsWith('en')) {
    const day = d.getUTCDate();
    const weekday = d.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
    const month = d.toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' });
    return `${weekday}, ${day}${ordinalSuffix(day)} ${month}`;
  }
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

const PILL_H        = FLOAT_TAB_H_SMALL; // 52px — matches nav pill height
const NUM_BARS      = 4;
const BAR_MAX       = 12;
const GAP_ABOVE_TAB = 12;
const MARQUEE_SPEED = 38;
const FADE_WIDTH    = 24;
// Narrower than the right-edge fade, and the marquee stack is padded left by
// this same amount — otherwise the fade zone overlaps the very start of the
// headline/date text itself instead of resolving to fully transparent
// before readable content begins.
const FADE_WIDTH_LEFT = 14;
// Caps OS Dynamic Type scaling on this pill's text specifically — at PILL_H's
// fixed 52px height with two stacked text rows, an uncapped multiplier (which
// stacks on top of the app's own font-size setting) will clip against the
// pill's overflow:hidden well before reaching the OS's largest accessibility
// sizes. The article body itself stays unclamped; this is scoped to this
// compact chrome element only.
const PILL_MAX_FONT_SCALE = 1.3;

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
  const { isPlaying, isLoading, headline, date, language, queueCount } = useAudioStore(
    useShallow(s => ({ isPlaying: s.isPlaying, isLoading: s.isLoading, headline: s.headline, date: s.date, language: s.language, queueCount: s.queue.length }))
  );
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
  // colors.card — same color the flag/newspaper pills use. Backing tint that
  // sits behind the glass/blur layer (see render below) so the pill stays
  // legible over any content, same role GlassButton's own backing plays —
  // but noticeably stronger than GlassButton's 0.80 default. Real glass
  // refraction reads far more washed-out over this pill's much larger
  // surface area (a wide capsule with lots of moving article text under it)
  // than it does on GlassButton's small 28-40px circles, so the same backing
  // opacity that works fine there was still nearly invisible here.
  const tintBg = hexToRgba(colors.card, isDark ? 0.90 : 0.88);
  const onPill    = colors.chrome;
  const circleIcon = colors.bg;

  const fadeColors: [string, string] = [
    tintBg.replace(/[\d.]+\)$/, '0)'),
    tintBg,
  ];
  // Same fade, mirrored — used on the marquee's left edge so text fades IN
  // next to the waveform icon the same way it fades OUT on the right.
  const fadeColorsReversed: [string, string] = [fadeColors[1], fadeColors[0]];

  // ── Static position — re-calculates only when insets change ─────────────
  const normalBottom = insets.bottom + FLOAT_TAB_BOTTOM + FLOAT_TAB_H + GAP_ABOVE_TAB;

  async function handlePlayPause() {
    try {
      if (isLoading) return;
      if (isPlaying) { await pauseAudio(); } else { await resumeAudio(); }
    } catch {}
  }

  const marqueeText = headline ? `${headline}   ·   ` : '';
  const dateLabel = date ? formatAudioDate(date, language) : null;

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
          <View style={styles.pillShadow}>
            {/* Backing tint + BlurView — see the import comment above for
                why this pill deliberately skips native LiquidGlassView. */}
            <View style={[styles.pillClip, { backgroundColor: tintBg }]}>
              <BlurView
                intensity={isDark ? 60 : 70}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
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
              <View style={styles.marqueeStack}>
                <Animated.View
                  style={[styles.marqueeTrack, { transform: [{ translateX: marqAnim }] }]}
                >
                  <Text
                    style={[styles.marqueeText, { color: onPill, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}
                    onLayout={e => onTextLayout(e.nativeEvent.layout.width)}
                    maxFontSizeMultiplier={PILL_MAX_FONT_SCALE}
                  >
                    {marqueeText}
                  </Text>
                  <Text
                    style={[styles.marqueeText, { color: onPill, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}
                    maxFontSizeMultiplier={PILL_MAX_FONT_SCALE}
                  >
                    {marqueeText}
                  </Text>
                </Animated.View>
                {dateLabel && (
                  <Text
                    style={[styles.dateLabel, { color: onPill, fontFamily: fontFamily.bold }]}
                    maxFontSizeMultiplier={PILL_MAX_FONT_SCALE}
                  >
                    {dateLabel}
                  </Text>
                )}
              </View>

              {/* Left-edge fade — text fades IN here, next to the waveform,
                  mirroring the right-edge fade-out below. */}
              <LinearGradient
                colors={fadeColorsReversed}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.fadeEdgeLeft}
                pointerEvents="none"
              />

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
              <View style={styles.playCircle}>
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={20}
                  color={onPill}
                  style={!isPlaying ? { marginLeft: 2 } : undefined}
                />
              </View>
              {/* Queued-next count — confirms a long-press "add to queue"
                  actually did something, since that gesture has no other
                  feedback besides the haptic. */}
              {queueCount > 0 && (
                <View style={[styles.queueBadge, { backgroundColor: onPill, borderColor: tintBg }]}>
                  <Text style={[styles.queueBadgeText, { color: circleIcon, fontFamily: fontFamily.bold }]}>
                    {queueCount > 9 ? '9+' : queueCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
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
  // Clips the backing tint + glass/blur to the pill shape.
  pillClip: {
    flex: 1,
    borderRadius: PILL_H / 2,
    overflow: 'hidden',
  },
  // Row layout for the pill's own content, on top of the backing + glass.
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

  // Column stack — the scrolling headline row on top, the static date label
  // beneath it. Centering this whole stack (marqueeContainer's justifyContent)
  // is what nudges the headline text up from the pill's true vertical
  // center, rather than needing a separate manual offset.
  marqueeStack: {
    alignItems: 'flex-start',
    // Pushes text/date past the left fade zone so it never renders under it.
    paddingLeft: FADE_WIDTH_LEFT,
  },

  marqueeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    minWidth: 3000,
  },

  dateLabel: {
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 0.2,
    opacity: 0.7,
    marginTop: 1,
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

  fadeEdgeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: FADE_WIDTH_LEFT,
  },

  // No filled circle behind the icon — reads directly against the glass,
  // same as the waveform bars and marquee text already do.
  playCircle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  queueBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  queueBadgeText: {
    fontSize: 9,
    lineHeight: 11,
  },
});
