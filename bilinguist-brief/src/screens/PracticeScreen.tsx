import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';

const WORD_PILES = [
  { key: 'new', label: 'New Words', emoji: '🆕', count: 0, description: 'Just saved, never practised' },
  { key: 'learning', label: 'Learning', emoji: '🔄', count: 0, description: 'Practised but not yet consistent' },
  { key: 'mastered', label: 'Mastered', emoji: '✅', count: 0, description: 'Consistently correct' },
  { key: 'revisit', label: 'Revisit', emoji: '🔁', count: 0, description: 'Due for a refresher' },
];

const GAMES = [
  { key: 'flashcards', label: 'Flashcards', icon: 'layers-outline' as const, description: 'Flip cards with spaced repetition' },
  { key: 'multiple-choice', label: 'Multiple Choice', icon: 'list-outline' as const, description: 'Which word means…? Four options' },
  { key: 'fill-blank', label: 'Fill in the Blank', icon: 'pencil-outline' as const, description: 'Complete the original news sentence' },
  { key: 'translation', label: 'Translation Challenge', icon: 'swap-horizontal-outline' as const, description: 'Translate between languages' },
];

export function PracticeScreen() {
  const { colors, fontFamily, fontSize } = useTheme();

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      {/* Streak */}
      <View style={[styles.streakBanner, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
        <Text style={[styles.streakNumber, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>0</Text>
        <Text style={[styles.streakLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>day streak</Text>
      </View>

      {/* Word bank section */}
      <Text style={[styles.sectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
        WORD BANK
      </Text>

      <View style={[styles.pilesGrid, { borderColor: colors.borderLight }]}>
        {WORD_PILES.map((pile, index) => (
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
            <Text style={[styles.pileCount, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{pile.count}</Text>
            <Text style={[styles.pileLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>{pile.label}</Text>
            <Text style={[styles.pileDesc, { color: colors.inkFaint }]}>{pile.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Games section */}
      <Text style={[styles.sectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular, marginTop: Spacing.xl }]}>
        PRACTICE GAMES
      </Text>

      <Text style={[styles.emptyNote, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
        Save words from your briefing to unlock practice games.
      </Text>

      {GAMES.map((game) => (
        <TouchableOpacity
          key={game.key}
          style={[styles.gameRow, { borderBottomColor: colors.borderLight }]}
          disabled
        >
          <View style={[styles.gameIcon, { backgroundColor: colors.borderLight }]}>
            <Ionicons name={game.icon} size={20} color={colors.inkLight} />
          </View>
          <View style={styles.gameText}>
            <Text style={[styles.gameName, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
              {game.label}
            </Text>
            <Text style={[styles.gameDesc, { color: colors.inkFaint }]}>{game.description}</Text>
          </View>
          <Ionicons name="lock-closed-outline" size={16} color={colors.inkFaint} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: 40,
  },
  streakBanner: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xl,
  },
  streakNumber: {
    fontSize: 48,
    lineHeight: 54,
  },
  streakLabel: {
    fontSize: 14,
    letterSpacing: 0.5,
  },
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
  pileEmoji: {
    fontSize: 24,
    marginBottom: Spacing.xs,
  },
  pileCount: {
    fontSize: 28,
    lineHeight: 34,
  },
  pileLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  pileDesc: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 15,
  },
  emptyNote: {
    fontSize: 14,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
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
  gameText: {
    flex: 1,
  },
  gameName: {
    lineHeight: 22,
  },
  gameDesc: {
    fontSize: 12,
    marginTop: 1,
  },
});
