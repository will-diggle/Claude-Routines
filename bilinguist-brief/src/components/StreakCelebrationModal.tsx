import React, { useRef, useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, Easing,
} from 'react-native';
import ConfettiCannonBase from 'react-native-confetti-cannon';
// Library types are incomplete — `spread`, `explosionSpeed` etc. are valid runtime props
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

// 30 pieces that rest on the card's top rim
const RIM_COUNT = 30;

// x, size, timing — set once at mount, stable across renders
function makeRimBaseConfig() {
  const CARD_LEFT = 28;
  const CARD_RIGHT = SCREEN_WIDTH - 28;
  return Array.from({ length: RIM_COUNT }, () => ({
    x:          CARD_LEFT + Math.floor(Math.random() * (CARD_RIGHT - CARD_LEFT - 8)),
    w:          5 + Math.floor(Math.random() * 7),
    h:          3 + Math.floor(Math.random() * 4),
    rotation:   -90 + Math.floor(Math.random() * 180),
    colorIndex: Math.floor(Math.random() * 5),
    delay:      100 + Math.floor(Math.random() * 2000),
    duration:   700 + Math.floor(Math.random() * 500),
  }));
}

export function StreakCelebrationModal({ visible, streakCount, langCode, onDismiss }: Props) {
  const { colors, fontFamily } = useTheme();

  const behindLeftRef   = useRef<any>(null);
  const behindCenterRef = useRef<any>(null);
  const behindRightRef  = useRef<any>(null);
  const frontRef        = useRef<any>(null);
  const rainLeftRef     = useRef<any>(null);
  const rainCenterRef   = useRef<any>(null);
  const rainRightRef    = useRef<any>(null);

  const scaleAnim  = useRef(new Animated.Value(0.7)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Rain loop interval handle
  const rainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rim pieces — x/size/timing stable from mount; landY computed from card onLayout
  const rimBaseConfig = useRef(makeRimBaseConfig()).current;
  const rimAnims = useRef(
    Array.from({ length: RIM_COUNT }, () => ({
      y:       new Animated.Value(-50),
      opacity: new Animated.Value(0),
      rotate:  new Animated.Value(0),
    }))
  ).current;

  // Set by the card's onLayout — triggers the rim animation effect
  const [cardTopY, setCardTopY] = useState<number | null>(null);

  // Card entrance + burst + continuous rain
  useEffect(() => {
    if (!visible) return;

    scaleAnim.setValue(0.7);
    rotateAnim.setValue(0);

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1, tension: 200, friction: 6, useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(rotateAnim, { toValue: 1,   duration: 80, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: -1,  duration: 80, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0.5, duration: 80, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0,   duration: 80, useNativeDriver: true }),
      ]),
    ]).start();

    // Burst from below
    const burstTimer = setTimeout(() => {
      behindLeftRef.current?.start();
      behindCenterRef.current?.start();
      behindRightRef.current?.start();
      frontRef.current?.start();
    }, 100);

    // Rain from above — first batch fires simultaneously with burst, then loops every 3.2 s
    const startRain = () => {
      rainLeftRef.current?.start();
      rainCenterRef.current?.start();
      rainRightRef.current?.start();
    };

    const rainTimer = setTimeout(startRain, 100);
    rainIntervalRef.current = setInterval(startRain, 3200);

    return () => {
      clearTimeout(burstTimer);
      clearTimeout(rainTimer);
      if (rainIntervalRef.current) clearInterval(rainIntervalRef.current);
    };
  }, [visible]);

  // Rim-piece effect — runs once the card's Y is measured
  useEffect(() => {
    if (!visible || cardTopY === null) return;

    // Reset all pieces above screen
    rimAnims.forEach((a) => {
      a.y.setValue(-20 - Math.floor(Math.random() * 80));
      a.opacity.setValue(0);
      a.rotate.setValue(0);
    });

    const timers = rimBaseConfig.map((cfg, i) =>
      setTimeout(() => {
        const landY = cardTopY - Math.floor(Math.random() * 5);
        rimAnims[i].opacity.setValue(1);
        Animated.parallel([
          Animated.timing(rimAnims[i].y, {
            toValue:  landY,
            duration: cfg.duration,
            easing:   Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(rimAnims[i].rotate, {
            toValue:  1,
            duration: cfg.duration,
            easing:   Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      }, cfg.delay)
    );

    return () => timers.forEach(clearTimeout);
  }, [visible, cardTopY]);

  const cardRotate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-3deg', '0deg', '3deg'],
  });

  const toArabicNumerals = (n: number) =>
    String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)]);
  const displayCount   = langCode === 'ar' ? toArabicNumerals(streakCount) : String(streakCount);
  const copy           = STREAK_COPY[langCode] ?? 'Your streak is on fire';
  const headline       = `${displayCount} day streak!`;
  const confettiColors = FLAG_CONFETTI_COLORS[langCode] ?? DEFAULT_CONFETTI_COLORS;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
    >
      {/* ── Single full-screen tap target — any tap anywhere dismisses ── */}
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss}>
        {/* Backdrop + card — purely visual, no touch handling */}
        <View style={styles.backdrop} pointerEvents="none">
          <Animated.View
            style={[
              styles.card,
              { backgroundColor: colors.surface },
              { transform: [{ scale: scaleAnim }, { rotate: cardRotate }] },
            ]}
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

      {/* ── Rim pieces — settle on the card's top edge ── */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {rimBaseConfig.map((cfg, i) => {
          const pieceRotate = rimAnims[i].rotate.interpolate({
            inputRange:  [0, 1],
            outputRange: ['0deg', `${cfg.rotation}deg`],
          });
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                top:      0,
                left:     cfg.x,
                width:    cfg.w,
                height:   cfg.h,
                overflow: 'visible',
              }}
            >
              <Animated.View
                style={{
                  width:           cfg.w,
                  height:          cfg.h,
                  backgroundColor: confettiColors[cfg.colorIndex % confettiColors.length],
                  opacity:         rimAnims[i].opacity,
                  transform:       [{ translateY: rimAnims[i].y }, { rotate: pieceRotate }],
                }}
              />
            </View>
          );
        })}
      </View>

      {/* ── Front cannon (non-interactive) ── */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ConfettiCannon
          ref={frontRef}
          count={240}
          origin={{ x: SCREEN_WIDTH * 0.5, y: SCREEN_HEIGHT * 0.75 }}
          spread={140}
          colors={confettiColors}
          fallSpeed={2500}
          explosionSpeed={1300}
          fadeOut={false}
          autoStart={false}
        />
      </View>

      {/* ── Rain cannons — fall continuously from above the screen ── */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ConfettiCannon
          ref={rainLeftRef}
          count={55}
          origin={{ x: SCREEN_WIDTH * 0.2, y: -20 }}
          spread={30}
          colors={confettiColors}
          fallSpeed={4000}
          explosionSpeed={120}
          fadeOut={false}
          autoStart={false}
        />
        <ConfettiCannon
          ref={rainCenterRef}
          count={70}
          origin={{ x: SCREEN_WIDTH * 0.5, y: -20 }}
          spread={45}
          colors={confettiColors}
          fallSpeed={3800}
          explosionSpeed={110}
          fadeOut={false}
          autoStart={false}
        />
        <ConfettiCannon
          ref={rainRightRef}
          count={55}
          origin={{ x: SCREEN_WIDTH * 0.8, y: -20 }}
          spread={30}
          colors={confettiColors}
          fallSpeed={4000}
          explosionSpeed={120}
          fadeOut={false}
          autoStart={false}
        />
      </View>

      {/* ── All cannons in front of the card (non-interactive) ── */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ConfettiCannon
          ref={behindLeftRef}
          count={360}
          origin={{ x: SCREEN_WIDTH * 0.15, y: SCREEN_HEIGHT }}
          spread={160}
          colors={confettiColors}
          fallSpeed={2800}
          explosionSpeed={1500}
          fadeOut={false}
          autoStart={false}
        />
        <ConfettiCannon
          ref={behindCenterRef}
          count={360}
          origin={{ x: SCREEN_WIDTH * 0.5, y: SCREEN_HEIGHT }}
          spread={160}
          colors={confettiColors}
          fallSpeed={3000}
          explosionSpeed={1600}
          fadeOut={false}
          autoStart={false}
        />
        <ConfettiCannon
          ref={behindRightRef}
          count={360}
          origin={{ x: SCREEN_WIDTH * 0.85, y: SCREEN_HEIGHT }}
          spread={160}
          colors={confettiColors}
          fallSpeed={2800}
          explosionSpeed={1500}
          fadeOut={false}
          autoStart={false}
        />
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
