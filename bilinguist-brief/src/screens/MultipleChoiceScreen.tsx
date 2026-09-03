import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView } from 'react-native';
import { SpringButton } from '../components/SpringButton';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useWordBankStore, type SavedWord } from '../store/useWordBankStore';
import { useStreakStore } from '../store/useStreakStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTheme } from '../hooks/useTheme';
import { GameHeader } from '../components/GameHeader';
import { GameEndScreen } from '../components/GameEndScreen';
import { GameSettingsSheet, DEFAULT_GAME_SETTINGS, type GameSettings } from '../components/GameSettingsSheet';
import { WordAudioButton } from '../components/WordAudioButton';
import { Spacing } from '../theme';
import { useGameActive } from '../hooks/useGameActive';
import type { LanguageCode } from '../store/useSettingsStore';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import * as analytics from '../services/analytics';

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

function buildQuestions(words: SavedWord[], direction: 'word-to-translation' | 'translation-to-word'): Question[] {
  const practiceable = words.filter((w) => w.translation);
  if (practiceable.length < MIN_WORDS) return [];

  const picked = shuffle(practiceable).slice(0, MAX_QUESTIONS);

  return picked.map((word) => {
    if (direction === 'translation-to-word') {
      const distractors = shuffle(practiceable.filter((w) => w.id !== word.id)).slice(0, 3).map((w) => w.word);
      const allOptions = shuffle([word.word, ...distractors]);
      return { word, options: allOptions, correctIndex: allOptions.indexOf(word.word) };
    } else {
      const distractors = shuffle(practiceable.filter((w) => w.id !== word.id)).slice(0, 3).map((w) => w.translation!);
      const allOptions = shuffle([word.translation!, ...distractors]);
      return { word, options: allOptions, correctIndex: allOptions.indexOf(word.translation!) };
    }
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
  useGameActive();
  const route = useRoute<RouteProp<PracticeStackParamList, 'MultipleChoice'>>();
  const langFilter = route.params?.language;
  useFocusEffect(useCallback(() => {
    analytics.trackGameOpened('multiple_choice', langFilter ?? 'all');
  }, [langFilter]));
  const { words, recordPractice } = useWordBankStore();
  const { recordSession } = useStreakStore();

  const [gameSettings, setGameSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [settingsVisible, setSettingsVisible] = useState(false);

  // A callable builder rather than a frozen memo — buildQuestions is already
  // pure and pulls fresh wrong-answer options each time, so Play Again gets a
  // genuinely new round rather than replaying the same questions.
  const buildRound = useCallback((direction: GameSettings['direction']) => {
    const pool = langFilter && langFilter !== 'all' ? words.filter((w) => w.language === langFilter) : words;
    return buildQuestions(pool, direction);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, langFilter]);
  const [questions, setQuestions] = useState<Question[]>(() => buildRound(gameSettings.direction));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [done, setDone] = useState<{ correct: number; skipped: number; wrong: number } | null>(null);
  const [results, setResults] = useState<Array<'correct' | 'wrong' | 'skipped'>>([]);

  const flipAnim = useRef(new Animated.Value(0)).current;
  const frontRotate = useMemo(() => flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }), [flipAnim]);
  const backRotate = useMemo(() => flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] }), [flipAnim]);

  useEffect(() => {
    if (selected !== null) {
      Animated.spring(flipAnim, { toValue: 1, friction: 7, tension: 10, useNativeDriver: true }).start();
    }
  }, [selected, flipAnim]);

  useEffect(() => {
    flipAnim.setValue(0);
  }, [index, flipAnim]);

  // Guards handleNext against firing twice for the same question — a fast
  // double-tap dispatches both calls before React commits a re-render, so
  // state alone can't tell the second call the round already finished. Ref
  // updates synchronously, so it can. Without this, a double-tap on the last
  // question can set `done` twice, the second time reading a `correct` that
  // handleSelect had already bumped again — one extra correct answer than
  // questions actually asked, and `wrong` computed negative.
  const doneLockRef = useRef(false);

  function startRound(direction: GameSettings['direction']) {
    doneLockRef.current = false;
    setQuestions(buildRound(direction));
    setIndex(0);
    setSelected(null);
    setCorrect(0);
    setSkipped(0);
    setDone(null);
    setResults([]);
    flipAnim.setValue(0);
  }

  const prevDirection = useRef(gameSettings.direction);
  useEffect(() => {
    if (gameSettings.direction !== prevDirection.current) {
      prevDirection.current = gameSettings.direction;
      startRound(gameSettings.direction);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSettings.direction]);

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
      <GameEndScreen
        gameKey="MultipleChoice"
        headerCurrent={questions.length}
        headerTotal={questions.length}
        headerResults={results}
        celebrate={done.correct === questions.length && questions.length > 0}
        stats={[
          { icon: 'checkmark-circle-outline',      tint: '#43A047',        label: 'Correct', value: done.correct },
          { icon: 'arrow-forward-circle-outline',  tint: colors.inkFaint,  label: 'Skipped', value: done.skipped },
          { icon: 'close-circle-outline',          tint: '#E53935',        label: 'Wrong',   value: done.wrong },
        ]}
        onPlayAgain={() => startRound(gameSettings.direction)}
        onBack={() => navigation.goBack()}
      />
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
    const isLast = index + 1 >= questions.length;
    if (isLast) {
      if (doneLockRef.current) return;
      doneLockRef.current = true;
    }
    if (selected === null) {
      // Skip — don't record practice, just advance
      const newSkipped = skipped + 1;
      setResults((r) => [...r, 'skipped']);
      if (isLast) {
        recordSession();
        analytics.trackGameCompleted('multiple_choice', langFilter ?? 'all', correct);
        setDone({ correct, skipped: newSkipped, wrong: questions.length - correct - newSkipped });
      } else {
        setSkipped(newSkipped);
        setIndex((i) => i + 1);
      }
    } else {
      const lastCorrect = selected === q.correctIndex ? 1 : 0;
      const totalCorrect = correct + lastCorrect;
      setResults((r) => [...r, lastCorrect === 1 ? 'correct' : 'wrong']);
      if (isLast) {
        recordSession();
        analytics.trackGameCompleted('multiple_choice', langFilter ?? 'all', totalCorrect);
        setDone({ correct: totalCorrect, skipped, wrong: questions.length - totalCorrect - skipped });
      } else {
        setIndex((i) => i + 1);
        setSelected(null);
      }
    }
  }

  function optionStyle(i: number) {
    const base = [styles.option, { backgroundColor: colors.card, borderColor: colors.borderLight }] as any[];
    if (selected === null) return base;
    if (i === q.correctIndex) return [...base, { borderColor: '#43A047', backgroundColor: '#43A04715', borderWidth: 1 }];
    if (i === selected && selected !== q.correctIndex) return [...base, { borderColor: '#E53935', backgroundColor: '#E5393515', borderWidth: 1 }];
    return [...base, { opacity: 0.42 }];
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <GameHeader title="Multiple Choice" current={index + 1} total={questions.length} results={results} onSettingsPress={() => setSettingsVisible(true)} />

      <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {/* Question card — flips to reveal answer */}
        <View style={[{ flex: 1, borderRadius: 16 }, CARD_SHADOW]}>
          {/* Front face */}
          <Animated.View style={[
            StyleSheet.absoluteFill,
            styles.cardFace,
            { backgroundColor: colors.card, borderColor: colors.borderLight },
            { transform: [{ perspective: 1200 }, { rotateY: frontRotate }], backfaceVisibility: 'hidden' },
          ]}>
            <Text style={[styles.questionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              {gameSettings.direction === 'translation-to-word' ? 'Which is the foreign word for' : 'What is the meaning of'}
            </Text>
            <View style={styles.questionWordRow}>
              <Text style={[styles.questionWord, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading + 6 }]}>
                {gameSettings.direction === 'translation-to-word' ? q.word.translation : q.word.word}
              </Text>
              {gameSettings.direction !== 'translation-to-word' && (
                <WordAudioButton word={q.word.word} language={q.word.language as LanguageCode} size="md" />
              )}
            </View>
            <Text style={[styles.questionLang, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
              {q.word.language.toUpperCase()}
            </Text>
          </Animated.View>

          {/* Back face — rich word info after answering */}
          <Animated.View style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: 16,
              borderWidth: StyleSheet.hairlineWidth,
              backgroundColor: colors.card,
              borderColor: colors.borderLight,
              overflow: 'hidden',
            },
            { transform: [{ perspective: 1200 }, { rotateY: backRotate }], backfaceVisibility: 'hidden' },
          ]}>
            {selected !== null && (
              <ScrollView
                contentContainerStyle={styles.backScrollContent}
                showsVerticalScrollIndicator
                bounces={false}
              >
                {/* Result + word header */}
                <View style={styles.backResultHeader}>
                  <Ionicons
                    name={selected === q.correctIndex ? 'checkmark-circle' : 'close-circle'}
                    size={24}
                    color={selected === q.correctIndex ? '#43A047' : '#E53935'}
                  />
                  <Text style={[styles.backWord, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                    {q.word.word}
                  </Text>
                  <WordAudioButton word={q.word.word} language={q.word.language as LanguageCode} size="sm" />
                </View>

                <Text style={[styles.backTranslationLarge, { color: colors.accentRed, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
                  {q.word.translation}
                </Text>

                {/* Grammar tags */}
                {(q.word.wordType || q.word.level || (q.word.forms as any)?.gender) ? (
                  <Text style={[styles.backGrammarTags, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    {[
                      q.word.wordType ? q.word.wordType.charAt(0).toUpperCase() + q.word.wordType.slice(1) : null,
                      (q.word.forms as any)?.gender ?? null,
                      (q.word.meta as any)?.isRegular === true  ? 'Regular'   : null,
                      (q.word.meta as any)?.isRegular === false ? 'Irregular' : null,
                      (q.word.meta as any)?.auxiliary ?? null,
                      q.word.level ?? null,
                    ].filter(Boolean).join('  ·  ')}
                  </Text>
                ) : null}

                {/* Explanation */}
                {q.word.explanation ? (
                  <>
                    <View style={[styles.backCardDivider, { backgroundColor: colors.borderLight }]} />
                    <Text style={[styles.backExplanation, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body - 1 }]}>
                      {q.word.explanation}
                    </Text>
                  </>
                ) : null}

                {/* Example sentence */}
                {q.word.exampleSentence ? (
                  <View style={[styles.backBlockquote, { borderLeftColor: colors.accentRed }]}>
                    <Text style={[styles.backBlockquoteText, { color: colors.inkMid, fontFamily: fontFamily.italic }]}>
                      „{q.word.exampleSentence}"
                    </Text>
                  </View>
                ) : null}

                {/* Pronunciation */}
                {q.word.pronunciation ? (
                  <Text style={[styles.backPronunciation, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                    {q.word.pronunciation}
                  </Text>
                ) : null}

                {/* First verb tense */}
                {(() => {
                  const tenses: Array<{ label: string; table: Record<string, string> }> =
                    (q.word.tenses && q.word.tenses.length > 0)
                      ? q.word.tenses
                      : q.word.verbTable && Object.keys(q.word.verbTable).length > 0
                        ? [{ label: 'PRESENT', table: q.word.verbTable }]
                        : [];
                  if (tenses.length === 0) return null;
                  const t = tenses[0];
                  return (
                    <>
                      <View style={[styles.backCardDivider, { backgroundColor: colors.borderLight }]} />
                      <Text style={[styles.backSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                        {t.label}
                      </Text>
                      {Object.entries(t.table).map(([pronoun, form]) => (
                        <View key={pronoun} style={[styles.backConjRow, { borderTopColor: colors.borderLight }]}>
                          <Text style={[styles.backConjPronoun, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>{pronoun}</Text>
                          <Text style={[styles.backConjForm, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>{form}</Text>
                        </View>
                      ))}
                    </>
                  );
                })()}

                {/* Tip */}
                {q.word.tip ? (
                  <View style={[styles.backTipBox, { backgroundColor: colors.accentRed + '15', borderColor: colors.accentRed + '44' }]}>
                    <Ionicons name="bulb-outline" size={13} color={colors.accentRed} />
                    <Text style={[styles.backTipText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                      {q.word.tip}
                    </Text>
                  </View>
                ) : null}
                <View style={{ height: 80 }} />
              </ScrollView>
            )}
          </Animated.View>
        </View>

        {/* Options */}
        <View style={styles.options}>
          {q.options.map((opt, i) => (
            <SpringButton
              key={i}
              style={optionStyle(i)}
              onPress={() => handleSelect(i)}
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
              <Text style={[styles.optionText, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body - 2 }]}>
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

        <SpringButton
          style={[styles.nextButton, {
            backgroundColor: selected !== null ? colors.accentRed : colors.accentRed + '22',
          }]}
          onPress={handleNext}
          cornerRadius={14}
          haptic="medium"
        >
          <Text style={[styles.nextButtonText, {
            fontFamily: fontFamily.regular,
            color: selected !== null ? '#FFF' : colors.accentRed,
          }]}>
            {selected === null ? 'Skip' : index + 1 >= questions.length ? 'Finish' : 'Next'}
          </Text>
        </SpringButton>
      </View>

      <GameSettingsSheet
        visible={settingsVisible}
        settings={gameSettings}
        onClose={() => setSettingsVisible(false)}
        onChange={setGameSettings}
      />
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

  cardFace: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  optionLetter: { fontSize: 13, width: 22, textAlign: 'center' },
  optionText: { flex: 1, lineHeight: 22 },

  nextButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#C0392B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  nextButtonText: { color: '#FFF', fontSize: 16 },

  // Back face — rich content
  backScrollContent: { padding: Spacing.md, gap: Spacing.sm, flexGrow: 1 },
  backResultHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, justifyContent: 'center' },
  backWord: { fontSize: 20 },
  backTranslationLarge: { textAlign: 'center' },
  backGrammarTags: { fontSize: 12, textAlign: 'center', letterSpacing: 0.2 },
  backCardDivider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  backExplanation: { lineHeight: 20, textAlign: 'center' },
  backBlockquote: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 6, marginTop: 2 },
  backBlockquoteText: { fontSize: 13, lineHeight: 19 },
  backPronunciation: { fontSize: 12, textAlign: 'center', letterSpacing: 0.5, opacity: 0.7 },
  backSectionLabel: { fontSize: 10, letterSpacing: 1.5, textAlign: 'center', marginBottom: 2 },
  backConjRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth },
  backConjPronoun: { fontSize: 12, flex: 1, fontStyle: 'italic' },
  backConjForm: { fontSize: 12, flex: 1, textAlign: 'right' },
  backTipBox: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.sm, borderRadius: 8, borderWidth: 1, alignItems: 'flex-start', marginTop: 2 },
  backTipText: { flex: 1, fontSize: 11, lineHeight: 17 },

  doneTitle: { textAlign: 'center' },
  statsBox: {
    width: '100%', borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 10, elevation: 6,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  statLabel: { flex: 1, fontSize: 15 },
  statValue: { fontSize: 20 },
  doneButton: { borderRadius: 12, paddingHorizontal: Spacing.xxl, paddingVertical: 14 },
  doneButtonText: { color: '#FFF', fontSize: 16 },
  congratsLine: { fontSize: 18, letterSpacing: 0.5 },
});

