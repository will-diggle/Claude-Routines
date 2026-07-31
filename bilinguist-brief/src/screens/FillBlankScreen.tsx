import { SpringButton } from '../components/SpringButton';
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, Keyboard, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useShallow } from 'zustand/react/shallow';
import { useWordBankStore, type SavedWord } from '../store/useWordBankStore';
import { useStreakStore } from '../store/useStreakStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTheme } from '../hooks/useTheme';
import { GameHeader } from '../components/GameHeader';
import { Spacing } from '../theme';
import { useGameActive } from '../hooks/useGameActive';
import { getCongratsLines } from '../utils/congrats';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import * as analytics from '../services/analytics';

const SCREEN_W = Dimensions.get('window').width;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function blankSentence(sentence: string, word: string): string {
  const re = new RegExp(`\\b${word}\\b`, 'i');
  if (re.test(sentence)) return sentence.replace(re, '___');
  const lower = sentence.toLowerCase();
  const idx = lower.indexOf(word.toLowerCase());
  if (idx === -1) return sentence + ' (___) ';
  return sentence.slice(0, idx) + '___' + sentence.slice(idx + word.length);
}

function normalize(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Shared card shadow — matches Flashcard / word detail tiles
const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.11,
  shadowRadius: 10,
  elevation: 6,
} as const;

