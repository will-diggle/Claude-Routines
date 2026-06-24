import React, { useRef, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions,
} from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useTheme } from '../hooks/useTheme';
import { Colors } from '../theme';

const CONFETTI_COLORS = [Colors.cream, Colors.navyBg, Colors.accentGold, Colors.accentRed, '#C8C4BC'];
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const STREAK_COPY: Record<string, string> = {
  en: 'Your English streak is on fire',
  fr: 'Your French streak is on fire',
  de: 'Your German streak is on fire',
  sv: 'Your Swedish streak is on fire',
  it: 'Your Italian streak is on fire',
  es: 'Your Spanish streak is on fire',
  tr: 'Your Turkish streak is on fire',
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

  useEffect(() => {
    if (visible) {
      // Small delay so the modal is fully rendered before confetti fires
      const t = setTimeout(() => confettiRef.current?.start(), 100);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const copy = STREAK_COPY[langCode] ?? 'Your streak is on fire';
  const headline = streakCount === 1 ? '1 day streak!' : `${streakCount} day streak!`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={styles.flame}>🔥</Text>
          <Text style={[styles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            {headline}
          </Text>
          <Text style={[styles.subtext, { color: colors.inkLight, fontFamily: fontFamily.italic }]}>
            {copy}
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.inkDark }]}
            onPress={onDismiss}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonText, { color: colors.surface, fontFamily: fontFamily.bold }]}>
              Keep it up
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {/* Confetti fires from top-centre */}
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
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
    marginBottom: 28,
    lineHeight: 22,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  buttonText: {
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
