import React, { useRef, useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Accelerometer } from 'expo-sensors';
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

// ── Rim pieces (settle on card top edge) ─────────────────────────────────────

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

// ── Cannon burst pieces (shoot from bottom corners) ───────────────────────────

const CANNON_COUNT = 500;

interface CannonPiece {
  animX:       Animated.Value;
  animY:       Animated.Value;
  opacity:     Animated.Value;
  startX:      number;
  colorIdx:    number;
  size:        number;
  angle:       number;
  driftFactor: number;
}

function makeCannonPieces(): CannonPiece[] {
  return Array.from({ length: CANNON_COUNT }, (_, i) => {
    const fromLeft = i < CANNON_COUNT / 2;
    const startX   = fromLeft ? 30 + Math.random() * 40 : SCREEN_WIDTH - 30 - Math.random() * 40;
    return {
      animX:    new Animated.Value(startX),
      animY:    new Animated.Value(SCREEN_HEIGHT - 80),
      opacity:  new Animated.Value(0),
      startX,
      colorIdx:    Math.floor(Math.random() * 5),
      size:        7 + Math.floor(Math.random() * 8),
      angle:       Math.floor(Math.random() * 360),
      driftFactor: 0.3 + Math.random() * 0.8,
    };
  });
}

// ── Continuous fall pieces ────────────────────────────────────────────────────

const FALL_COUNT = 60;

type PieceShape = 'rect' | 'square' | 'circle';
const SHAPES: PieceShape[] = ['rect', 'rect', 'rect', 'square', 'square', 'circle'];

interface FallPiece {
  animY:       Animated.Value;
  initY:       number;
  x:           number;
  size:        number;
  angle:       number;
  duration:    number;
  colorIdx:    number;
  shape:       PieceShape;
  driftFactor: number; // each piece responds to tilt at a slightly different rate
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
      size:        6 + Math.floor(Math.random() * 9),
      angle:       -40 + Math.floor(Math.random() * 80),
      duration:    7000 + Math.floor(Math.random() * 7000),
      colorIdx:    Math.floor(Math.random() * 5),
      shape:       SHAPES[Math.floor(Math.random() * SHAPES.length)],
      driftFactor: 0.5 + Math.random() * 1.0, // 0.5–1.5×
    };
  });
}

function FallPieceShape({ size, shape, color }: { size: number; shape: PieceShape; color: string }) {
  if (shape === 'circle') {
    const d = Math.max(4, Math.round(size * 0.6));
    return <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: color }} />;
  }
  if (shape === 'square') {
    const s = Math.max(4, Math.round(size * 0.7));
    return <View style={{ width: s, height: s, backgroundColor: color, borderRadius: 1 }} />;
  }
  return (
    <View style={{
      width:           Math.max(6, size + 2),
      height:          Math.max(3, Math.round(size * 0.45)),
      backgroundColor: color,
      borderRadius:    1,
    }} />
  );
}

