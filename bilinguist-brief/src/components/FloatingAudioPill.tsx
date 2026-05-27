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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useAudioStore } from '../store/useAudioStore';
import { pauseAudio, resumeAudio } from '../services/audioPlayer';
import { FLOAT_TAB_H, FLOAT_TAB_BOTTOM } from './FloatingTabBar';

// ─── Geometry ─────────────────────────────────────────────────────────────────

const PILL_H        = 50;
const NUM_BARS      = 4;
const BAR_MAX       = 16;
const GAP_ABOVE_TAB = 10;
const MARQUEE_SPEED = 38; // ms per pixel — lower = faster

// ─── Component ────────────────────────────────────────────────────────────────

export function FloatingAudioPill() {
  const { colors, isDark, background, fontFamily } = useTheme();
  const insets    = useSafeAreaInsets();
  const { isPlaying, isLoading, headline } = useAudioStore();
  const isVisible = isPlaying || isLoading;

  // ── Entrance / exit spring ───────────────────────────────────────────────
  const showAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(showAnim, {
      toValue: isVisible ? 1 : 0,
      useNativeDriver: true,
      bounciness: 14,
      speed: 16,
    }).start();
  }, [isVisible]);

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
      barAnims.forEach((a) => {
        Animated.timing(a, { toValue: 0.25, duration: 200, useNativeDriver: false }).start();
      });
    }
  }, [isPlaying]);

  // ── Marquee ──────────────────────────────────────────────────────────────
  const marqAnim     = useRef(new Animated.Value(0)).current;
  const marqLoopRef  = useRef<Animated.CompositeAnimation | null>(null);
  const [textWidth,  setTextWidth]  = useState(0);
  const [containerW, setContainerW] = useState(0);

  // Restart marquee whenever the headline or play state changes
  useEffect(() => {
    marqLoopRef.current?.stop();
    marqAnim.setValue(0);

    if (!isPlaying || !headline || textWidth === 0 || containerW === 0) return;

    if (textWidth <= containerW) {
      // Text fits — no scrolling needed
      return;
    }

    // Animate: slide from 0 to -textWidth (second copy fills in seamlessly)
    const loop = Animated.loop(
      Animated.timing(marqAnim, {
        toValue:       -textWidth,
        duration:      textWidth * MARQUEE_SPEED,
        easing:        Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    marqLoopRef.current = loop;

    return () => loop.stop();
  }, [isPlaying, headline, textWidth, containerW]);

  // ── Theming ──────────────────────────────────────────────────────────────
  const isNavy     = background === 'softGrey';
  const isCream    = background === 'cream';
  const pillBg     = isNavy  ? 'rgba(30,45,66,0.97)'
                   : isDark  ? 'rgba(22,22,22,0.96)'
                   : isCream ? 'rgba(245,240,232,0.97)'
                   : 'rgba(255,255,255,0.96)';
  const pillBorder = isNavy  ? 'rgba(255,255,255,0.10)'
                   : isDark  ? 'rgba(255,255,255,0.09)'
                   : 'rgba(0,0,0,0.07)';

  const accent = colors.chrome;

  // ── Position ─────────────────────────────────────────────────────────────
  const bottomOffset = insets.bottom + FLOAT_TAB_BOTTOM + FLOAT_TAB_H + GAP_ABOVE_TAB;

  // ── Play / Pause handler ─────────────────────────────────────────────────
  async function handlePlayPause() {
    if (isLoading) return;
    if (isPlaying) { await pauseAudio(); } else { await resumeAudio(); }
  }

  // Marquee text with separator so the loop reads naturally
  const marqueeText = headline ? `${headline}   ·   ` : '';

  return (
    <Animated.View
      pointerEvents={isVisible ? 'auto' : 'none'}
      style={[
        styles.wrapper,
        { bottom: bottomOffset },
        {
          opacity: showAnim,
          transform: [
            { translateY: showAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            { scale:      showAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
          ],
        },
      ]}
    >
      <View style={[styles.pill, { backgroundColor: pillBg, borderColor: pillBorder }]}>

        {/* ── Play / Pause ── */}
        <TouchableOpacity
          onPress={handlePlayPause}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={[styles.playCircle, { backgroundColor: accent + '22', borderColor: accent }]}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={14}
              color={accent}
              style={!isPlaying ? { marginLeft: 1.5 } : undefined}
            />
          </View>
        </TouchableOpacity>

        {/* ── Waveform (fixed width) ── */}
        <View style={styles.waveform}>
          {barAnims.map((anim, i) => (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  backgroundColor: accent,
                  height:  anim.interpolate({ inputRange: [0, 1], outputRange: [3, BAR_MAX] }),
                  opacity: isPlaying ? 0.85 : 0.35,
                },
              ]}
            />
          ))}
        </View>

        {/* ── Marquee title ── */}
        <View
          style={styles.marqueeContainer}
          onLayout={e => setContainerW(e.nativeEvent.layout.width)}
        >
          {/* Two copies of the text rendered side-by-side for a seamless loop */}
          <Animated.View
            style={[styles.marqueeTrack, { transform: [{ translateX: marqAnim }] }]}
          >
            <Text
              style={[styles.marqueeText, { color: accent, fontFamily: fontFamily.regular }]}
              numberOfLines={1}
              onLayout={e => setTextWidth(e.nativeEvent.layout.width)}
            >
              {marqueeText}
            </Text>
            <Text
              style={[styles.marqueeText, { color: accent, fontFamily: fontFamily.regular }]}
              numberOfLines={1}
            >
              {marqueeText}
            </Text>
          </Animated.View>
        </View>

      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 64,
    right: 64,
    alignItems: 'center',
  },

  pill: {
    width: '100%',
    height: PILL_H,
    borderRadius: PILL_H / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: Platform.OS === 'ios' ? 0.12 : 0,
    shadowRadius: 14,
    elevation: 10,
    overflow: 'hidden', // clips the marquee at pill edges
  },

  playCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Fixed-width waveform — no longer flex:1
  waveform: {
    width: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: BAR_MAX,
    flexShrink: 0,
  },

  bar: {
    width: 3,
    borderRadius: 2,
  },

  // Takes all remaining horizontal space
  marqueeContainer: {
    flex: 1,
    overflow: 'hidden',
    height: PILL_H,
    justifyContent: 'center',
  },

  // Two copies side-by-side inside the animated wrapper
  marqueeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  marqueeText: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
