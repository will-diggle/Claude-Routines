import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { SpringButton } from '../components/SpringButton';
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
import { WordAudioButton } from '../components/WordAudioButton';
import { Spacing } from '../theme';
import { useNavPillStore } from '../store/useNavPillStore';
import { getCongratsLines } from '../utils/congrats';
import type { LanguageCode } from '../store/useSettingsStore';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import * as analytics from '../services/analytics';

const SCREEN_W = Dimensions.get('window').width;

const MIN_WORDS = 4;
const MAX_QUESTIONS = 10;

interface Question {
  word: SavedWord;
  options: string[];
  correctIndex: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(words: SavedWord[]): Question[] {
  const practiceable = words.filter((w) => w.translation);
  if (practiceable.length < MIN_WORDS) return [];

  const picked = shuffle(practiceable).slice(0, MAX_QUESTIONS);

  return picked.map((word) => {
    const distractors = shuffle(practiceable.filter((w) => w.id !== word.id))
      .slice(0, 3)
      .map((w) => w.translation);

    const allOptions = shuffle([word.translation, ...distractors]);
    const correctIndex = allOptions.indexOf(word.translation);

    return { word, options: allOptions, correctIndex };
  });
}

// Shared card shadow style — matches Flashcard / word detail tiles
const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.11,
  shadowRadius: 10,
  elevation: 6,
} as const;