export function FillBlankScreen() {
  const { colors, fontFamily, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PracticeStackParamList, 'FillBlank'>>();
  const langFilter = route.params?.language;
  const { words, recordPractice } = useWordBankStore();
  const { recordSession, streak } = useStreakStore();
  const activeLanguages = useSettingsStore(useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const congratsLines = useMemo(() => getCongratsLines(activeLanguages), []);
  useGameActive();
  useFocusEffect(useCallback(() => {
    analytics.trackGameOpened('fill_blank', langFilter ?? 'all');
  }, [langFilter]));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const eligible = useMemo(() => {
    const pool = langFilter && langFilter !== 'all' ? words.filter((w) => w.language === langFilter) : words;
    return shuffle(pool.filter((w) => w.originalSentence && w.originalSentence.toLowerCase().includes(w.word.toLowerCase()))).slice(0, 10);
  }, []);

  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [results, setResults] = useState<Array<'correct' | 'wrong'>>([]);

  if (eligible.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        <GameHeader title="Fill in the Blank" current={0} total={0} />
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            No sentences available yet. Save words from your briefing to unlock this game.
          </Text>
        </View>
      </View>
    );
  }

  const card: SavedWord = eligible[index];
  const blanked = blankSentence(card.originalSentence, card.word);

  if (done) {
    const isPerfect = correct === eligible.length && eligible.length > 0;
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <GameHeader title="Fill in the Blank" current={eligible.length} total={eligible.length} results={results} />
        {isPerfect && (
          <ConfettiCannon count={180} origin={{ x: SCREEN_W / 2, y: -20 }} autoStart fadeOut fallSpeed={2800} />
        )}
        <View style={styles.center}>
          <Ionicons name="pencil-outline" size={48} color={colors.accentRed} />
          {isPerfect && congratsLines.map((line, i) => (
            <Text key={i} style={[styles.congratsLine, { color: colors.accentRed, fontFamily: i === 0 ? fontFamily.bold : fontFamily.italic }]}>
              {line}
            </Text>
          ))}
          <Text style={[styles.doneTitle, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            {correct}/{eligible.length} correct
          </Text>
          <Text style={[styles.streakText, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>{streak} day streak</Text>
          <SpringButton style={[styles.doneButton, { backgroundColor: colors.accentRed }]} onPress={() => navigation.goBack()}>
            <Text style={[styles.doneButtonText, { fontFamily: fontFamily.regular }]}>Back to practise</Text>
          </SpringButton>
        </View>
      </View>
    );
  }

  function handleCheck() {
    Keyboard.dismiss();
    const right = normalize(input) === normalize(card.word);
    setIsCorrect(right);
    setChecked(true);
    recordPractice(card.id, right);
    if (right) setCorrect((c) => c + 1);
  }

  function handleNext() {
    setResults((r) => [...r, isCorrect ? 'correct' : 'wrong']);
    if (index + 1 >= eligible.length) {
      recordSession();
      analytics.trackGameCompleted('fill_blank', langFilter ?? 'all', correct);
      setDone(true);
    } else {
      setIndex(index + 1);
      setInput('');
      setChecked(false);
      setHintVisible(false);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <GameHeader title="Fill in the Blank" current={index + 1} total={eligible.length} results={results} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.instruction, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
          Complete the sentence with the missing word
        </Text>

        {/* Sentence card — same tile style as the rest of the app */}
        <View style={[styles.sentenceBox, {
          backgroundColor: colors.card,
          borderColor: colors.borderLight,
          ...CARD_SHADOW,
        }]}>
          {blanked.split('___').map((part, i, arr) => (
            <React.Fragment key={i}>
              <Text style={[styles.sentenceText, { color: colors.inkMid, fontFamily: fontFamily.italic, fontSize: fontSize.body }]}>
                {part}
              </Text>
              {i < arr.length - 1 && (
                <Text style={[styles.blank, {
                  color: checked
                    ? (isCorrect ? '#43A047' : '#E53935')
                    : colors.accentRed,
                  borderBottomColor: checked
                    ? (isCorrect ? '#43A047' : '#E53935')
                    : colors.accentRed,
                  fontFamily: fontFamily.bold,
                }]}>
                  {checked ? card.word : '________'}
                </Text>
              )}
            </React.Fragment>
          ))}
        </View>

        {card.translation ? (
          <SpringButton
            style={[styles.hintButton, { borderColor: colors.borderMid, backgroundColor: colors.card, ...CARD_SHADOW }]}
            onPress={() => setHintVisible((v) => !v)}
           
          >
            <Ionicons name="bulb-outline" size={14} color={colors.inkFaint} />
            <Text style={[styles.hint, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              {hintVisible ? `"${card.translation}"` : 'Hint'}
            </Text>
          </SpringButton>
        ) : null}

        {!checked ? (
          <TextInput
            style={[styles.input, {
              color: colors.inkDark,
              borderColor: colors.borderMid,
              fontFamily: fontFamily.regular,
              backgroundColor: colors.card,
              fontSize: fontSize.body,
              ...CARD_SHADOW,
            }]}
            value={input}
            onChangeText={setInput}
            placeholder="Type the missing word…"
            placeholderTextColor={colors.inkFaint}
            autoCorrect={false}
            autoCapitalize="none"
            onSubmitEditing={handleCheck}
          />
        ) : (
          <View style={[styles.result, {
            backgroundColor: isCorrect ? '#43A04715' : '#E5393515',
            borderColor: isCorrect ? '#43A047' : '#E53935',
            ...CARD_SHADOW,
          }]}>
            <Text style={[styles.resultText, { color: isCorrect ? '#43A047' : '#E53935', fontFamily: fontFamily.bold }]}>
              {isCorrect ? 'Correct!' : `The answer was: ${card.word}`}
            </Text>
          </View>
        )}

        <SpringButton
          style={[styles.actionButton, {
            backgroundColor: !input.trim() && !checked ? colors.borderMid : colors.accentRed,
          }]}
          onPress={checked ? handleNext : handleCheck}
          disabled={!checked && !input.trim()}
         
        >
          <Text style={[styles.actionButtonText, { fontFamily: fontFamily.regular }]}>
            {checked
              ? (index + 1 >= eligible.length ? 'Finish' : 'Next')
              : 'Check'}
          </Text>
        </SpringButton>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 24 },
  content: { padding: Spacing.md, gap: Spacing.md },
  instruction: { fontSize: 13, letterSpacing: 0.3, textAlign: 'center' },

  sentenceBox: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.xl,
    paddingVertical: 28,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 2,
  },
  sentenceText: { lineHeight: 30 },
  blank: {
    borderBottomWidth: 2,
    paddingHorizontal: 4,
    fontSize: 17,
    lineHeight: 30,
    letterSpacing: 1,
  },

  hintButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  hint: { fontSize: 13, fontStyle: 'italic' },

  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: Spacing.md,
    paddingVertical: 16,
    fontSize: 17,
  },

  result: {
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  resultText: { fontSize: 15 },

  actionButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  actionButtonText: { color: '#FFF', fontSize: 16 },

  doneTitle: { textAlign: 'center' },
  streakText: { fontSize: 20 },
  doneButton: { borderRadius: 12, paddingHorizontal: Spacing.xxl, paddingVertical: 14 },
  doneButtonText: { color: '#FFF', fontSize: 16 },
  congratsLine: { fontSize: 18, letterSpacing: 0.5 },
});
