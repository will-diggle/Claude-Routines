import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWordBankStore, type SavedWord } from '../store/useWordBankStore';
import { useStreakStore } from '../store/useStreakStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTheme } from '../hooks/useTheme';
import { GameHeader } from '../components/GameHeader';
import { Spacing } from '../theme';
import type { LanguageCode } from '../store/useSettingsStore';

const MAX_CARDS = 20;

const LANG_NAMES: Record<LanguageCode, string> = {
  fr: 'FRANÇAIS',
  de: 'DEUTSCH',
  es: 'ESPAÑOL',
  it: 'ITALIANO',
  en: 'ENGLISH',
};

function getSessionWords(words: SavedWord[]): SavedWord[] {
  const revisit = words.filter((w) => w.pile === 'revisit');
  const newW = words.filter((w) => w.pile === 'new');
  const learning = words.filter((w) => w.pile === 'learning');
  return [...revisit, ...newW, ...learning].slice(0, MAX_CARDS);
}

type Mark = 'got' | 'nearly' | 'no';

interface SessionResult {
  correct: number;
  nearly: number;
  missed: number;
}

export function FlashcardsScreen() {
  const { colors, fontFamily, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { words, recordPractice } = useWordBankStore();
  const { recordSession, streak } = useStreakStore();
  const { activeLanguages } = useSettingsStore();
  const activeCodes = new Set(activeLanguages().map((l) => l.code));

  const sessionWords = useMemo(
    () => getSessionWords(words.filter((w) => activeCodes.has(w.language))),
    [words, activeCodes] // eslint-disable-line
  );

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<SessionResult | null>(null);
  const [tally, setTally] = useState({ correct: 0, nearly: 0, missed: 0 });

  const card = sessionWords[index];

  if (sessionWords.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        <GameHeader title="Flashcards" current={0} total={0} />
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            No words to practise yet. Save words from your briefing first.
          </Text>
        </View>
      </View>
    );
  }

  if (results) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <GameHeader title="Flashcards" current={sessionWords.length} total={sessionWords.length} />

        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={48} color={colors.accentGold} />
          <Text style={[styles.doneTitle, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            Session complete
          </Text>

          <View style={[styles.statsBox, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <StatRow iconName="checkmark-circle-outline" iconColor="#43A047" label="Got it" value={results.correct} colors={colors} fontFamily={fontFamily} />
            <StatRow iconName="refresh-outline" iconColor={colors.inkFaint} label="Nearly" value={results.nearly} colors={colors} fontFamily={fontFamily} />
            <StatRow iconName="close-circle-outline" iconColor="#E53935" label="No idea" value={results.missed} colors={colors} fontFamily={fontFamily} />
          </View>

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

  function handleMark(mark: Mark) {
    if (!card) return;

    const newTally = {
      correct: tally.correct + (mark === 'got' ? 1 : 0),
      nearly: tally.nearly + (mark === 'nearly' ? 1 : 0),
      missed: tally.missed + (mark === 'no' ? 1 : 0),
    };

    if (mark === 'got') recordPractice(card.id, true);
    if (mark === 'no') recordPractice(card.id, false);

    if (index + 1 >= sessionWords.length) {
      recordSession();
      setResults(newTally);
    } else {
      setTally(newTally);
      setIndex(index + 1);
      setRevealed(false);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <GameHeader title="Flashcards" current={index + 1} total={sessionWords.length} />

      <ScrollView contentContainerStyle={[styles.cardArea, { paddingBottom: insets.bottom + 100 }]}>
        {/* Newspaper headline card */}
        <View style={[styles.card, { borderTopColor: colors.inkDark, borderColor: colors.borderLight, backgroundColor: colors.card }]}>

          {/* Section row: language label + pile badge */}
          <View style={[styles.cardHeader, { borderBottomColor: colors.borderLight }]}>
            <Text style={[styles.cardSection, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
              {LANG_NAMES[card.language as LanguageCode] ?? card.language.toUpperCase()}
            </Text>
            <View style={[styles.pileBadge, { borderColor: colors.borderMid }]}>
              <Text style={[styles.pileBadgeText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                {card.pile}
              </Text>
            </View>
          </View>

          {/* Headline word */}
          <Text style={[styles.cardWord, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading * 1.3 }]}>
            {card.word}
          </Text>

          {!revealed ? (
            <TouchableOpacity
              style={[styles.revealButton, { borderColor: colors.borderMid, borderTopColor: colors.borderLight }]}
              onPress={() => setRevealed(true)}
            >
              <Text style={[styles.revealText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                Show answer
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.answer, { borderTopColor: colors.borderLight }]}>
              {card.translation ? (
                <Text style={[styles.translation, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.body }]}>
                  {card.translation}
                </Text>
              ) : null}
              {card.explanation ? (
                <Text style={[styles.explanation, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                  {card.explanation}
                </Text>
              ) : null}
              {card.exampleSentence ? (
                <Text style={[styles.example, { color: colors.inkLight, fontFamily: fontFamily.italic, fontSize: fontSize.body }]}>
                  "{card.exampleSentence}"
                </Text>
              ) : null}
              {card.originalSentence ? (
                <Text style={[styles.original, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  From: {card.originalSentence.slice(0, 120)}{card.originalSentence.length > 120 ? '…' : ''}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Mark buttons */}
      {revealed && (
        <View style={[styles.markRow, { paddingBottom: insets.bottom + Spacing.lg, borderTopColor: colors.borderLight, backgroundColor: colors.bg }]}>
          <MarkButton label="No idea" iconName="close-circle-outline" onPress={() => handleMark('no')} colors={colors} fontFamily={fontFamily} tint="#E53935" />
          <MarkButton label="Nearly" iconName="refresh-outline" onPress={() => handleMark('nearly')} colors={colors} fontFamily={fontFamily} tint={colors.inkFaint} />
          <MarkButton label="Got it!" iconName="checkmark-circle-outline" onPress={() => handleMark('got')} colors={colors} fontFamily={fontFamily} tint="#43A047" />
        </View>
      )}
    </View>
  );
}

function MarkButton({ label, iconName, onPress, colors, fontFamily, tint }: any) {
  return (
    <TouchableOpacity style={[styles.markButton, { borderColor: tint + '55' }]} onPress={onPress}>
      <Ionicons name={iconName} size={22} color={tint} />
      <Text style={[styles.markLabel, { color: tint, fontFamily: fontFamily.regular }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatRow({ iconName, iconColor, label, value, colors, fontFamily }: any) {
  return (
    <View style={[styles.statRow, { borderBottomColor: colors.borderLight }]}>
      <Ionicons name={iconName} size={20} color={iconColor} style={{ width: 28 }} />
      <Text style={[styles.statLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 24 },
  cardArea: { padding: Spacing.lg, alignItems: 'stretch' },

  // Newspaper headline card
  card: {
    borderTopWidth: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardSection: {
    fontSize: 11,
    letterSpacing: 1.5,
  },
  pileBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pileBadgeText: { fontSize: 10, letterSpacing: 0.5 },
  cardWord: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    lineHeight: 52,
    minHeight: 180,
    textAlignVertical: 'center',
  },
  revealButton: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  revealText: { fontSize: 15 },
  answer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  translation: { lineHeight: 26 },
  explanation: { lineHeight: 22, opacity: 0.85 },
  example: { lineHeight: 22 },
  original: { fontSize: 12, lineHeight: 18, marginTop: Spacing.xs },
  markRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  markButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  markLabel: { fontSize: 12 },
  doneTitle: { textAlign: 'center' },
  statsBox: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  statLabel: { flex: 1, fontSize: 15 },
  statValue: { fontSize: 20 },
  streakText: { fontSize: 20 },
  doneButton: {
    borderRadius: 8,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: 14,
  },
  doneButtonText: { color: '#FFF', fontSize: 16 },
});
