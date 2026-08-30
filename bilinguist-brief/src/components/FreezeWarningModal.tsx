import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView,
} from 'react-native';
import { FlagCircle } from './FlagCircle';
import { useTheme } from '../hooks/useTheme';

const FREEZE_BLUE = '#60A5FA';

export interface FrozenLang {
  code: string;
  nativeName: string;
  streak: number;
}

interface Props {
  visible: boolean;
  langs: FrozenLang[];
  onDismiss: () => void;
}

export function FreezeWarningModal({ visible, langs, onDismiss }: Props) {
  const { colors, fontFamily } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.88);
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 200,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, scaleAnim]);

  if (langs.length === 0) return null;

  const langNames = langs.map(l => l.nativeName);
  const forLine = langNames.length === 1
    ? langNames[0]
    : langNames.length === 2
      ? `${langNames[0]} & ${langNames[1]}`
      : `${langNames.slice(0, -1).join(', ')} & ${langNames[langNames.length - 1]}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
        <Animated.View
          style={[styles.card, { backgroundColor: colors.surface, transform: [{ scale: scaleAnim }] }]}
          onStartShouldSetResponder={() => true}
        >
          <Text style={[styles.freezeIcon, { fontSize: 48 }]}>❄️</Text>

          <Text style={[styles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            Don't lose your streak!
          </Text>

          <Text style={[styles.subtext, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
            A freeze is protecting your {forLine} {langs.length === 1 ? 'streak' : 'streaks'} today.
            Read before midnight to keep {langs.length === 1 ? 'it' : 'them'} going.
          </Text>

          {/* Language cards — flag on top, streak below */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.langRow}
            style={styles.langScroll}
          >
            {langs.map(lang => (
              <View key={lang.code} style={[styles.langCard, { borderColor: colors.borderLight }]}>
                <FlagCircle code={lang.code} size={28} />
                <Text style={[styles.langStreakNum, { color: FREEZE_BLUE, fontFamily: fontFamily.bold }]}>
                  {lang.streak}
                </Text>
                <Text style={[styles.langStreakUnit, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  {lang.streak === 1 ? 'day' : 'days'}
                </Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: FREEZE_BLUE }]}
            onPress={onDismiss}
            activeOpacity={0.82}
          >
            <Text style={[styles.buttonText, { fontFamily: fontFamily.bold }]}>Got it</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.32)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    paddingTop: 30,
    paddingBottom: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.20,
    shadowRadius: 24,
    elevation: 16,
  },
  freezeIcon: {
    marginBottom: 12,
  },
  headline: {
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  langScroll: {
    width: '100%',
    marginBottom: 20,
  },
  langRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 2,
    justifyContent: 'center',
    flexGrow: 1,
  },
  langCard: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    minWidth: 72,
  },
  langStreakNum: {
    fontSize: 24,
    lineHeight: 28,
    marginTop: 6,
  },
  langStreakUnit: {
    fontSize: 11,
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});
