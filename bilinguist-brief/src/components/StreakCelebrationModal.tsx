import React, { useRef, useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassSurface, glassAvailable } from './GlassSurface';
import { useTheme } from '../hooks/useTheme';
import { Colors } from '../theme';

const FLAG_CONFETTI_COLORS: Record<string, string[]> = {
  it: ['#009246', '#FFFFFF', '#CE2B37', '#009246', '#CE2B37'],
  fr: ['#002395', '#FFFFFF', '#ED2939', '#002395', '#ED2939'],
  de: ['#000000', '#DD0000', '#FFCE00', '#DD0000', '#FFCE00'],
  es: ['#AA151B', '#F1BF00', '#AA151B', '#F1BF00', '#C60B1E'],
  sv: ['#006AA7', '#FECC02', '#006AA7', '#FECC02', '#FFFFFF'],
  tr: ['#E30A17', '#FFFFFF', '#E30A17', '#FFFFFF', '#E30A17'],
  hu: ['#CE2939', '#FFFFFF', '#477050', '#CE2939', '#477050'],
  ar: ['#EF3340', '#FFFFFF', '#009A44', '#231F20', '#EF3340'],
  en: ['#C8102E', '#FFFFFF', '#012169', '#C8102E', '#FFFFFF'],
};
const DEFAULT_CONFETTI_COLORS = [Colors.cream, Colors.accentGold, Colors.accentRed, '#C8C4BC', Colors.navyBg];

const STREAK_COPY: Record<string, string> = {
  en: 'Your streak is on fire!',
  fr: 'Ta série est en feu !',
  de: 'Deine Serie brennt!',
  sv: 'Din serie är på hugget!',
  it: 'La tua serie è in fiamme!',
  es: '¡Tu racha está en llamas!',
  tr: 'Seriniz ateşte!',
  hu: 'A sorozatod lángol!',
};

