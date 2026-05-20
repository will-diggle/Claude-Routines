import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWordBankStore, type SavedWord } from '../store/useWordBankStore';
import { useStreakStore } from '../store/useStreakStore';
import { useTheme } from '../hooks/useTheme';
import { GameHeader } from '../components/GameHeader';
import { Spacing } from '../theme';

const MAX_CARDS = 20;

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

  const sessionWords = useMemo(() => getSessionWords(words), []);

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
          <Text style={[styles.doneEmoji]}>🎉</Text>
          <Text style={[styles.doneTitle, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            Session complete
          </Text>

          <View style={[styles.statsBox, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <StatRow emoji="✅" label="Got it" value={results.correct} colors={colors} fontFamily={fontFamily} />
            <StatRow emoji="🔄" label="Nearly" value={results.nearly} colors={colors} fontFamily={fontFamily} />
            <StatRow emoji="❌" label="No idea" value={results.missed} colors={colors} fontFamily={fontFamily} />
          </View>

          <Text style={[styles.streakText, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>
            🔥 {streak} day streak
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
        {/* Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderLight, shadowColor: colors.isNight ? '#000' : '#8B7355' }]}>
          <Text style={[styles.langBadge, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            {card.language.toUpperCase()}
          </Text>

          <Text style={[styles.cardWord, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading * 1.2 }]}>
            {card.word}
          </Text>

          {!revealed ? (
            <TouchableOpacity
              style={[styles.revealButton, { borderColor: colors.borderMid }]}
              onPress={() => setRevealed(true)}
            >
              <Text style={[styles.revealText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                Show answer
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.answer, { borderTopColor: colors.borderLight }]}>
              {card.translation ? (
                <Text style={[styles.translation, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                  {card.translation}
                </Text>
              ) : null}
              {card.exampleSentence ? (
                <Text style={[styles.example, { color: colors.inkLight, fontFamily: fontFamily.italic, fontSize: fontSize.body }]}>
                  {card.exampleSentence}
                </Text>
              ) : null}
              {card.originalSentence ? (
                <Text style={[styles.original, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                  From: "{card.originalSentence.slice(0, 120)}{card.originalSentence.length > 120 ? '…' : ''}"
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Mark buttons */}
      {revealed && (
        <View style={[styles.markRow, { paddingBottom: insets.bottom + Spacing.lg, borderTopColor: colors.borderLight, backgroundColor: colors.bg }]}>
          <MarkButton label="No idea" emoji="❌" onPress={() => handleMark('no')} colors={colors} fontFamily={fontFamily} tint="#E53935" />
          <MarkButton label="Nearly" emoji="🔄" onPress={() => handleMark('nearly')} colors={colors} fontFamily={fontFamily} tint={colors.inkFaint} />
          <MarkButton label="Got it!" emoji="✅" onPress={() => handleMark('got')} colors={colors} fontFamily={fontFamily} tint="#43A047" />
        </View>
      )}
    </View>
  );
}

function MarkButton({ label, emoji, onPress, colors, fontFamily, tint }: any) {
  return (
    <TouchableOpacity style={[styles.markButton, { borderColor: tint + '55' }]} onPress={onPress}>
      <Text style={styles.markEmoji}>{emoji}</Text>
      <Text style={[styles.markLabel, { color: tint, fontFamily: fontFamily.regular }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatRow({ emoji, label, value, colors, fontFamily }: any) {
  return (
    <View style={[styles.statRow, { borderBottomColor: colors.borderLight }]}>
      <Text style={styles.statEmoji}>{emoji}</Text>
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
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  langBadge: { fontSize: 11, letterSpacing: 1.5 },
  cardWord: { textAlign: 'center', lineHeight: 48 },
  revealButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  revealText: { fontSize: 15 },
  answer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.md,
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  translation: { textAlign: 'center', fontWeight: '500' },
  example: { textAlign: 'center', lineHeight: 22 },
  original: { textAlign: 'center', fontSize: 12, lineHeight: 18 },
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
  markEmoji: { fontSize: 20 },
  markLabel: { fontSize: 12 },
  doneEmoji: { fontSize: 48 },
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
  statEmoji: { fontSize: 20, width: 28 },
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