export function MultipleChoiceScreen() {
  const { colors, fontFamily, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const setGameActive = useNavPillStore((s) => s.setGameActive);
  useFocusEffect(useCallback(() => {
    setGameActive(true);
    return () => setGameActive(false);
  }, [setGameActive]));
  const route = useRoute<RouteProp<PracticeStackParamList, 'MultipleChoice'>>();
  const langFilter = route.params?.language;
  useFocusEffect(useCallback(() => {
    analytics.trackGameOpened('multiple_choice', langFilter ?? 'all');
  }, [langFilter]));
  const { words, recordPractice } = useWordBankStore();
  const { recordSession, streak } = useStreakStore();
  const activeLanguages = useSettingsStore(useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const congratsLines = useMemo(() => getCongratsLines(activeLanguages), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const questions = useMemo(() => {
    const pool = langFilter && langFilter !== 'all' ? words.filter((w) => w.language === langFilter) : words;
    return buildQuestions(pool);
  }, []);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  const eligibleCount = (langFilter && langFilter !== 'all'
    ? words.filter((w) => w.language === langFilter && w.translation)
    : words.filter((w) => w.translation)
  ).length;

  if (eligibleCount < MIN_WORDS) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        <GameHeader title="Multiple Choice" current={0} total={0} />
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            Save at least {MIN_WORDS} words with translations to play Multiple Choice.
          </Text>
        </View>
      </View>
    );
  }

  const q = questions[index];

  if (done) {
    const isPerfect = correct === questions.length && questions.length > 0;
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <GameHeader title="Multiple Choice" current={questions.length} total={questions.length} />
        {isPerfect && (
          <ConfettiCannon count={180} origin={{ x: SCREEN_W / 2, y: -20 }} autoStart fadeOut fallSpeed={2800} />
        )}
        <View style={styles.center}>
          <Ionicons name="checkmark-done-outline" size={48} color={colors.accentRed} />
          {isPerfect && congratsLines.map((line, i) => (
            <Text key={i} style={[styles.congratsLine, { color: colors.accentRed, fontFamily: i === 0 ? fontFamily.bold : fontFamily.italic }]}>
              {line}
            </Text>
          ))}
          <Text style={[styles.doneTitle, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            {correct}/{questions.length} correct
          </Text>
          <Text style={[styles.streakText, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>
            {streak} day streak
          </Text>
          <SpringButton
            style={[styles.doneButton, { backgroundColor: colors.accentRed }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.doneButtonText, { fontFamily: fontFamily.regular }]}>Back to practise</Text>
          </SpringButton>
        </View>
      </View>
    );
  }

  function handleSelect(optionIndex: number) {
    if (selected !== null) return;
    setSelected(optionIndex);
    const isCorrect = optionIndex === q.correctIndex;
    recordPractice(q.word.id, isCorrect);
    if (isCorrect) setCorrect((c) => c + 1);
  }

  function handleNext() {
    if (index + 1 >= questions.length) {
      recordSession();
      analytics.trackGameCompleted('multiple_choice', langFilter ?? 'all', correct + (selected === q.correctIndex ? 1 : 0));
      setDone(true);
    } else {
      setIndex(index + 1);
      setSelected(null);
    }
  }

  function optionStyle(i: number) {
    const base = [styles.option, { backgroundColor: colors.card, borderColor: colors.borderLight }] as any[];
    if (selected === null) return base;
    if (i === q.correctIndex) return [...base, { borderColor: '#43A047', backgroundColor: '#43A04715', borderWidth: 1.5 }];
    if (i === selected && selected !== q.correctIndex) return [...base, { borderColor: '#E53935', backgroundColor: '#E5393515', borderWidth: 1.5 }];
    return [...base, { opacity: 0.42 }];
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <GameHeader title="Multiple Choice" current={index + 1} total={questions.length} />

      <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {/* Question tile — grows to fill available space */}
        <View style={[styles.questionBox, {
          backgroundColor: colors.card,
          borderColor: colors.borderLight,
          ...CARD_SHADOW,
        }]}>
          <Text style={[styles.questionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            What is the meaning of
          </Text>
          <View style={styles.questionWordRow}>
            <Text style={[styles.questionWord, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
              {q.word.word}
            </Text>
            <WordAudioButton word={q.word.word} language={q.word.language as LanguageCode} size="sm" />
          </View>
          <Text style={[styles.questionLang, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
            {q.word.language.toUpperCase()}
          </Text>
        </View>

        {/* Options */}
        <View style={styles.options}>
          {q.options.map((opt, i) => (
            <SpringButton
              key={i}
              style={optionStyle(i)}
              onPress={() => handleSelect(i)}
              glass
              cornerRadius={12}
            >
              <Text style={[styles.optionLetter, {
                color: selected !== null && i === q.correctIndex ? '#43A047'
                  : selected !== null && i === selected ? '#E53935'
                  : colors.accentRed,
                fontFamily: fontFamily.bold,
              }]}>
                {['A', 'B', 'C', 'D'][i]}
              </Text>
              <Text style={[styles.optionText, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                {opt}
              </Text>
              {selected !== null && i === q.correctIndex && (
                <Ionicons name="checkmark-circle" size={18} color="#43A047" />
              )}
              {selected !== null && i === selected && selected !== q.correctIndex && (
                <Ionicons name="close-circle" size={18} color="#E53935" />
              )}
            </SpringButton>
          ))}
        </View>

        {selected !== null && (
          <SpringButton
            style={[styles.nextButton, { backgroundColor: colors.accentRed }]}
            onPress={handleNext}
            glass
            cornerRadius={14}
            haptic="medium"
          >
            <Text style={[styles.nextButtonText, { fontFamily: fontFamily.regular }]}>
              {index + 1 >= questions.length ? 'Finish' : 'Next'}
            </Text>
          </SpringButton>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 24 },

  // Full-screen layout: column with question box growing + options pinned to bottom
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },

  questionBox: {
    flex: 1,                         // ← fills available vertical space
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',        // centre content vertically in the tall box
    gap: Spacing.sm,
  },
  questionLabel: { fontSize: 13, letterSpacing: 0.2 },
  questionWordRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: Spacing.sm },
  questionWord: { lineHeight: 44, textAlign: 'center' },
  questionLang: { fontSize: 11, letterSpacing: 1.5 },

  options: { gap: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 4,
  },
  optionLetter: { fontSize: 13, width: 22, textAlign: 'center' },
  optionText: { flex: 1, lineHeight: 22 },

  nextButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  nextButtonText: { color: '#FFF', fontSize: 16 },

  doneTitle: { textAlign: 'center' },
  streakText: { fontSize: 20 },
  doneButton: { borderRadius: 12, paddingHorizontal: Spacing.xxl, paddingVertical: 14 },
  doneButtonText: { color: '#FFF', fontSize: 16 },
  congratsLine: { fontSize: 18, letterSpacing: 0.5 },
});
