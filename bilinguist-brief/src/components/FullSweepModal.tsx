import React, { useRef, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions,
} from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useTheme } from '../hooks/useTheme';
import { Colors } from '../theme';

const CONFETTI_COLORS = [Colors.cream, Colors.navyBg, Colors.accentGold, Colors.accentRed, '#C8C4BC', '#FDFCFB'];

const LANG_FLAGS: Record<string, string> = {
  en: '🇬🇧', fr: '🇫🇷', de: '🇩🇪', sv: '🇸🇪', it: '🇮🇹', es: '🇪🇸', tr: '🇹🇷',
};
const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', de: 'German', sv: 'Swedish',
  it: 'Italian', es: 'Spanish', tr: 'Turkish',
};

interface Props {
  visible: boolean;
  langCodes: string[];
  onDismiss: () => void;
}

export function FullSweepModal({ visible, langCodes, onDismiss }: Props) {
  const { colors, fontFamily } = useTheme();
  const confettiRef = useRef<ConfettiCannon>(null);

  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => confettiRef.current?.start(), 100);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const langList = langCodes.map(c => LANG_NAMES[c] ?? c);
  const last = langList.pop();
  const subtext = langList.length > 0
    ? `You've read today's brief in ${langList.join(', ')} and ${last}. Impressive.`
    : `You've read today's brief in ${last}. Impressive.`;

  const flags = langCodes.map(c => LANG_FLAGS[c] ?? '🌐').join('  ');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={styles.flags}>{flags}</Text>
          <Text style={[styles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            Full sweep!
          </Text>
          <Text style={[styles.subtext, { color: colors.inkLight, fontFamily: fontFamily.italic }]}>
            {subtext}
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.inkDark }]}
            onPress={onDismiss}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonText, { color: colors.surface, fontFamily: fontFamily.bold }]}>
              That's my daily dose
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <ConfettiCannon
        ref={confettiRef}
        count={160}
        origin={{ x: Dimensions.get('window').width / 2, y: -20 }}
        colors={CONFETTI_COLORS}
        fallSpeed={2800}
        fadeOut
        autoStart={false}
        explosionSpeed={400}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.60)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    paddingVertical: 44,
    paddingHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 12,
  },
  flags: {
    fontSize: 30,
    marginBottom: 18,
    letterSpacing: 4,
  },
  headline: {
    fontSize: 32,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtext: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 36,
    borderRadius: 10,
  },
  buttonText: {
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
