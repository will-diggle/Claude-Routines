import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Keyboard, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useWordBankStore, type SavedWord } from '../store/useWordBankStore';
import { useStreakStore } from '../store/useStreakStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTheme } from '../hooks/useTheme';
import { GameHeader } from '../components/GameHeader';
import { Spacing } from '../theme';
import { useNavPillStore } from '../store/useNavPillStore';
import { getCongratsLines } from '../utils/congrats';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';

const SCREEN_W = Dimensions.get('window').width;

type Mode = 'target-to-en' | 'en-to-target';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalize(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function TranslationScreen() {
  const { colors, fontFamily, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PracticeStackParamList, 'Translation'>>();
  const langFilter = route.params?.language;
  const { words, recordPractice } = useWordBankStore();
  const { recordSession, streak } = useStreakStore();
  const activeLanguages = useSettingsStore((s) => s.activeLanguages().map((l) => l.code));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const congratsLines = useMemo(() => getCongratsLines(activeLanguages), []);
  const setGameActive = useNavPillStore((s) => s.setGameActive);
  useFocusEffect(useCallback(() => {
    setGameActive(true);
    return () => setGameActive(false);
  }, [setGameActive]));

  const [mode, setMode] = useState<Mode>('target-to-en');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const eligible = useMemo(() => {
    const pool = langFilter && langFilter !== 'all'
      ? words.filter((w) => w.language === langFilter && w.language !== 'en')
      : words.filter((w) => w.language !== 'en');
    return shuffle(pool.filter((w) => w.translation)).slice(0, 10);
  }, []);

  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  if (eligible.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        <GameHeader title="Translation Challenge" current={0} total={0} />
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            Save words with translations to play Translation Challenge.
          </Text>
        </View>
      </View>
    );
  }

  const card: SavedWord = eligible[index];
  const prompt = mode === 'target-to-en' ? card.word : card.translation;
  const answer = mode === 'target-to-en' ? card.translation : card.word;
  const promptLabel = mode === 'target-to-en' ? card.language.toUpperCase() : 'EN';
  const answerLabel = mode === 'target-to-en' ? 'EN' : card.language.toUpperCase();

  if (done) {
    const isPerfect = correct === eligible.length && eligible.length > 0;
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <GameHeader title="Translation Challenge" current={eligible.length} total={eligible.length} />
        {isPerfect && (
          <ConfettiCannon count={180} origin={{ x: SCREEN_W / 2, y: -20 }} autoStart fadeOut fallSpeed={2800} />
        )}
        <View style={styles.center}>
          <Ionicons name="repeat-outline" size={48} color={colors.accentGold} />
          {isPerfect && congratsLines.map((line, i) => (
            <Text key={i} style={[styles.congratsLine, { color: colors.accentGold, fontFamily: i === 0 ? fontFamily.bold : fontFamily.italic }]}>
              {line}
            </Text>
          ))}
          <Text style={[styles.doneTitle, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            {correct}/{eligible.length} correct
          </Text>
          <Text style={[styles.streakText, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>{streak} day streak</Text>
          <TouchableOpacity style={[styles.doneButton, { backgroundColor: colors.accentGold }]} onPress={() => navigation.goBack()}>
            <Text style={[styles.doneButtonText, { fontFamily: fontFamily.regular }]}>Back to practice</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function handleCheck() {
    Keyboard.dismiss();
    const right = normalize(input) === normalize(answer);
    setIsCorrect(right);
    setChecked(true);
    recordPractice(card.id, right);
    if (right) setCorrect((c) => c + 1);
  }

  function handleNext() {
    if (index + 1 >= eligible.length) {
      recordSession();
      setDone(true);
    } else {
      setIndex(index + 1);
      setInput('');
      setChecked(false);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <GameHeader title="Translation Challenge" current={index + 1} total={eligible.length} />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} keyboardShouldPersistTaps="handled">
        {/* Mode toggle */}
        <View style={[styles.modeRow, { backgroundColor: colors.borderLight, borderRadius: 8 }]}>
          {(['target-to-en', 'en-to-target'] as Mode[]).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.modeOption, m === mode && { backgroundColor: colors.accentGold }]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeText, { color: m === mode ? '#FFF' : colors.inkLight, fontFamily: fontFamily.regular }]}>
                {m === 'target-to-en' ? `${card.language.toUpperCase()} → EN` : `EN → ${card.language.toUpperCase()}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Prompt */}
        <View style={[styles.promptBox, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
          <Text style={[styles.promptLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            {promptLabel}
          </Text>
          <Text style={[styles.promptWord, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            {prompt}
          </Text>
        </View>

        {/* Answer input */}
        <Text style={[styles.answerLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
          Translate to {answerLabel}
        </Text>

        {!checked ? (
          <TextInput
            style={[styles.input, { color: colors.inkDark, borderColor: colors.borderMid, fontFamily: fontFamily.regular, backgroundColor: colors.card, fontSize: fontSize.body }]}
            value={input}
            onChangeText={setInput}
            placeholder="Your translation…"
            placeholderTextColor={colors.inkFaint}
            autoCorrect={false}
            autoCapitalize="none"
            onSubmitEditing={handleCheck}
          />
        ) : (
          <View style={[styles.result, { backgroundColor: isCorrect ? '#43A04715' : '#E5393515', borderColor: isCorrect ? '#43A047' : '#E53935' }]}>
            <Text style={[styles.resultMark, { color: isCorrect ? '#43A047' : '#E53935', fontFamily: fontFamily.bold }]}>
              {isCorrect ? 'Correct!' : `Answer: ${answer}`}
            </Text>
            {!isCorrect && input.trim() ? (
              <Text style={[styles.yourAnswer, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                You wrote: {input}
              </Text>
            ) : null}
          </View>
        )}

        {!checked ? (
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.accentGold }]} onPress={handleCheck} disabled={!input.trim()}>
            <Text style={[styles.actionButtonText, { fontFamily: fontFamily.regular }]}>Check</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.accentGold }]} onPress={handleNext}>
            <Text style={[styles.actionButtonText, { fontFamily: fontFamily.regular }]}>
              {index + 1 >= eligible.length ? 'Finish' : 'Next'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 24 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  modeRow: { flexDirection: 'row', padding: 4, gap: 4 },
  modeOption: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  modeText: { fontSize: 13 },
  promptBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  promptLabel: { fontSize: 11, letterSpacing: 1.5 },
  promptWord: { textAlign: 'center', lineHeight: 44 },
  answerLabel: { fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 8, padding: Spacing.md },
  result: { borderWidth: 1, borderRadius: 8, padding: Spacing.md, gap: 4 },
  resultMark: { fontSize: 15 },
  yourAnswer: { fontSize: 13 },
  actionButton: { borderRadius: 8, padding: 14, alignItems: 'center' },
  actionButtonText: { color: '#FFF', fontSize: 16 },
  doneTitle: { textAlign: 'center' },
  streakText: { fontSize: 20 },
  doneButton: { borderRadius: 8, paddingHorizontal: Spacing.xxl, paddingVertical: 14 },
  doneButtonText: { color: '#FFF', fontSize: 16 },
  congratsLine: { fontSize: 18, letterSpacing: 0.5 },
});
