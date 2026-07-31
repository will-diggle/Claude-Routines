import { SpringButton } from '../components/SpringButton';
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView,
  Keyboard, StyleSheet, Dimensions, Modal,
} from 'react-native';
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
import { GlassButton } from '../components/GlassButton';
import { GlassSurface } from '../components/GlassSurface';
import { Spacing } from '../theme';
import { useGameActive } from '../hooks/useGameActive';
import { getCongratsLines } from '../utils/congrats';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import * as analytics from '../services/analytics';

const SCREEN_W = Dimensions.get('window').width;

type Mode = 'target-to-en' | 'en-to-target';

const COUNTS = [5, 10, 15, 20] as const;

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

function buildPool(words: SavedWord[], lang: string): SavedWord[] {
  const base = lang && lang !== 'all'
    ? words.filter((w) => w.language === lang && w.language !== 'en')
    : words.filter((w) => w.language !== 'en');
  return base.filter((w) => w.translation);
}

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.11,
  shadowRadius: 10,
  elevation: 6,
} as const;

export function TranslationScreen() {
  const { colors, fontFamily, fontSize, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PracticeStackParamList, 'Translation'>>();
  const langFilter = route.params?.language;
  const { words, recordPractice } = useWordBankStore();
  const { recordSession, streak } = useStreakStore();
  const activeLanguages = useSettingsStore(useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const congratsLines = useMemo(() => getCongratsLines(activeLanguages), []);
  useGameActive();
  useFocusEffect(useCallback(() => {
    analytics.trackGameOpened('translation', langFilter ?? 'all');
  }, [langFilter]));

  // ── Game settings ─────────────────────────────────────────────────────────
  const [mode, setMode]           = useState<Mode>('target-to-en');
  const [count, setCount]         = useState(10);
  const [localLang, setLocalLang] = useState<string>(langFilter ?? 'all');

  // ── Deal ──────────────────────────────────────────────────────────────────
  const [eligible, setEligible] = useState<SavedWord[]>(() =>
    shuffle(buildPool(words, langFilter ?? 'all')).slice(0, 10),
  );

  const langsWithWords = useMemo(
    () => [...new Set(buildPool(words, 'all').map((w) => w.language))],
    [words],
  );

  // ── Game state ────────────────────────────────────────────────────────────
  const [index,    setIndex]    = useState(0);
  const [input,    setInput]    = useState('');
  const [checked,  setChecked]  = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [correct,  setCorrect]  = useState(0);
  const [done,     setDone]     = useState(false);
  const [results,  setResults]  = useState<Array<'correct' | 'wrong'>>([]);

  // ── Settings modal ────────────────────────────────────────────────────────
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [draftMode,  setDraftMode]  = useState<Mode>('target-to-en');
  const [draftCount, setDraftCount] = useState(10);
  const [draftLang,  setDraftLang]  = useState<string>(langFilter ?? 'all');

  function openSettings() {
    setDraftMode(mode);
    setDraftCount(count);
    setDraftLang(localLang);
    setSettingsVisible(true);
  }

  function applySettings() {
    setSettingsVisible(false);
    const newEligible = shuffle(buildPool(words, draftLang)).slice(0, draftCount);
    setEligible(newEligible);
    setMode(draftMode);
    setCount(draftCount);
    setLocalLang(draftLang);
    setIndex(0);
    setInput('');
    setChecked(false);
    setCorrect(0);
    setDone(false);
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (eligible.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        <GameHeader title="Translation Challenge" current={0} total={0} onSettingsPress={openSettings} />
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            Save words with translations to play Translation Challenge.
          </Text>
        </View>
        {renderSettingsModal()}
      </View>
    );
  }

  const card: SavedWord = eligible[index];
  const prompt      = mode === 'target-to-en' ? card.word        : card.translation!;
  const answer      = mode === 'target-to-en' ? card.translation! : card.word;
  const promptLabel = mode === 'target-to-en' ? card.language.toUpperCase() : 'EN';
  const answerLabel = mode === 'target-to-en' ? 'EN' : card.language.toUpperCase();

  // ── Done screen ───────────────────────────────────────────────────────────
  if (done) {
    const isPerfect = correct === eligible.length && eligible.length > 0;
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <GameHeader title="Translation Challenge" current={eligible.length} total={eligible.length} results={results} onSettingsPress={openSettings} />
        {isPerfect && (
          <ConfettiCannon count={180} origin={{ x: SCREEN_W / 2, y: -20 }} autoStart fadeOut fallSpeed={2800} />
        )}
        <View style={styles.center}>
          <Ionicons name="repeat-outline" size={48} color={colors.accentRed} />
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
        {renderSettingsModal()}
      </View>
    );
  }

  // ── Game actions ──────────────────────────────────────────────────────────
  function handleCheck() {
    Keyboard.dismiss();
    const right = normalize(input) === normalize(answer);
    setIsCorrect(right);
    setChecked(true);
    recordPractice(card.id, right);
    if (right) setCorrect((c) => c + 1);
  }

  function handleNext() {
    setResults((r) => [...r, isCorrect ? 'correct' : 'wrong']);
    if (index + 1 >= eligible.length) {
      recordSession();
      analytics.trackGameCompleted('translation', langFilter ?? 'all', correct);
      setDone(true);
    } else {
      setIndex(index + 1);
      setInput('');
      setChecked(false);
    }
  }

  // ── Settings modal renderer ───────────────────────────────────────────────
  function renderSettingsModal() {
    return (
      <Modal
        visible={settingsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <SpringButton
          style={styles.modalBackdrop}
         
          onPress={() => setSettingsVisible(false)}
        >
          <SpringButton
           
            style={[styles.settingsSheet, { ...CARD_SHADOW, overflow: 'hidden' }]}
          >
            <GlassSurface cornerRadius={20} intensity={0.9} colorScheme={isDark ? 'dark' : 'light'} />
            {/* Header */}
            <View style={styles.settingsHeader}>
              <Text style={[styles.settingsTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                Game Settings
              </Text>
              <GlassButton onPress={() => setSettingsVisible(false)} size={36} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={colors.inkFaint} />
              </GlassButton>
            </View>

            {/* Direction */}
            <Text style={[styles.settingsLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
              Direction
            </Text>
            <View style={styles.pillRow}>
              {(['target-to-en', 'en-to-target'] as Mode[]).map((m) => {
                const active = draftMode === m;
                return (
                  <SpringButton
                    key={m}
                    style={[styles.pill, { flex: 1, overflow: 'hidden' }]}
                    onPress={() => setDraftMode(m)}
                   
                  >
                    {active
                      ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.accentRed, borderRadius: 10 }]} />
                      : <GlassSurface cornerRadius={10} colorScheme={isDark ? 'dark' : 'light'} />
                    }
                    <Text style={[styles.pillText, {
                      color: active ? '#fff' : colors.inkMid,
                      fontFamily: active ? fontFamily.bold : fontFamily.regular,
                    }]}>
                      {m === 'target-to-en' ? 'Foreign → EN' : 'EN → Foreign'}
                    </Text>
                  </SpringButton>
                );
              })}
            </View>

            {/* Card count */}
            <Text style={[styles.settingsLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
              Cards
            </Text>
            <View style={styles.pillRow}>
              {COUNTS.map((n) => {
                const active = draftCount === n;
                return (
                  <SpringButton
                    key={n}
                    style={[styles.pill, { flex: 1, overflow: 'hidden' }]}
                    onPress={() => setDraftCount(n)}
                   
                  >
                    {active
                      ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.accentRed, borderRadius: 10 }]} />
                      : <GlassSurface cornerRadius={10} colorScheme={isDark ? 'dark' : 'light'} />
                    }
                    <Text style={[styles.pillText, {
                      color: active ? '#fff' : colors.inkMid,
                      fontFamily: active ? fontFamily.bold : fontFamily.regular,
                    }]}>
                      {n}
                    </Text>
                  </SpringButton>
                );
              })}
            </View>

            {/* Language */}
            {langsWithWords.length > 1 && (
              <>
                <Text style={[styles.settingsLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
                  Language
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.md }}>
                  <View style={[styles.pillRow, { paddingHorizontal: Spacing.md }]}>
                    {['all', ...langsWithWords].map((code) => {
                      const active = draftLang === code;
                      return (
                        <SpringButton
                          key={code}
                          style={[styles.pill, { overflow: 'hidden' }]}
                          onPress={() => setDraftLang(code)}
                         
                        >
                          {active
                            ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.accentRed, borderRadius: 10 }]} />
                            : <GlassSurface cornerRadius={10} colorScheme={isDark ? 'dark' : 'light'} />
                          }
                          <Text style={[styles.pillText, {
                            color: active ? '#fff' : colors.inkMid,
                            fontFamily: active ? fontFamily.bold : fontFamily.regular,
                          }]}>
                            {code === 'all' ? 'All' : code.toUpperCase()}
                          </Text>
                        </SpringButton>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Apply */}
            <SpringButton
              style={[styles.applyButton, { backgroundColor: colors.accentRed }]}
              onPress={applySettings}
             
            >
              <Text style={[styles.applyButtonText, { fontFamily: fontFamily.bold }]}>
                Start New Game
              </Text>
            </SpringButton>
          </SpringButton>
        </SpringButton>
      </Modal>
    );
  }

  // ── Main game ─────────────────────────────────────────────────────────────
  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <GameHeader
        title="Translation Challenge"
        current={index + 1}
        total={eligible.length}
        results={results}
        onSettingsPress={openSettings}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Prompt tile */}
        <View style={[styles.promptBox, {
          backgroundColor: colors.card,
          borderColor: colors.borderLight,
          ...CARD_SHADOW,
        }]}>
          <Text style={[styles.promptLabel, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
            {promptLabel}
          </Text>
          <Text style={[styles.promptWord, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            {prompt}
          </Text>
        </View>

        {/* Answer section */}
        <Text style={[styles.answerLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
          Translate to {answerLabel}
        </Text>

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
            placeholder="Your translation…"
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

      {renderSettingsModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 24 },
  content: { padding: Spacing.md, gap: Spacing.md },

  promptBox: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 40,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  promptLabel: { fontSize: 11, letterSpacing: 1.5 },
  promptWord: { textAlign: 'center', lineHeight: 44 },

  answerLabel: { fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },

  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: Spacing.md,
    paddingVertical: 16,
  },
  result: {
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.md,
    paddingVertical: 16,
    gap: 4,
  },
  resultMark: { fontSize: 15 },
  yourAnswer: { fontSize: 13 },

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

  // ── Settings modal ──────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  settingsSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: Spacing.md,
    paddingBottom: 36,
    gap: Spacing.sm,
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  settingsTitle: { fontSize: 16 },
  settingsLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 48,
  },
  pillText: { fontSize: 13 },
  applyButton: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  applyButtonText: { color: '#FFF', fontSize: 15 },
});
