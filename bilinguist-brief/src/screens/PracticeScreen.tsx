import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../hooks/useTheme';
import { useWordBankStore, type Pile } from '../store/useWordBankStore';
import { useStreakStore } from '../store/useStreakStore';
import { Spacing } from '../theme';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type PracticeNav = NativeStackNavigationProp<PracticeStackParamList, 'PracticeHome'>;

const PILE_META: Array<{ key: Pile; label: string; emoji: string; description: string }> = [
  { key: 'new', label: 'New Words', emoji: '🆕', description: 'Just saved, never practised' },
  { key: 'learning', label: 'Learning', emoji: '🔄', description: 'Practised but not yet consistent' },
  { key: 'mastered', label: 'Mastered', emoji: '✅', description: 'Consistently correct' },
  { key: 'revisit', label: 'Revisit', emoji: '🔁', description: 'Due for a refresher' },
];

const GAMES: Array<{
  key: keyof PracticeStackParamList;
  label: string;
  icon: any;
  description: string;
}> = [
  { key: 'Flashcards', label: 'Flashcards', icon: 'layers-outline', description: 'Flip cards with spaced repetition' },
  { key: 'MultipleChoice', label: 'Multiple Choice', icon: 'list-outline', description: 'Which word means…? Four options' },
  { key: 'FillBlank', label: 'Fill in the Blank', icon: 'pencil-outline', description: 'Complete the original news sentence' },
  { key: 'Translation', label: 'Translation Challenge', icon: 'swap-horizontal-outline', description: 'Translate between languages' },
];

export function PracticeScreen() {
  const { colors, fontFamily, fontSize } = useTheme();
  const navigation = useNavigation<PracticeNav>();
  const { counts, words } = useWordBankStore();
  const { streak } = useStreakStore();
  const pileCounts = counts();
  const totalWords = words.length;
  const hasWords = totalWords > 0;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      {/* Streak */}
      <View style={[styles.streakBanner, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
        <Text style={[styles.streakNumber, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>{streak}</Text>
        <Text style={[styles.streakLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>day streak</Text>
      </View>

      {/* Word bank section */}
      <Text style={[styles.sectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
        WORD BANK
      </Text>

      <View style={[styles.pilesGrid, { borderColor: colors.borderLight }]}>
        {PILE_META.map((pile, index) => (
          <TouchableOpacity
            key={pile.key}
            style={[
              styles.pileCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.borderLight,
                borderRightWidth: index % 2 === 0 ? StyleSheet.hairlineWidth : 0,
                borderBottomWidth: index < 2 ? StyleSheet.hairlineWidth : 0,
              },
            ]}
          >
            <Text style={styles.pileEmoji}>{pile.emoji}</Text>
            <Text style={[styles.pileCount, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              {pileCounts[pile.key]}
            </Text>
            <Text style={[styles.pileLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
              {pile.label}
            </Text>
            <Text style={[styles.pileDesc, { color: colors.inkFaint }]}>{pile.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Games section */}
      <Text style={[styles.sectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular, marginTop: Spacing.xl }]}>
        PRACTICE GAMES
      </Text>

      {!hasWords && (
        <Text style={[styles.emptyNote, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
          Tap words in your briefing to save them here, then use games to practise.
        </Text>
      )}

      {GAMES.map((game) => (
        <TouchableOpacity
          key={game.key}
          style={[styles.gameRow, { borderBottomColor: colors.borderLight }]}
          disabled={!hasWords}
          activeOpacity={hasWords ? 0.7 : 1}
          onPress={() => hasWords && navigation.navigate(game.key as any)}
        >
          <View style={[styles.gameIcon, { backgroundColor: hasWords ? colors.accentGold + '22' : colors.borderLight }]}>
            <Ionicons name={game.icon} size={20} color={hasWords ? colors.accentGold : colors.inkLight} />
          </View>
          <View style={styles.gameText}>
            <Text style={[styles.gameName, { color: hasWords ? colors.inkDark : colors.inkFaint, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
              {game.label}
            </Text>
            <Text style={[styles.gameDesc, { color: colors.inkFaint }]}>{game.description}</Text>
          </View>
          {hasWords
            ? <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
            : <Ionicons name="lock-closed-outline" size={16} color={colors.inkFaint} />
          }
        </TouchableOpacity>
      ))}

      {/* Recent words preview */}
      {hasWords && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular, marginTop: Spacing.xl }]}>
            RECENTLY SAVED
          </Text>
          {words.slice(0, 5).map((w) => (
            <View key={w.id} style={[styles.wordRow, { borderBottomColor: colors.borderLight }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.wordText, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.body }]}>
                  {w.word}
                </Text>
                {w.translation ? (
                  <Text style={[styles.wordTranslation, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
                    {w.translation}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.pileBadge, { borderColor: colors.borderMid }]}>
                <Text style={[styles.pileBadgeText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  {PILE_META.find((p) => p.key === w.pile)?.emoji} {w.pile}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: 48,
  },
  streakBanner: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xl,
  },
  streakNumber: { fontSize: 48, lineHeight: 54 },
  streakLabel: { fontSize: 14, letterSpacing: 0.5 },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  pilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden',
  },
  pileCard: {
    width: '50%',
    padding: Spacing.md,
    alignItems: 'center',
  },
  pileEmoji: { fontSize: 24, marginBottom: Spacing.xs },
  pileCount: { fontSize: 28, lineHeight: 34 },
  pileLabel: { fontSize: 13, marginTop: 2 },
  pileDesc: { fontSize: 11, textAlign: 'center', marginTop: 2, lineHeight: 15 },
  emptyNote: { fontSize: 14, marginBottom: Spacing.md, lineHeight: 22 },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  gameIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameText: { flex: 1 },
  gameName: { lineHeight: 22 },
  gameDesc: { fontSize: 12, marginTop: 1 },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  wordText: {},
  wordTranslation: { fontSize: 13, marginTop: 2 },
  pileBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pileBadgeText: { fontSize: 11 },
});