export function StreakCelebrationModal({ visible, streakCount, langCode, onDismiss }: Props) {
  const { colors, fontFamily } = useTheme();

  const scaleAnim     = useRef(new Animated.Value(0.7)).current;
  // Single tilt value shared by all falling pieces — springs toward accelerometer x
  const tiltAnim      = useRef(new Animated.Value(0)).current;

  const rimBaseConfig = useRef(makeRimBaseConfig()).current;
  const rimAnims      = useRef(
    Array.from({ length: RIM_COUNT }, () => ({
      y:       new Animated.Value(-50),
      opacity: new Animated.Value(0),
      rotate:  new Animated.Value(0),
    }))
  ).current;

  const cannonPieces   = useRef(makeCannonPieces()).current;
  const cannonDriftXs  = useRef(
    cannonPieces.map(p => Animated.add(p.animX, Animated.multiply(tiltAnim, new Animated.Value(p.driftFactor))))
  ).current;
  const fallPieces     = useRef(makeFallPieces()).current;

  const [cardTopY, setCardTopY] = useState<number | null>(null);

  // ── Accelerometer → tilt spring ──────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;

    Accelerometer.setUpdateInterval(50); // 20fps is plenty
    const sub = Accelerometer.addListener(({ x }) => {
      // On iOS, tilting left raises +x, tilting right raises -x.
      // We negate so positive tilt → pieces drift right (intuitive gravity).
      Animated.spring(tiltAnim, {
        toValue:         -x * 130, // ±130px max horizontal drift
        useNativeDriver: true,
        tension:         12,
        friction:        7,
      }).start();
    });

    return () => {
      sub.remove();
      tiltAnim.setValue(0);
    };
  }, [visible]);

  // ── Cannon burst on open ──────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;

    scaleAnim.setValue(0.7);
    Animated.spring(scaleAnim, {
      toValue: 1, tension: 200, friction: 6, useNativeDriver: true,
    }).start();

    // Reset all pieces first, then start all animations together so they fire simultaneously
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
      const burstDur = 700 + Math.random() * 700;
      const fallDur  = 1000 + Math.random() * 1200;

      Animated.parallel([
        // Horizontal burst only — tilt drift is layered on top in JSX
        Animated.timing(piece.animX, {
          toValue: targetX, duration: burstDur,
          easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
        // Arc up to peak, then fall under gravity
        Animated.sequence([
          Animated.timing(piece.animY, {
            toValue: targetY, duration: burstDur,
            easing: Easing.out(Easing.cubic), useNativeDriver: true,
          }),
          Animated.timing(piece.animY, {
            toValue: SCREEN_HEIGHT + 120, duration: fallDur,
            easing: Easing.in(Easing.quad), useNativeDriver: true,
          }),
        ]),
        // Fade only in the last 20% of the fall
        Animated.sequence([
          Animated.delay(burstDur + fallDur * 0.8),
          Animated.timing(piece.opacity, {
            toValue: 0, duration: fallDur * 0.2,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    });

    // Start continuous rain
    const BOTTOM = SCREEN_HEIGHT + 80;
    fallPieces.forEach((piece) => {
      piece.animY.setValue(piece.initY);
      Animated.loop(
        Animated.timing(piece.animY, {
          toValue:         BOTTOM,
          duration:        piece.duration,
          easing:          Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    });

    return () => {
      cannonPieces.forEach((p) => { p.animX.stopAnimation(); p.animY.stopAnimation(); });
      fallPieces.forEach((p) => p.animY.stopAnimation());
    };
  }, [visible]);

  // ── Rim pieces settle on card's top edge ──────────────────────────────────
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
                  opacity: rimAnims[i].opacity,
                  transform: [{ translateY: rimAnims[i].y }, { rotate: pieceRotate }],
                }}
              />
            </View>
          );
        })}
      </View>

      {/* Cannon burst pieces */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {cannonPieces.map((piece, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              width:    piece.size,
              height:   piece.size * 0.5,
              backgroundColor: confettiColors[piece.colorIdx % confettiColors.length],
              borderRadius: 2,
              opacity:  piece.opacity,
              transform: [
                { translateX: cannonDriftXs[i] },
                { translateY: piece.animY },
                { rotate: `${piece.angle}deg` },
              ],
            }}
          />
        ))}
      </View>

      {/* Continuous fall — gyroscope-aware */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {fallPieces.map((piece, i) => {
          // Each piece drifts at its own rate so they spread apart naturally
          const driftX = Animated.multiply(tiltAnim, new Animated.Value(piece.driftFactor));
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left:     piece.x,
                transform: [
                  { translateY: piece.animY },
                  { translateX: driftX },
                ],
              }}
            >
              <View style={{ transform: [{ rotate: `${piece.angle}deg` }] }}>
                <FallPieceShape
                  size={piece.size}
                  shape={piece.shape}
                  color={confettiColors[piece.colorIdx % confettiColors.length]}
                />
              </View>
            </Animated.View>
          );
        })}
      </View>
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