interface Props {
  visible: boolean;
  streakCount: number;
  langCode: string;
  onDismiss: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const LANG_FLAG_EMOJI: Record<string, string> = {
  fr: '🇫🇷', de: '🇩🇪', es: '🇪🇸', it: '🇮🇹',
  sv: '🇸🇪', tr: '🇹🇷', hu: '🇭🇺', ar: '🇸🇦', en: '🇬🇧',
};

// ── Sin/cos keyframe tables for feather interpolation ─────────────────────────
const KF_N       = 60;
const KF_IN      = Array.from({ length: KF_N + 1 }, (_, i) => i / KF_N);
const KF_SIN     = KF_IN.map(t => Math.sin(t * Math.PI * 2));
const KF_COS_ABS = KF_IN.map(t => Math.abs(Math.cos(t * Math.PI * 2)));  // 1→0→1, no negative
const KF_COS_RAW = KF_IN.map(t => Math.cos(t * Math.PI * 2));            // derivative for tilt

// ── Rim pieces ────────────────────────────────────────────────────────────────

const RIM_COUNT = 36;

function makeRimBaseConfig() {
  const CARD_LEFT  = 28;
  const CARD_RIGHT = SCREEN_WIDTH - 28;
  return Array.from({ length: RIM_COUNT }, () => ({
    x:          CARD_LEFT + Math.floor(Math.random() * (CARD_RIGHT - CARD_LEFT - 8)),
    w:          5 + Math.floor(Math.random() * 7),
    h:          3 + Math.floor(Math.random() * 4),
    rotation:   -90 + Math.floor(Math.random() * 180),
    colorIndex: Math.floor(Math.random() * 5),
    delay:      150 + Math.floor(Math.random() * 2800),
    duration:   500 + Math.floor(Math.random() * 500),
  }));
}

// ── Cannon burst pieces (original, no changes) ────────────────────────────────

const CANNON_COUNT = 200;

interface CannonPiece {
  animX:       Animated.Value;
  animY:       Animated.Value;
  opacity:     Animated.Value;
  startX:      number;
  colorIdx:    number;
  size:        number;
  angle:       number;
  shape:       PieceShape;
  driftFactor: number;
}

function makeCannonPieces(): CannonPiece[] {
  return Array.from({ length: CANNON_COUNT }, (_, i) => {
    const fromLeft = i < CANNON_COUNT / 2;
    const startX   = fromLeft ? 30 + Math.random() * 40 : SCREEN_WIDTH - 30 - Math.random() * 40;
    return {
      animX:       new Animated.Value(startX),
      animY:       new Animated.Value(SCREEN_HEIGHT - 80),
      opacity:     new Animated.Value(0),
      startX,
      colorIdx:    Math.floor(Math.random() * 5),
      size:        7 + Math.floor(Math.random() * 8),
      angle:       Math.floor(Math.random() * 360),
      shape:       SHAPES[Math.floor(Math.random() * SHAPES.length)],
      driftFactor: 0.3 + Math.random() * 0.8,
    };
  });
}

// ── Continuous fall pieces ────────────────────────────────────────────────────

const FALL_COUNT = 120;

// Shared shape vocabulary — used by both cannon burst AND falling rain
type PieceShape = 'pill' | 'square' | 'circle' | 'star' | 'flag';
const SHAPES: PieceShape[] = ['pill', 'square', 'circle', 'star', 'star', 'star', 'star', 'flag', 'flag'];

interface FallPiece {
  animY:       Animated.Value;
  initY:       number;
  x:           number;
  size:        number;
  angle:       number;
  duration:    number;
  colorIdx:    number;
  shape:       PieceShape;
  driftFactor: number;
  skew:        number;          // static bend angle (degrees) — simulates paper curving in wind
  // feather physics animated values
  swayAnim:    Animated.Value;  // 0→1 loops → sinusoidal translateX
  flipAnim:    Animated.Value;  // 0→1 loops → scaleX (face-on/edge-on flutter)
  twirlAnim:   Animated.Value;  // 0→1 per twirl burst (~15% of pieces)
  swayAmp:     number;
  swayPeriod:  number;
  flipPeriod:  number;
  tiltMax:     number;
  isLooper:    boolean;
}

function makeFallPieces(): FallPiece[] {
  return Array.from({ length: FALL_COUNT }, (_, i) => {
    const slotW = SCREEN_WIDTH / FALL_COUNT;
    const x     = slotW * i + Math.random() * slotW;
    const initY = -80 - Math.floor(Math.random() * (SCREEN_HEIGHT + 60));
    return {
      animY:       new Animated.Value(initY),
      initY,
      x,
      size:        7 + Math.floor(Math.random() * 9),
      angle:       -40 + Math.floor(Math.random() * 80),
      duration:    7000 + Math.floor(Math.random() * 7000),
      colorIdx:    Math.floor(Math.random() * 5),
      shape:       SHAPES[Math.floor(Math.random() * SHAPES.length)],
      driftFactor: 0.5 + Math.random() * 1.0,
      skew:        -18 + Math.random() * 36,   // –18° to +18°
      swayAnim:    new Animated.Value(0),
      flipAnim:    new Animated.Value(0),
      twirlAnim:   new Animated.Value(0),
      swayAmp:     22 + Math.random() * 28,
      swayPeriod:  3500 + Math.random() * 3500,
      flipPeriod:  2000 + Math.random() * 2500,
      tiltMax:     0.35 + Math.random() * 0.30,
      isLooper:    Math.random() < 0.15,
    };
  });
}

// Proper 5-pointed star via Unicode ★ character
function StarShape({ size, color }: { size: number; color: string }) {
  const fontSize = Math.max(10, Math.round(size * 1.2));
  return (
    <Text style={{ fontSize, color, lineHeight: fontSize, includeFontPadding: false }}>★</Text>
  );
}

// Flag emoji — iOS renders these as proper country flag graphics
function FlagShape({ emoji }: { emoji: string }) {
  return (
    <Text style={{ fontSize: 18, lineHeight: 20 }}>{emoji}</Text>
  );
}

function FallPieceShape({ size, shape, color, flagEmoji }: { size: number; shape: PieceShape; color: string; flagEmoji?: string }) {
  if (shape === 'flag') {
    return <FlagShape emoji={flagEmoji ?? '🏳️'} />;
  }
  if (shape === 'star') {
    return <StarShape size={size} color={color} />;
  }
  if (shape === 'circle') {
    const d = Math.max(5, Math.round(size * 0.65));
    return <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: color }} />;
  }
  if (shape === 'square') {
    const s = Math.max(5, Math.round(size * 0.8));
    return <View style={{ width: s, height: s, borderRadius: Math.round(s * 0.28), backgroundColor: color }} />;
  }
  // pill — fully rounded ends
  const h = Math.max(4, Math.round(size * 0.50));
  const w = Math.max(8, size + 3);
  return <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: color }} />;
}

