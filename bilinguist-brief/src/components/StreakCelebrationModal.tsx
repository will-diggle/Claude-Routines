import React, { useRef, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Rain loops every 4.5 s — long enough for pieces to fully fall off-screen
const RAIN_INTERVAL_MS = 4500;

export function StreakCelebrationModal({ visible, streakCount, langCode, onDismiss }: Props) {
  const { colors, fontFamily } = useTheme();

  const rainLeftRef   = useRef<any>(null);
  const rainCenterRef = useRef<any>(null);
  const rainRightRef  = useRef<any>(null);

  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const rainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) return;

    scaleAnim.setValue(0.7);
    Animated.spring(scaleAnim, {
      toValue: 1, tension: 180, friction: 7, useNativeDriver: true,
    }).start();

    const startRain = () => {
      rainLeftRef.current?.start();
      rainCenterRef.current?.start();
      rainRightRef.current?.start();
    };

    // First batch right away, then loop
    const firstTimer = setTimeout(startRain, 200);
    rainIntervalRef.current = setInterval(startRain, RAIN_INTERVAL_MS);

    return () => {
      clearTimeout(firstTimer);
      if (rainIntervalRef.current) clearInterval(rainIntervalRef.current);
    };
  }, [visible]);

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
      {/* Full-screen tap dismisses */}
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss}>
        <View style={styles.backdrop} pointerEvents="none">
          <Animated.View
            style={[styles.card, { backgroundColor: colors.surface, transform: [{ scale: scaleAnim }] }]}
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

      {/* Gentle rain — 3 origins spread across top, 20 pieces each = 60 total per cycle */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ConfettiCannon
          ref={rainLeftRef}
          count={20}
          origin={{ x: SCREEN_WIDTH * 0.15, y: -40 }}
          spread={70}
          colors={confettiColors}
          fallSpeed={4200}
          explosionSpeed={180}
          fadeOut={false}
          autoStart={false}
        />
        <ConfettiCannon
          ref={rainCenterRef}
          count={20}
          origin={{ x: SCREEN_WIDTH * 0.5, y: -40 }}
          spread={90}
          colors={confettiColors}
          fallSpeed={4000}
          explosionSpeed={160}
          fadeOut={false}
          autoStart={false}
        />
        <ConfettiCannon
          ref={rainRightRef}
          count={20}
          origin={{ x: SCREEN_WIDTH * 0.85, y: -40 }}
          spread={70}
          colors={confettiColors}
          fallSpeed={4200}
          explosionSpeed={180}
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
