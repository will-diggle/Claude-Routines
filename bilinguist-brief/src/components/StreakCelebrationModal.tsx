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
  const confettiLeftRef = useRef<ConfettiCannon>(null);
  const confettiRightRef = useRef<ConfettiCannon>(null);
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.7);
      rotateAnim.setValue(0);

      // Spring in with a slight jiggle
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 200,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(rotateAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.timing(rotateAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
          Animated.timing(rotateAnim, { toValue: 0.5, duration: 80, useNativeDriver: true }),
          Animated.timing(rotateAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
        ]),
      ]).start();

      const confettiTimer = setTimeout(() => {
        confettiLeftRef.current?.start();
        confettiRightRef.current?.start();
      }, 100);
      const dismissTimer = setTimeout(onDismiss, 5000);
      return () => {
        clearTimeout(confettiTimer);
        clearTimeout(dismissTimer);
      };
    }
  }, [visible, onDismiss]);

  const rotate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-3deg', '0deg', '3deg'],
  });

  const toArabicNumerals = (n: number) =>
    String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)]);
  const displayCount = langCode === 'ar' ? toArabicNumerals(streakCount) : String(streakCount);

  const copy = STREAK_COPY[langCode] ?? 'Your streak is on fire';
  const headline = streakCount === 1 ? `${displayCount} day streak!` : `${displayCount} day streak!`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
    >
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
      <ConfettiCannon
        ref={confettiLeftRef}
        count={100}
        origin={{ x: -10, y: -60 }}
        spread={70}
        colors={FLAG_CONFETTI_COLORS[langCode] ?? DEFAULT_CONFETTI_COLORS}
        fallSpeed={3200}
        fadeOut
        autoStart={false}
        explosionSpeed={500}
      />
      <ConfettiCannon
        ref={confettiRightRef}
        count={100}
        origin={{ x: SCREEN_WIDTH + 10, y: -60 }}
        spread={70}
        colors={FLAG_CONFETTI_COLORS[langCode] ?? DEFAULT_CONFETTI_COLORS}
        fallSpeed={3200}
        fadeOut
        autoStart={false}
        explosionSpeed={500}
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
