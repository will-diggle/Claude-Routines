import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWordBankStore, type SavedWord } from '../store/useWordBankStore';
import { useStreakStore } from '../store/useStreakStore';
import { useTheme } from '../hooks/useTheme';
import { GameHeader } from '../components/GameHeader';
import { WordAudioButton } from '../components/WordAudioButton';
import { Spacing } from '../theme';
import type { LanguageCode } from '../store/useSettingsStore';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';

const MIN_WORDS = 4;
const MAX_QUESTIONS = 15;

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

export function MultipleChoiceScreen() {
  const { colors, fontFamily, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PracticeStackParamList, 'MultipleChoice'>>();
  const langFilter = route.params?.language;
  const { words, recordPractice } = useWordBankStore();
  const { recordSession, streak } = useStreakStore();

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
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <GameHeader title="Multiple Choice" current={questions.length} total={questions.length} />
        <View style={styles.center}>
          <Ionicons name="checkmark-done-outline" size={48} color={colors.accentGold} />
          <Text style={[styles.doneTitle, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            {correct}/{questions.length} correct
          </Text>
          <Text style={[styles.streakText, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>
            {streak} day streak
          </Text>
          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: colors.accentGold }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.doneButtonText, { fontFamily: fontFamily.regular }]}>Back to practice</Text>
          </TouchableOpacity>
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
      setDone(true);
    } else {
      setIndex(index + 1);
      setSelected(null);
    }
  }

  function optionStyle(i: number) {
    if (selected === null) return [styles.option, { borderColor: colors.borderMid, backgroundColor: colors.card }];
    if (i === q.correctIndex) return [styles.option, { borderColor: '#43A047', backgroundColor: '#43A04715' }];
    if (i === selected && selected !== q.correctIndex) return [styles.option, { borderColor: '#E53935', backgroundColor: '#E5393515' }];
    return [styles.option, { borderColor: colors.borderLight, backgroundColor: colors.card, opacity: 0.5 }];
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <GameHeader title="Multiple Choice" current={index + 1} total={questions.length} />

      <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={[styles.questionBox, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
          <Text style={[styles.questionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            What is the meaning of
          </Text>
          <View style={styles.questionWordRow}>
            <Text style={[styles.questionWord, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
              {q.word.word}
            </Text>
            <WordAudioButton word={q.word.word} language={q.word.language as LanguageCode} size="sm" />
          </View>
          <Text style={[styles.questionLang, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            {q.word.language.toUpperCase()}
          </Text>
        </View>

        <View style={styles.options}>
          {q.options.map((opt, i) => (
            <TouchableOpacity key={i} style={optionStyle(i)} onPress={() => handleSelect(i)}>
              <Text style={[styles.optionLetter, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                {['A', 'B', 'C', 'D'][i]}
              </Text>
              <Text style={[styles.optionText, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selected !== null && (
          <TouchableOpacity
            style={[styles.nextButton, { backgroundColor: colors.accentGold }]}
            onPress={handleNext}
          >
            <Text style={[styles.nextButtonText, { fontFamily: fontFamily.regular }]}>
              {index + 1 >= questions.length ? 'Finish' : 'Next'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 24 },
  content: { flex: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, gap: Spacing.md },
  questionBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  questionLabel: { fontSize: 13 },
  questionWordRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  questionWord: { lineHeight: 44, textAlign: 'center' },
  questionLang: { fontSize: 11, letterSpacing: 1.5 },
  options: { gap: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  optionLetter: { fontSize: 13, width: 20, textAlign: 'center' },
  optionText: { flex: 1, lineHeight: 22 },
  nextButton: { borderRadius: 8, padding: 14, alignItems: 'center', marginTop: Spacing.sm },
  nextButtonText: { color: '#FFF', fontSize: 16 },
  doneTitle: { textAlign: 'center' },
  streakText: { fontSize: 20 },
  doneButton: { borderRadius: 8, paddingHorizontal: Spacing.xxl, paddingVertical: 14 },
  doneButtonText: { color: '#FFF', fontSize: 16 },
});
