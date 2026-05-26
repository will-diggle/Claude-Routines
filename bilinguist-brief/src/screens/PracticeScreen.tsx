import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../hooks/useTheme';
import { useWordBankStore, type Pile } from '../store/useWordBankStore';
import { useSettingsStore, type LanguageCode } from '../store/useSettingsStore';
import { useStreakStore } from '../store/useStreakStore';
import { Spacing } from '../theme';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type PracticeNav = NativeStackNavigationProp<PracticeStackParamList, 'PracticeHome'>;

const PILE_META: Array<{ key: Pile; label: string; icon: any; description: string }> = [
  { key: 'new', label: 'New Words', icon: 'add-circle-outline', description: 'Just saved, never practised' },
  { key: 'learning', label: 'Learning', icon: 'refresh-outline', description: 'Practised but not yet consistent' },
  { key: 'mastered', label: 'Mastered', icon: 'checkmark-circle-outline', description: 'Consistently correct' },
  { key: 'revisit', label: 'Revisit', icon: 'time-outline', description: 'Due for a refresher' },
];

const GAMES: Array<{
  key: keyof PracticeStackParamList;
  label: string;
  icon: any;
  description: string;
  tint: string;
}> = [
  { key: 'Flashcards',    label: 'Flashcards',           icon: 'layers-outline',          description: 'Flip cards with spaced repetition',   tint: '#4A6FA5' },
  { key: 'MultipleChoice',label: 'Multiple Choice',      icon: 'list-outline',            description: 'Which word means…? Four options',      tint: '#1E6B3A' },
  { key: 'FillBlank',     label: 'Fill in the Blank',    icon: 'pencil-outline',          description: 'Complete the original news sentence',  tint: '#6A1B9A' },
  { key: 'Translation',   label: 'Translation Challenge',icon: 'swap-horizontal-outline', description: 'Translate between languages',           tint: '#8B1A1A' },
];

const LANG_NATIVE: Record<LanguageCode, string> = {
  fr: 'Français',
  de: 'Deutsch',
  sv: 'Svenska',
  en: 'English',
};

export function PracticeScreen() {
  const { colors, fontFamily, fontSize } = useTheme();
  const navigation = useNavigation<PracticeNav>();
  const { words, seedSampleWords } = useWordBankStore();
  const { activeLanguages } = useSettingsStore();
  const { streak } = useStreakStore();

  const [selectedLang, setSelectedLang] = useState<LanguageCode | 'all'>('all');

  useEffect(() => {
    seedSampleWords();
  }, []);

  const activeLangs = activeLanguages();
  const showLangTabs = activeLangs.length > 1 || words.some((w) => activeLangs.every((l) => l.code !== w.language));

  const filteredWords = selectedLang === 'all' ? words : words.filter((w) => w.language === selectedLang);
  const totalWords = filteredWords.length;
  const hasWords = totalWords > 0;

  const filteredCounts: Record<Pile, number> = {
    new: filteredWords.filter((w) => w.pile === 'new').length,
    learning: filteredWords.filter((w) => w.pile === 'learning').length,
    mastered: filteredWords.filter((w) => w.pile === 'mastered').length,
    revisit: filteredWords.filter((w) => w.pile === 'revisit').length,
  };

  // Derive unique languages present in word bank
  const presentLangs = Array.from(new Set(words.map((w) => w.language))) as LanguageCode[];

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

      {/* Language tabs */}
      {presentLangs.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabsContent}
        >
          <TouchableOpacity
            onPress={() => setSelectedLang('all')}
            style={[
              styles.langTab,
              { borderColor: colors.borderMid },
              selectedLang === 'all' && { backgroundColor: colors.inkDark, borderColor: colors.inkDark },
            ]}
          >
            <Text style={[
              styles.langTabText,
              { color: selectedLang === 'all' ? (colors.isNight ? colors.inkDark : '#FFF') : colors.inkMid, fontFamily: fontFamily.regular },
            ]}>
              All
            </Text>
          </TouchableOpacity>
          {presentLangs.map((code) => (
            <TouchableOpacity
              key={code}
              onPress={() => setSelectedLang(code)}
              style={[
                styles.langTab,
                { borderColor: colors.borderMid },
                selectedLang === code && { backgroundColor: colors.inkDark, borderColor: colors.inkDark },
              ]}
            >
              <Text style={[
                styles.langTabText,
                { color: selectedLang === code ? (colors.isNight ? colors.inkDark : '#FFF') : colors.inkMid, fontFamily: fontFamily.regular },
              ]}>
                {LANG_NATIVE[code] ?? code.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

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
            <Ionicons name={pile.icon} size={22} color={colors.accentGold} style={{ marginBottom: Spacing.xs }} />
            <Text style={[styles.pileCount, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              {filteredCounts[pile.key]}
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
          <View style={[styles.gameIcon, { backgroundColor: hasWords ? game.tint + '1a' : colors.borderLight }]}>
            <Ionicons name={game.icon} size={20} color={hasWords ? game.tint : colors.inkLight} />
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
          {filteredWords.slice(0, 5).map((w) => (
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
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[styles.wordLang, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  {LANG_NATIVE[w.language] ?? w.language.toUpperCase()}
                </Text>
                <View style={[styles.pileBadge, { borderColor: colors.borderMid }]}>
                  <Text style={[styles.pileBadgeText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    {w.pile}
                  </Text>
                </View>
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
    marginBottom: Spacing.lg,
  },
  streakNumber: { fontSize: 48, lineHeight: 54 },
  streakLabel: { fontSize: 14, letterSpacing: 0.5 },
  tabsScroll: {
    marginBottom: Spacing.lg,
  },
  tabsContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  langTab: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  langTabText: {
    fontSize: 13,
    letterSpacing: 0.3,
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
  wordLang: { fontSize: 11, letterSpacing: 0.5 },
  pileBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pileBadgeText: { fontSize: 11 },
});
