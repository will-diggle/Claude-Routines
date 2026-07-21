import React, { useRef, useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, Easing,
} from 'react-native';
import ConfettiCannonBase from 'react-native-confetti-cannon';
const ConfettiCannon = ConfettiCannonBase as any;
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

// ── Custom fall pieces ────────────────────────────────────────────────────────

const FALL_COUNT = 60;
type PieceShape = 'feather' | 'rect' | 'circle';
const SHAPES: PieceShape[] = ['feather','feather','feather','rect','rect','circle'];

interface FallPiece {
  anim:     Animated.Value;
  initY:    number;
  x:        number;
  size:     number;
  angle:    number;   // static tilt so pieces aren't all vertical
  duration: number;
  colorIdx: number;
  shape:    PieceShape;
}

function makeFallPieces(): FallPiece[] {
  return Array.from({ length: FALL_COUNT }, (_, i) => {
    const slotW = SCREEN_WIDTH / FALL_COUNT;
    const x     = slotW * i + Math.random() * slotW;
    const initY = -80 - Math.floor(Math.random() * (SCREEN_HEIGHT + 60));
    return {
      anim:     new Animated.Value(initY),
      initY,
      x,
      size:     6 + Math.floor(Math.random() * 9),          // 6–14
      angle:    -35 + Math.floor(Math.random() * 70),       // −35°…+35° tilt
      duration: 7000 + Math.floor(Math.random() * 7000),
      colorIdx: Math.floor(Math.random() * 5),
      shape:    SHAPES[Math.floor(Math.random() * SHAPES.length)],
    };
  });
}

function FallPieceShape({ size, shape, color }: { size: number; shape: PieceShape; color: string }) {
  if (shape === 'circle') {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    );
  }
  if (shape === 'feather') {
    const stemH  = size * 2;
    const wingW  = Math.round(size * 1.4);
    const wingH  = Math.max(2, Math.round(size * 0.22));
    const stemX  = Math.round((wingW - 2) / 2);
    const wingY  = Math.round(stemH * 0.32);
    return (
      <View style={{ width: wingW, height: stemH }}>
        {/* stem */}
        <View style={{
          position: 'absolute', left: stemX, top: 0,
          width: 2, height: stemH,
          backgroundColor: color, borderRadius: 1,
        }} />
        {/* wings */}
        <View style={{
          position: 'absolute', left: 0, top: wingY,
          width: wingW, height: wingH,
          backgroundColor: color, borderRadius: wingH / 2,
          opacity: 0.85,
        }} />
      </View>
    );
  }
  // rect
  return (
    <View style={{ width: size + 4, height: Math.max(3, Math.round(size * 0.38)), backgroundColor: color, borderRadius: 1 }} />
  );
}

export function StreakCelebrationModal({ visible, streakCount, langCode, onDismiss }: Props) {
  const { colors, fontFamily } = useTheme();

  const leftRef  = useRef<any>(null);
  const rightRef = useRef<any>(null);

  const scaleAnim = useRef(new Animated.Value(0.7)).current;

  const rimBaseConfig = useRef(makeRimBaseConfig()).current;
  const rimAnims = useRef(
    Array.from({ length: RIM_COUNT }, () => ({
      y:       new Animated.Value(-50),
      opacity: new Animated.Value(0),
      rotate:  new Animated.Value(0),
    }))
  ).current;

  // Fall pieces created once — Animated.Values persist across show/hide cycles
  const fallPieces = useRef(makeFallPieces()).current;

  const [cardTopY, setCardTopY] = useState<number | null>(null);

  // ── Main effect: burst cannons + continuous fall ──────────────────────────
  useEffect(() => {
    if (!visible) return;

    scaleAnim.setValue(0.7);
    Animated.spring(scaleAnim, {
      toValue: 1, tension: 200, friction: 6, useNativeDriver: true,
    }).start();

    // Side cannons fire once
    const burstTimer = setTimeout(() => {
      leftRef.current?.start();
      rightRef.current?.start();
    }, 120);

    // Each fall piece runs its own independent loop:
    //   first run: initY → SCREEN_HEIGHT+80 (proportional duration)
    //   subsequent runs: -80 → SCREEN_HEIGHT+80 (full duration)
    // This means each piece is mid-fall at open time and never visibly spawns.
    const cancelled = { v: false };
    const BOTTOM = SCREEN_HEIGHT + 80;
    const FULL_TRIP = SCREEN_HEIGHT + 160; // -80 → BOTTOM

    fallPieces.forEach((piece) => {
      const firstTrip = BOTTOM - piece.initY; // remaining distance from initY
      const firstDur  = Math.round(piece.duration * firstTrip / FULL_TRIP);

      const loop = (fromY: number, dur: number) => {
        if (cancelled.v) return;
        piece.anim.setValue(fromY);
        Animated.timing(piece.anim, {
          toValue: BOTTOM,
          duration: dur,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && !cancelled.v) loop(-80, piece.duration);
        });
      };

      loop(piece.initY, firstDur);
    });

    return () => {
      clearTimeout(burstTimer);
      cancelled.v = true;
      fallPieces.forEach((p) => p.anim.stopAnimation());
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
            style={[styles.card, { backgroundColor: colors.surface, transform: [{ scale: scaleAnim }] }]}
            onLayout={(e) => setCardTopY(e.nativeEvent.layout.y)}
          >
            <Text style={styles.flame}>🔥</Text>
            <Text style={[styles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              {headline}
            </Text>
            <Text style={[styles.subtext, { color: colors.inkLight, fontFamily: fontFamily.italic }]}>
              {copy}
            </Text>
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Rim pieces settle on card's top edge */}
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

      {/* Side cannons — one-time burst */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ConfettiCannon
          ref={leftRef}
          count={80}
          origin={{ x: 0, y: SCREEN_HEIGHT * 0.6 }}
          spread={70}
          colors={confettiColors}
          fallSpeed={3000}
          explosionSpeed={450}
          fadeOut={false}
          autoStart={false}
        />
        <ConfettiCannon
          ref={rightRef}
          count={80}
          origin={{ x: SCREEN_WIDTH, y: SCREEN_HEIGHT * 0.6 }}
          spread={70}
          colors={confettiColors}
          fallSpeed={3000}
          explosionSpeed={450}
          fadeOut={false}
          autoStart={false}
        />
      </View>

      {/* Continuous fall — 60 pieces (feathers, rects, circles) each with
          their own independent loop. Already mid-fall at open time. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {fallPieces.map((piece, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: piece.x,
              transform: [
                { translateY: piece.anim },
                { rotate: `${piece.angle}deg` },
              ],
            }}
          >
            <FallPieceShape
              size={piece.size}
              shape={piece.shape}
              color={confettiColors[piece.colorIdx % confettiColors.length]}
            />
          </Animated.View>
        ))}
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
  },
  flame: {
    fontSize: 56,
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