export function StreakCelebrationModal({ visible, streakCount, langCode, onDismiss }: Props) {
  const { colors, fontFamily } = useTheme();

  const scaleAnim      = useRef(new Animated.Value(0.7)).current;
  const tiltAnim       = useRef(new Animated.Value(0)).current;
  const skyRotateAnim  = useRef(new Animated.Value(0)).current;
  // Pre-computed once — maps radian angle to deg string for native driver
  const skyRotateStr   = useRef(
    skyRotateAnim.interpolate({
      inputRange:  [-Math.PI, 0, Math.PI],
      outputRange: ['-180deg', '0deg', '180deg'],
    })
  ).current;

  const rimBaseConfig = useRef(makeRimBaseConfig()).current;
  const rimAnims      = useRef(
    Array.from({ length: RIM_COUNT }, () => ({
      y:       new Animated.Value(-50),
      opacity: new Animated.Value(0),
      rotate:  new Animated.Value(0),
    }))
  ).current;

  const cannonPieces  = useRef(makeCannonPieces()).current;
  const fallPieces    = useRef(makeFallPieces()).current;

  // Cannon gyro drift — pre-computed, stable across renders
  const cannonDriftXs = useRef(
    cannonPieces.map(p =>
      Animated.add(p.animX, Animated.multiply(tiltAnim, new Animated.Value(p.driftFactor)))
    )
  ).current;

  // Fall piece physics: combined (drift + sway) translateX plus flip scaleX and tilt rotate
  // All pre-computed once so JSX never allocates new animated nodes per render.
  const fallTransforms = useRef(
    fallPieces.map(p => {
      const swayX = p.swayAnim.interpolate({
        inputRange:  KF_IN,
        outputRange: KF_SIN.map(v => v * p.swayAmp),
      });
      const totalX = Animated.add(
        Animated.multiply(tiltAnim, new Animated.Value(p.driftFactor)),
        swayX,
      );
      const scaleX = p.flipAnim.interpolate({
        inputRange:  KF_IN,
        outputRange: KF_COS_ABS,
      });
      const tiltRotate = p.swayAnim.interpolate({
        inputRange:  KF_IN,
        outputRange: KF_COS_RAW.map(v => `${v * p.tiltMax}rad`),
      });
      const twirlRotate = p.twirlAnim.interpolate({
        inputRange:  [0, 1],
        outputRange: ['0deg', '360deg'],
      });
      return { totalX, scaleX, tiltRotate, twirlRotate };
    })
  ).current;

  // Mutable ref for cleanup — stores all active timers for the feather animations
  const featherTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [cardTopY, setCardTopY] = useState<number | null>(null);

  // ── Accelerometer → tilt spring ──────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;

    let sub: { remove: () => void } | undefined;
    try {
      const { Accelerometer } = require('expo-sensors');
      Accelerometer.setUpdateInterval(33);
      sub = Accelerometer.addListener(({ x, y }: { x: number; y: number }) => {
        // Lateral drift on individual pieces — wider range than before
        Animated.spring(tiltAnim, {
          toValue: x * 520, useNativeDriver: true, tension: 20, friction: 6,
        }).start();
        // Sky rotation: counter-rotate the rain layer so confetti always falls
        // from real-world "up" regardless of phone orientation.
        // atan2(x, -y) = 0 when upright, +π/2 when rotated 90° clockwise.
        const phoneAngle = Math.atan2(x, -y);
        Animated.spring(skyRotateAnim, {
          toValue: -phoneAngle,
          useNativeDriver: true,
          tension: 12,   // lazy spring — pieces take a moment to "settle" with gravity
          friction: 7,
        }).start();
      });
    } catch {
      // expo-sensors unavailable in Expo Go
    }

    return () => {
      sub?.remove();
      tiltAnim.setValue(0);
      skyRotateAnim.setValue(0);
    };
  }, [visible]);

  // ── Cannon burst + feather rain ───────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;

    scaleAnim.setValue(0.7);
    Animated.spring(scaleAnim, {
      toValue: 1, tension: 200, friction: 6, useNativeDriver: true,
    }).start();

    // Cannon burst — unchanged from original
    cannonPieces.forEach((piece) => {
      piece.animX.setValue(piece.startX);
      piece.animY.setValue(SCREEN_HEIGHT - 80);
      piece.opacity.setValue(1);
    });

    cannonPieces.forEach((piece, i) => {
      const fromLeft = i < CANNON_COUNT / 2;
      const targetX  = fromLeft
        ? piece.startX + 60  + Math.random() * (SCREEN_WIDTH * 0.85)
        : piece.startX - 60  - Math.random() * (SCREEN_WIDTH * 0.85);
      const targetY  = 20 + Math.random() * (SCREEN_HEIGHT * 0.65);
      const burstDur = 500 + Math.random() * 400;
      const fallDur  = 800 + Math.random() * 800;

      Animated.parallel([
        Animated.timing(piece.animX, {
          toValue: targetX, duration: burstDur,
          easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(piece.animY, {
            toValue: targetY, duration: burstDur,
            easing: Easing.out(Easing.cubic), useNativeDriver: true,
          }),
          Animated.timing(piece.animY, {
            toValue: SCREEN_HEIGHT + 120, duration: fallDur,
            easing: Easing.in(Easing.cubic), useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(burstDur + fallDur * 0.8),
          Animated.timing(piece.opacity, {
            toValue: 0, duration: fallDur * 0.2, useNativeDriver: true,
          }),
        ]),
      ]).start();
    });

    // Feather rain ─────────────────────────────────────────────────────────
    // Phase offset via setTimeout (not Animated.sequence) so native-driver
    // loops start cleanly without a JS-thread handoff.
    const BOTTOM = SCREEN_HEIGHT + 80;
    const timers: ReturnType<typeof setTimeout>[] = [];

    fallPieces.forEach((piece) => {
      piece.animY.setValue(piece.initY);
      piece.swayAnim.setValue(0);
      piece.flipAnim.setValue(0);
      piece.twirlAnim.setValue(0);

      // Vertical fall — immediate loop, no phase offset needed
      Animated.loop(
        Animated.timing(piece.animY, {
          toValue: BOTTOM, duration: piece.duration,
          easing: Easing.linear, useNativeDriver: true,
        })
      ).start();

      // Sway — random startup delay spread across half a period
      const swayDelay = Math.random() * (piece.swayPeriod / 2);
      const t1 = setTimeout(() => {
        Animated.loop(
          Animated.timing(piece.swayAnim, {
            toValue: 1, duration: piece.swayPeriod,
            easing: Easing.linear, useNativeDriver: true,
          })
        ).start();
      }, swayDelay);
      timers.push(t1);

      // 3D flutter — independent random delay
      const flipDelay = Math.random() * (piece.flipPeriod / 2);
      const t2 = setTimeout(() => {
        Animated.loop(
          Animated.timing(piece.flipAnim, {
            toValue: 1, duration: piece.flipPeriod,
            easing: Easing.linear, useNativeDriver: true,
          })
        ).start();
      }, flipDelay);
      timers.push(t2);

      // 360° twirl for ~15% of pieces — recursive setTimeout so each twirl
      // fires after a fresh random cooldown (avoids Animated.sequence + loop)
      if (piece.isLooper) {
        const scheduleTwirl = () => {
          const cooldown = 2000 + Math.random() * 5000;
          const t3 = setTimeout(() => {
            piece.twirlAnim.setValue(0);
            Animated.timing(piece.twirlAnim, {
              toValue: 1, duration: 700,
              easing: Easing.inOut(Easing.quad), useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) scheduleTwirl();
            });
          }, cooldown);
          timers.push(t3);
        };
        scheduleTwirl();
      }
    });

    featherTimers.current = timers;

    return () => {
      featherTimers.current.forEach(clearTimeout);
      featherTimers.current = [];
      cannonPieces.forEach((p) => { p.animX.stopAnimation(); p.animY.stopAnimation(); p.opacity.stopAnimation(); });
      fallPieces.forEach((p) => {
        p.animY.stopAnimation();
        p.swayAnim.stopAnimation();
        p.flipAnim.stopAnimation();
        p.twirlAnim.stopAnimation();
      });
    };
  }, [visible]);

  // ── Rim pieces ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || cardTopY === null) return;
    rimAnims.forEach((a) => {
      a.y.setValue(-20 - Math.floor(Math.random() * 60));
      a.opacity.setValue(0);
      a.rotate.setValue(0);
    });
    const timers = rimBaseConfig.map((cfg, i) =>
      setTimeout(() => {
        const landY = cardTopY - Math.floor(Math.random() * 4);
        rimAnims[i].opacity.setValue(1);
        Animated.parallel([
          Animated.timing(rimAnims[i].y, {
            toValue: landY, duration: cfg.duration,
            easing: Easing.out(Easing.quad), useNativeDriver: true,
          }),
          Animated.timing(rimAnims[i].rotate, {
            toValue: 1, duration: cfg.duration,
            easing: Easing.out(Easing.quad), useNativeDriver: true,
          }),
        ]).start();
      }, cfg.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [visible, cardTopY]);

  const toArabicNumerals = (n: number) =>
    String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)]);
  const displayCount   = langCode === 'ar' ? toArabicNumerals(streakCount) : String(streakCount);
  const copy           = STREAK_COPY[langCode] ?? 'Your streak is on fire';
  const headline       = `${displayCount} day streak!`;
  const confettiColors = FLAG_CONFETTI_COLORS[langCode] ?? DEFAULT_CONFETTI_COLORS;
  const flagEmoji      = LANG_FLAG_EMOJI[langCode] ?? '🏳️';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss}>
        <View style={styles.backdrop} pointerEvents="none">
          <Animated.View
            style={[
              styles.card,
              { backgroundColor: glassAvailable ? 'transparent' : colors.surface },
              { transform: [{ scale: scaleAnim }] },
            ]}
            onLayout={(e) => setCardTopY(e.nativeEvent.layout.y)}
          >
            {glassAvailable && <GlassSurface cornerRadius={26} />}
            <Ionicons name="flame" size={64} color="#F97316" style={styles.flameIcon} />
            <Text style={[styles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              {headline}
            </Text>
            <Text style={[styles.subtext, { color: colors.inkLight, fontFamily: fontFamily.italic }]}>
              {copy}
            </Text>
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Rim pieces */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {rimBaseConfig.map((cfg, i) => {
          const pieceRotate = rimAnims[i].rotate.interpolate({
            inputRange: [0, 1], outputRange: ['0deg', `${cfg.rotation}deg`],
          });
          return (
            <View key={i} style={{ position: 'absolute', top: 0, left: cfg.x, width: cfg.w, height: cfg.h, overflow: 'visible' }}>
              <Animated.View
                style={{
                  width: cfg.w, height: cfg.h,
                  backgroundColor: confettiColors[cfg.colorIndex % confettiColors.length],
                  borderRadius: Math.ceil(cfg.h / 2),
                  opacity: rimAnims[i].opacity,
                  transform: [{ translateY: rimAnims[i].y }, { rotate: pieceRotate }],
                }}
              />
            </View>
          );
        })}
      </View>

      {/* Cannon burst — same shapes as the falling rain */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {cannonPieces.map((piece, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              opacity:  piece.opacity,
              transform: [
                { translateX: cannonDriftXs[i] },
                { translateY: piece.animY },
                { rotate: `${piece.angle}deg` },
              ],
            }}
          >
            <FallPieceShape
              size={piece.size}
              shape={piece.shape}
              color={confettiColors[piece.colorIdx % confettiColors.length]}
              flagEmoji={flagEmoji}
            />
          </Animated.View>
        ))}
      </View>

      {/* Continuous fall — feather physics, sky-rotation layer tracks real-world up */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate: skyRotateStr }] }]}>
        {fallPieces.map((piece, i) => {
          const ft = fallTransforms[i];
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: piece.x,
                transform: [
                  { translateY: piece.animY },
                  { translateX: ft.totalX },
                  { scaleX: ft.scaleX },
                  { rotate: `${piece.angle}deg` },
                  { rotate: ft.tiltRotate },
                  { rotate: ft.twirlRotate },
                ],
              }}
            >
              {/* Static skewX gives each piece a unique paper-bend — no animation cost */}
              <View style={{ transform: [{ skewX: `${piece.skew}deg` }] }}>
                <FallPieceShape
                  size={piece.size}
                  shape={piece.shape}
                  color={confettiColors[piece.colorIdx % confettiColors.length]}
                  flagEmoji={flagEmoji}
                />
              </View>
            </Animated.View>
          );
        })}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    borderRadius: 26,
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.20,
    shadowRadius: 40,
    elevation: 20,
    overflow: 'hidden',
  },
  flameIcon: {
    marginBottom: 16,
  },
  headline: {
    fontSize: 28,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtext: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
