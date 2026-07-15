import React, { useRef, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated,
} from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useTheme } from '../hooks/useTheme';
import { Colors } from '../theme';

// Flag palette per language — falls back to app palette if not defined
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

export function StreakCelebrationModal({ visible, streakCount, langCode, onDismiss }: Props) {
  const { colors, fontFamily } = useTheme();
  // Back layer (behind card): two corner cannons
  const confettiBehindLeftRef  = useRef<ConfettiCannon>(null);
  const confettiBehindRightRef = useRef<ConfettiCannon>(null);
  // Front layer (in front of card): centre burst
  const confettiFrontLeftRef   = useRef<ConfettiCannon>(null);
  const confettiFrontRightRef  = useRef<ConfettiCannon>(null);
  const scaleAnim  = useRef(new Animated.Value(0.7)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.7);
      rotateAnim.setValue(0);

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1, tension: 200, friction: 6, useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(rotateAnim, { toValue: 1,    duration: 80, useNativeDriver: true }),
          Animated.timing(rotateAnim, { toValue: -1,   duration: 80, useNativeDriver: true }),
          Animated.timing(rotateAnim, { toValue: 0.5,  duration: 80, useNativeDriver: true }),
          Animated.timing(rotateAnim, { toValue: 0,    duration: 80, useNativeDriver: true }),
        ]),
      ]).start();

      const confettiTimer = setTimeout(() => {
        confettiBehindLeftRef.current?.start();
        confettiBehindRightRef.current?.start();
        confettiFrontLeftRef.current?.start();
        confettiFrontRightRef.current?.start();
      }, 100);

      // Don't auto-dismiss — user taps to close so confetti stays visible
      return () => clearTimeout(confettiTimer);
    }
  }, [visible]);

  const rotate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-3deg', '0deg', '3deg'],
  });

  const toArabicNumerals = (n: number) =>
    String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)]);
  const displayCount = langCode === 'ar' ? toArabicNumerals(streakCount) : String(streakCount);
  const copy = STREAK_COPY[langCode] ?? 'Your streak is on fire';
  const headline = `${displayCount} day streak!`;
  const confettiColors = FLAG_CONFETTI_COLORS[langCode] ?? DEFAULT_CONFETTI_COLORS;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
    >
      {/* ── Back confetti layer (behind card) ── */}
      <ConfettiCannon
        ref={confettiBehindLeftRef}
        count={120}
        origin={{ x: -10, y: -200 }}
        spread={90}
        colors={confettiColors}
        fallSpeed={3800}
        autoStart={false}
        explosionSpeed={600}
      />
      <ConfettiCannon
        ref={confettiBehindRightRef}
        count={120}
        origin={{ x: SCREEN_WIDTH + 10, y: -200 }}
        spread={90}
        colors={confettiColors}
        fallSpeed={3800}
        autoStart={false}
        explosionSpeed={600}
      />

      {/* ── Card (sits between the two confetti layers) ── */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: colors.surface },
            { transform: [{ scale: scaleAnim }, { rotate }] },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.flame}>🔥</Text>
          <Text style={[styles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            {headline}
          </Text>
          <Text style={[styles.subtext, { color: colors.inkLight, fontFamily: fontFamily.italic }]}>
            {copy}
          </Text>
        </Animated.View>
      </TouchableOpacity>

      {/* ── Front confetti layer (in front of card) ── */}
      <ConfettiCannon
        ref={confettiFrontLeftRef}
        count={80}
        origin={{ x: SCREEN_WIDTH * 0.25, y: -100 }}
        spread={60}
        colors={confettiColors}
        fallSpeed={3200}
        autoStart={false}
        explosionSpeed={400}
      />
      <ConfettiCannon
        ref={confettiFrontRightRef}
        count={80}
        origin={{ x: SCREEN_WIDTH * 0.75, y: -100 }}
        spread={60}
        colors={confettiColors}
        fallSpeed={3200}
        autoStart={false}
        explosionSpeed={400}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.30)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 16,
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
