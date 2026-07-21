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

export function StreakCelebrationModal({ visible, streakCount, langCode, onDismiss }: Props) {
  const { colors, fontFamily } = useTheme();

  const leftRef  = useRef<any>(null);
  const rightRef = useRef<any>(null);
  // 14 fall cannons — fired in a tight stagger so pieces appear to
  // trickle in continuously rather than spawn in visible groups.
  const f0  = useRef<any>(null); const f1  = useRef<any>(null);
  const f2  = useRef<any>(null); const f3  = useRef<any>(null);
  const f4  = useRef<any>(null); const f5  = useRef<any>(null);
  const f6  = useRef<any>(null); const f7  = useRef<any>(null);
  const f8  = useRef<any>(null); const f9  = useRef<any>(null);
  const f10 = useRef<any>(null); const f11 = useRef<any>(null);
  const f12 = useRef<any>(null); const f13 = useRef<any>(null);

  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const rimBaseConfig = useRef(makeRimBaseConfig()).current;
  const rimAnims = useRef(
    Array.from({ length: RIM_COUNT }, () => ({
      y:       new Animated.Value(-50),
      opacity: new Animated.Value(0),
      rotate:  new Animated.Value(0),
    }))
  ).current;

  const [cardTopY, setCardTopY] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;

    scaleAnim.setValue(0.7);
    Animated.spring(scaleAnim, {
      toValue: 1, tension: 200, friction: 6, useNativeDriver: true,
    }).start();

    // Side cannons fire once on open
    const burstTimer = setTimeout(() => {
      leftRef.current?.start();
      rightRef.current?.start();
    }, 120);

    // 14 fall cannons staggered 300ms apart (total spread = 3.9s per wave).
    // Origins are 1.5× screen height above the phone — pieces are already
    // mid-fall when they enter the viewport so there's no visible spawn.
    // fallSpeed ~16s means pieces take the full screen to cross, exiting
    // naturally at the bottom before the cannon restarts at 13s.
    const STAGGER = 300;
    const WAVE_MS = 13000;
    const fallers = [f0,f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13];

    const fireWave = (baseDelay: number) =>
      fallers.map((ref, i) => setTimeout(() => ref.current?.start(), baseDelay + i * STAGGER));

    const firstWaveTimers = fireWave(120);
    waveIntervalRef.current = setInterval(() => fireWave(0), WAVE_MS);

    return () => {
      clearTimeout(burstTimer);
      firstWaveTimers.forEach(clearTimeout);
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    };
  }, [visible]);

  // Rim pieces settle on card's top edge
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

      {/* Side cannons — fire once, confetti arcs up then falls down */}
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

      {/* 14 fall cannons — origins 1.5× screen height above the phone.
          Pieces enter the viewport naturally from the top edge (no visible spawn)
          and exit at the bottom before the 13s wave repeats. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {([
          { ref: f0,  x: 0.05, fs: 15800, es: 22 },
          { ref: f1,  x: 0.12, fs: 16200, es: 20 },
          { ref: f2,  x: 0.20, fs: 15500, es: 25 },
          { ref: f3,  x: 0.28, fs: 16500, es: 18 },
          { ref: f4,  x: 0.36, fs: 15900, es: 22 },
          { ref: f5,  x: 0.44, fs: 16800, es: 20 },
          { ref: f6,  x: 0.52, fs: 15600, es: 24 },
          { ref: f7,  x: 0.60, fs: 16300, es: 19 },
          { ref: f8,  x: 0.68, fs: 15700, es: 22 },
          { ref: f9,  x: 0.76, fs: 16600, es: 21 },
          { ref: f10, x: 0.84, fs: 15400, es: 25 },
          { ref: f11, x: 0.91, fs: 16100, es: 20 },
          { ref: f12, x: 0.30, fs: 17000, es: 18 },
          { ref: f13, x: 0.70, fs: 16900, es: 19 },
        ] as { ref: React.RefObject<any>; x: number; fs: number; es: number }[]).map(({ ref, x, fs, es }, i) => (
          <ConfettiCannon
            key={i}
            ref={ref}
            count={4}
            origin={{ x: SCREEN_WIDTH * x, y: -SCREEN_HEIGHT * 1.5 }}
            spread={18}
            colors={confettiColors}
            fallSpeed={fs}
            explosionSpeed={es}
            fadeOut={false}
            autoStart={false}
          />
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
