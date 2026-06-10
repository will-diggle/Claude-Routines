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
import { FLOAT_TAB_H, FLOAT_TAB_H_SMALL, FLOAT_TAB_BOTTOM } from './FloatingTabBar';

// ─── Geometry ─────────────────────────────────────────────────────────────────

const PILL_H        = FLOAT_TAB_H_SMALL; // matches left pill height when open (44px)
const NUM_BARS      = 4;
const BAR_MAX       = 12;
const GAP_ABOVE_TAB = 10;
const MARQUEE_SPEED = 38; // ms per pixel — lower = faster

// ─── Component ────────────────────────────────────────────────────────────────

export function FloatingAudioPill() {
  const { colors, fontFamily } = useTheme();
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
      // Freeze bars in their current position — no snap to mid-height
      waveRef.current?.stop();
      waveRef.current = null;
    }
  }, [isPlaying]);

  // ── Marquee ──────────────────────────────────────────────────────────────
  // Dimensions are stored in refs (not state) so layout re-fires don't
  // reset the animation position mid-scroll. animTrigger is only bumped
  // when a measurement is genuinely new, decoupling layout events from
  // animation lifecycle.
  const marqAnim      = useRef(new Animated.Value(0)).current;
  const marqLoopRef   = useRef<Animated.CompositeAnimation | null>(null);
  const textWidthRef  = useRef(0);
  const containerWRef = useRef(0);
  const [animTrigger, setAnimTrigger] = useState(0);

  // Stop and reset position when headline changes (new track → start from left)
  useEffect(() => {
    marqLoopRef.current?.stop();
    marqLoopRef.current = null;
    marqAnim.setValue(0);
    textWidthRef.current = 0; // force re-measure for new text
  }, [headline]);

  // Always return early when measurement hasn't changed — old-arch re-renders
  // with new inline style objects can trigger onLayout without any real change.
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

  // Start animation when trigger fires — scrolls continuously regardless of play state
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
  // Pill matches the canvas background; chrome is used for text and bars.
  // The play circle is solid chrome with a contrasting icon inside.
  const pillBg    = colors.bg;     // cream / white / navy — matches page background
  const onPill    = colors.chrome; // text + bars — dark on light, light on dark
  const circleIcon = colors.bg;    // icon inside the solid chrome circle

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
      <View style={[styles.pill, { backgroundColor: pillBg }]}>

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
          {/* Two copies of the text rendered side-by-side for a seamless loop */}
          <Animated.View
            style={[styles.marqueeTrack, { transform: [{ translateX: marqAnim }] }]}
          >
            {/* No numberOfLines — must measure the natural (unconstrained) text width */}
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
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
  },

  pill: {
    width: '100%',
    height: PILL_H,
    borderRadius: PILL_H / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: Platform.OS === 'ios' ? 0.12 : 0,
    shadowRadius: 14,
    elevation: 10,
    overflow: 'hidden', // clips the marquee at pill edges
  },

  // Fixed-width waveform
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

  // Takes all remaining horizontal space
  marqueeContainer: {
    flex: 1,
    overflow: 'hidden',
    height: PILL_H,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },

  // Two copies side-by-side inside the animated wrapper.
  // flexShrink:0 prevents the track being squeezed to container width,
  // which would make textWidth === containerW and block the animation.
  marqueeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },

  marqueeText: {
    fontSize: 12,
    letterSpacing: 0.2,
    flexShrink: 0,
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
