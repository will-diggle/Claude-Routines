import React, { useRef, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated,
} from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useTheme } from '../hooks/useTheme';
import { Colors } from '../theme';

const CONFETTI_COLORS = [Colors.cream, Colors.navyBg, Colors.accentGold, Colors.accentRed, '#C8C4BC'];
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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

export function StreakCelebrationModal({ visible, streakCount, langCode, onDismiss }: Props) {
  const { colors, fontFamily } = useTheme();
  const confettiRef = useRef<ConfettiCannon>(null);
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

      const confettiTimer = setTimeout(() => confettiRef.current?.start(), 100);
      const dismissTimer = setTimeout(onDismiss, 4000);
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
        ref={confettiRef}
        count={80}
        origin={{ x: Dimensions.get('window').width / 2, y: -20 }}
        colors={CONFETTI_COLORS}
        fallSpeed={2500}
        fadeOut
        autoStart={false}
        explosionSpeed={350}
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
