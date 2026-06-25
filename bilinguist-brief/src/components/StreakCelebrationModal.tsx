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

  useEffect(() => {
    if (visible) {
      const confettiTimer = setTimeout(() => confettiRef.current?.start(), 100);
      const dismissTimer = setTimeout(onDismiss, 4000);
      return () => {
        clearTimeout(confettiTimer);
        clearTimeout(dismissTimer);
      };
    }
  }, [visible, onDismiss]);

  const copy = STREAK_COPY[langCode] ?? 'Your streak is on fire';
  const headline = streakCount === 1 ? '1 day streak!' : `${streakCount} day streak!`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
        <View style={[styles.card, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
          <Text style={styles.flame}>🔥</Text>
          <Text style={[styles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            {headline}
          </Text>
          <Text style={[styles.subtext, { color: colors.inkLight, fontFamily: fontFamily.italic }]}>
            {copy}
          </Text>
        </View>
      </TouchableOpacity>
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
    opacity: 0.92,
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
    lineHeight: 22,
  },
});
