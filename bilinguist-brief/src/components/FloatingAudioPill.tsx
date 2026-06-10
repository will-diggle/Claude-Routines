import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  StyleSheet,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '../hooks/useTheme';
import { useAudioStore } from '../store/useAudioStore';
import { useNavPillStore } from '../store/useNavPillStore';
import { pauseAudio, resumeAudio } from '../services/audioPlayer';
import { FLOAT_TAB_H, FLOAT_TAB_H_SMALL, FLOAT_TAB_BOTTOM } from './FloatingTabBar';

// ─── Geometry ─────────────────────────────────────────────────────────────────

const PILL_H        = FLOAT_TAB_H_SMALL; // 44px
const NUM_BARS      = 4;
const BAR_MAX       = 12;
const GAP_ABOVE_TAB = 4;
const MARQUEE_SPEED = 38;
const FADE_WIDTH    = 24;

const SIDE_NORMAL = 16;

// When docked the pill drops down by exactly FLOAT_TAB_H + GAP_ABOVE_TAB.
// Insets cancel out so this is a compile-time constant — safe on native driver.
const DOCK_OFFSET = FLOAT_TAB_H + GAP_ABOVE_TAB; // 56px

// Horizontal margin added each side when docked — pushes pill to sit between
// the two mini nav pills (each 52px wide + 8px gap).
const DOCK_SIDE = FLOAT_TAB_H + 8; // 60px each side

// ─── Component ────────────────────────────────────────────────────────────────

export function FloatingAudioPill() {
  const { colors, isDark, background, fontFamily } = useTheme();
  const insets    = useSafeAreaInsets();
  const { isPlaying, isLoading, headline } = useAudioStore();
  const { briefingScrolled, audioPillForcedUp } = useNavPillStore(
    useShallow(s => ({ briefingScrolled: s.briefingScrolled, audioPillForcedUp: s.audioPillForcedUp }))
  );
  const isVisible = isPlaying || isLoading;
  const isDocked  = briefingScrolled && isVisible && !audioPillForcedUp;

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
  const isNavy  = background === 'softGrey';
  const isCream = background === 'cream';
  const pillBg  = isNavy  ? 'rgba(30,45,66,0.97)'
                : isDark  ? 'rgba(22,22,22,0.96)'
                : isCream ? 'rgba(245,242,237,0.97)'
                : 'rgba(255,255,255,0.96)';
  const pillBorder = isNavy  ? 'rgba(255,255,255,0.10)'
                   : isDark  ? 'rgba(255,255,255,0.09)'
                   : 'rgba(0,0,0,0.07)';
  const onPill    = colors.chrome;
  const circleIcon = colors.bg;

  const fadeColors: [string, string] = [
    pillBg.replace(/[\d.]+\)$/, '0)'),
    pillBg,
  ];

  // ── Static position — re-calculates only when insets change ─────────────
  const normalBottom = insets.bottom + FLOAT_TAB_BOTTOM + FLOAT_TAB_H + GAP_ABOVE_TAB;

  async function handlePlayPause() {
    if (isLoading) return;
    if (isPlaying) { await pauseAudio(); } else { await resumeAudio(); }
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
          <View style={[styles.pill, { backgroundColor: pillBg, borderColor: pillBorder }]}>

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
                  style={[styles.marqueeText, { color: onPill, fontFamily: fontFamily.regular }]}
                  onLayout={e => onTextLayout(e.nativeEvent.layout.width)}
                >
                  {marqueeText}
                </Text>
                <Text
                  style={[styles.marqueeText, { color: onPill, fontFamily: fontFamily.regular }]}
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

  pill: {
    width: '100%',
    height: PILL_H,
    borderRadius: PILL_H / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: Platform.OS === 'ios' ? 0.12 : 0,
    shadowRadius: 14,
    elevation: 10,
    overflow: 'hidden',
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

  marqueeText: {
    fontSize: 12,
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
