import React, { useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Animated,
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

const PILL_H   = 50;           // matches tab bar proportions
const NUM_BARS = 5;
const BAR_MAX  = 18;           // max height of each waveform bar (px)
const GAP_ABOVE_TAB = 10;     // gap between audio pill and nav pill

// ─── Component ────────────────────────────────────────────────────────────────

export function FloatingAudioPill() {
  const { colors, isDark, background } = useTheme();
  const insets = useSafeAreaInsets();
  const { isPlaying, isLoading } = useAudioStore();
  const isVisible = isPlaying || isLoading;

  // ── Entrance / exit animation ────────────────────────────────────────────
  const showAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(showAnim, {
      toValue: isVisible ? 1 : 0,
      useNativeDriver: true,
      bounciness: 14,
      speed: 16,
    }).start();
  }, [isVisible]);

  // ── Waveform bar animations ──────────────────────────────────────────────
  const barAnims = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(0.25)),
  ).current;
  const waveRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isPlaying) {
      // Start each bar with a staggered phase offset for a natural ripple
      const loops = barAnims.map((anim, i) => {
        const dur = 320 + i * 55;
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: 1,    duration: dur, useNativeDriver: false }),
            Animated.timing(anim, { toValue: 0.15, duration: dur, useNativeDriver: false }),
          ]),
        );
      });
      const staggered = Animated.stagger(90, loops);
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

  // ── Theming ──────────────────────────────────────────────────────────────
  const isNavy    = background === 'softGrey';
  const pillBg    = isNavy
    ? 'rgba(30,45,66,0.97)'
    : isDark
    ? 'rgba(22,22,22,0.96)'
    : 'rgba(255,255,255,0.96)';
  const pillBorder = isNavy
    ? 'rgba(255,255,255,0.10)'
    : isDark
    ? 'rgba(255,255,255,0.09)'
    : 'rgba(0,0,0,0.07)';

  // Accent = opposite of the current theme background (chrome)
  const accent = colors.chrome;

  // ── Position: above the floating tab bar ─────────────────────────────────
  const bottomOffset = insets.bottom + FLOAT_TAB_BOTTOM + FLOAT_TAB_H + GAP_ABOVE_TAB;

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handlePlayPause() {
    if (isLoading) return;
    if (isPlaying) {
      await pauseAudio();
    } else {
      await resumeAudio();
    }
  }

  return (
    <Animated.View
      pointerEvents={isVisible ? 'auto' : 'none'}
      style={[
        styles.wrapper,
        { bottom: bottomOffset },
        {
          opacity: showAnim,
          transform: [
            {
              translateY: showAnim.interpolate({
                inputRange:  [0, 1],
                outputRange: [16, 0],
              }),
            },
            {
              scale: showAnim.interpolate({
                inputRange:  [0, 1],
                outputRange: [0.88, 1],
              }),
            },
          ],
        },
      ]}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: pillBg,
            borderColor:      pillBorder,
          },
        ]}
      >
        {/* ── Play / Pause button ── */}
        <TouchableOpacity
          onPress={handlePlayPause}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.btnWrap}
        >
          <View
            style={[
              styles.playCircle,
              {
                backgroundColor: accent + '22',
                borderColor:     accent,
              },
            ]}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={14}
              color={accent}
              style={!isPlaying ? { marginLeft: 1.5 } : undefined}
            />
          </View>
        </TouchableOpacity>

        {/* ── Animated waveform ── */}
        <View style={styles.waveform}>
          {barAnims.map((anim, i) => (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  backgroundColor: accent,
                  height: anim.interpolate({
                    inputRange:  [0, 1],
                    outputRange: [3, BAR_MAX],
                  }),
                  opacity: isPlaying ? 0.85 : 0.35,
                },
              ]}
            />
          ))}
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
    paddingHorizontal: 18,
    gap: 16,
    borderWidth: 1,
    // Shadow — matches nav pill
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: Platform.OS === 'ios' ? 0.12 : 0,
    shadowRadius: 14,
    elevation: 10,
  },

  btnWrap: {},

  playCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: BAR_MAX,
  },

  bar: {
    width: 3,
    borderRadius: 2,
  },
});
