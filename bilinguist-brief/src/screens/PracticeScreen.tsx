import { SpringButton } from '../components/SpringButton';
import React, { useState, useMemo } from 'react';
import { useScrollTabBar } from '../hooks/useScrollTabBar';
import { View, Text, ScrollView, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useShallow } from 'zustand/react/shallow';
import { useWordBankStore, type Pile, type SavedWord } from '../store/useWordBankStore';
import type { LanguageCode } from '../store/useSettingsStore';
import { useStreakStore } from '../store/useStreakStore';
import { useNavPillStore } from '../store/useNavPillStore';
import { Spacing } from '../theme';
import { FLOAT_TAB_INSET } from '../components/FloatingTabBar';
import { TopBar } from '../components/TopBar';
import { WordDetailSheet } from '../components/WordDetailSheet';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type PracticeNav = NativeStackNavigationProp<PracticeStackParamList, 'PracticeHome'>;

const PILE_META: Array<{ key: Pile; label: string; icon: any; description: string; tint: string; iconColor: string }> = [
  { key: 'new', label: 'New Words', icon: 'add-circle-outline', description: 'Never practised', tint: 'rgba(45,175,170,0.14)', iconColor: '#2DAFAA' },
  { key: 'learning', label: 'Learning', icon: 'refresh-outline', description: 'Not yet consistent', tint: 'rgba(210,145,40,0.14)', iconColor: '#D29128' },
  { key: 'mastered', label: 'Mastered', icon: 'checkmark-circle-outline', description: 'Consistently correct', tint: 'rgba(85,155,95,0.14)', iconColor: '#559B5F' },
  { key: 'revisit', label: 'Revisit', icon: 'time-outline', description: 'Due for a refresher', tint: 'rgba(200,95,95,0.14)', iconColor: '#C85F5F' },
];

const GAMES: Array<{
  key: keyof PracticeStackParamList;
  label: string;
  icon: any;
  description: string;
  tint: string;
}> = [
  { key: 'Flashcards',    label: 'Flashcards',           icon: 'layers-outline',          description: 'Flip cards with spaced repetition',   tint: '#4A6FA5' },
  { key: 'Matching',      label: 'Speed Snap',           icon: 'grid-outline',            description: 'Match words to translations against the clock', tint: '#B5510A' },
  { key: 'MultipleChoice',label: 'Multiple Choice',      icon: 'list-outline',            description: 'Which word means…? Four options',      tint: '#1E6B3A' },
  { key: 'FillBlank',     label: 'Fill in the Blank',    icon: 'pencil-outline',          description: 'Complete the original news sentence',  tint: '#6A1B9A' },
  { key: 'Translation',   label: 'Translation Challenge',icon: 'swap-horizontal-outline', description: 'Translate between languages',           tint: '#8B1A1A' },
];

const LANG_NATIVE: Record<LanguageCode, string> = {
  fr: 'Français',
  de: 'Deutsch',
  sv: 'Svenska',
  en: 'English',
  it: 'Italiano',
  es: 'Español',
  tr: 'Türkçe',
  hu: 'Magyar',
  ar: 'العربية',
};

export function PracticeScreen() {
  const onScrollTabBar = useScrollTabBar();
  const { colors, fontFamily, fontSize } = useTheme();
  const navigation = useNavigation<PracticeNav>();
  const words = useWordBankStore(useShallow((s) => s.words));
  const streak = useStreakStore((s) => s.streak);
  const selectedLang = useNavPillStore((s) => s.practiceLang);

  const [gameModalVisible, setGameModalVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState<SavedWord | null>(null);
  const [tipDismissed, setTipDismissed] = useState(false);

  const filteredWords = useMemo(
    () => selectedLang === 'all' ? words : words.filter((w) => w.language === selectedLang),
    [words, selectedLang],
  );
  const totalWords = filteredWords.length;
  const hasWords = totalWords > 0;

  const filteredCounts = useMemo((): Record<Pile, number> => ({
    new:      filteredWords.filter((w) => w.pile === 'new').length,
    learning: filteredWords.filter((w) => w.pile === 'learning').length,
    mastered: filteredWords.filter((w) => w.pile === 'mastered').length,
    revisit:  filteredWords.filter((w) => w.pile === 'revisit').length,
  }), [filteredWords]);

  const recentWords = useMemo(() => filteredWords.slice(0, 5), [filteredWords]);


  return (
    <>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={[]}>
      <TopBar />
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      scrollEventThrottle={16}
      onScroll={onScrollTabBar}
    >
      <Text style={[styles.pageTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
        Practice
      </Text>
      {/* Streak */}
      <View style={[styles.streakBanner, {
        backgroundColor: colors.card,
        borderColor: colors.borderLight,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.13,
        shadowRadius: 6,
        elevation: 3,
      }]}>
        <Text style={[styles.streakNumber, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{streak}</Text>
        <Text style={[styles.streakLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>day streak</Text>
      </View>


      {/* Empty state tip */}
      {!hasWords && !tipDismissed && (
        <View style={[styles.tipCard, { backgroundColor: colors.surface, borderColor: colors.borderMid }]}>
          <View style={styles.tipContent}>
            <Ionicons name="bookmark-outline" size={20} color={colors.inkMid} style={{ marginTop: 1 }} />
            <Text style={[styles.tipText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
              Tap any word in The Brief to save it here for practice.
            </Text>
          </View>
          <SpringButton onPress={() => setTipDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color={colors.inkFaint} />
          </SpringButton>
        </View>
      )}

      {/* Word bank section */}
      {hasWords && (
        <>
        <Text style={[styles.sectionLabel, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
          WORD BANK
        </Text>

        <View style={styles.pilesGrid}>
          {PILE_META.map((pile) => {
            const count = filteredCounts[pile.key];
            const isEmpty = count === 0;
            return (
              <SpringButton
                key={pile.key}
                onPress={() => !isEmpty && navigation.navigate('WordBankList', { pile: pile.key, language: selectedLang })}
                activeOpacity={isEmpty ? 1 : 0.7}
                containerStyle={{ width: '47.5%' }}
                style={[
                  styles.pileCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.borderLight,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.12,
                    shadowRadius: 6,
                    elevation: 3,
                    opacity: isEmpty ? 0.38 : 1,
                  },
                ]}
              >
                <View style={[styles.pileIconBadge, { backgroundColor: pile.tint }]}>
                  <Ionicons name={pile.icon} size={18} color={pile.iconColor} />
                </View>
                <Text style={[styles.pileCount, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                  {count}
                </Text>
                <Text style={[styles.pileLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                  {pile.label}
                </Text>
                <Text style={[styles.pileDesc, { color: colors.inkFaint }]}>{pile.description}</Text>
              </SpringButton>
            );
          })}
        </View>

        <SpringButton
          onPress={() => navigation.navigate('WordBankList', { pile: 'all', language: selectedLang })}
          style={[styles.allWordsBtn, {
            backgroundColor: colors.card,
            borderColor: colors.borderLight,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.13,
            shadowRadius: 6,
            elevation: 3,
          }]}
         
        >
          <Ionicons name="library-outline" size={18} color={colors.inkMid} />
          <Text style={[styles.allWordsBtnText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
            View all {totalWords} words
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
        </SpringButton>
        </>
      )}

      {/* Games section */}
      <Text style={[styles.sectionLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, marginTop: Spacing.lg, marginBottom: Spacing.sm }]}>
        PRACTICE GAMES
      </Text>

      {GAMES.map((game) => (
        <SpringButton
          key={game.key}
          style={[styles.gameRow, {
            backgroundColor: colors.card,
            borderColor: colors.borderLight,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.13,
            shadowRadius: 6,
            elevation: 3,
            opacity: hasWords ? 1 : 0.45,
          }]}
          disabled={!hasWords}
          activeOpacity={hasWords ? 0.7 : 1}
          onPress={() => hasWords && navigation.navigate(game.key as any, { language: selectedLang })}
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
        </SpringButton>
      ))}

      {/* Recent words preview */}
      {hasWords && (
        <>
          <View style={[styles.sectionRow, { marginTop: Spacing.lg }]}>
            <Text style={[styles.sectionLabel, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
              RECENTLY SAVED
            </Text>
            <SpringButton
              style={[
                styles.practisePill,
                {
                  backgroundColor: colors.card,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.borderLight,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.08,
                  shadowRadius: 3,
                },
              ]}
              onPress={() => setGameModalVisible(true)}
             
            >
              <Text style={[styles.practisePillText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
                Practice →
              </Text>
            </SpringButton>
          </View>
        <View style={[styles.recentCard, {
          backgroundColor: colors.card,
          borderColor: colors.borderLight,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.13,
          shadowRadius: 6,
          elevation: 3,
        }]}>
          {recentWords.map((w, idx) => (
            <SpringButton
              key={w.id}
              style={[styles.wordRow, {
                borderTopColor: colors.borderLight,
                borderTopWidth: idx === 0 ? StyleSheet.hairlineWidth : 0,
                borderBottomColor: colors.borderLight,
                borderBottomWidth: idx === recentWords.length - 1 ? 0 : StyleSheet.hairlineWidth,
              }]}
              onPress={() => setSelectedWord(w)}
             
            >
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
              <Ionicons name="chevron-forward" size={14} color={colors.inkFaint} />
            </SpringButton>
          ))}
        </View>
        </>
      )}
    </ScrollView>

    {/* Game picker modal — launched from "Practise →" in Recently Saved */}
    <Modal
      visible={gameModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setGameModalVisible(false)}
    >
      <SpringButton style={modalStyles.overlay} onPress={() => setGameModalVisible(false)} />
      <View style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
        <View style={[modalStyles.handle, { backgroundColor: colors.borderMid }]} />
        <Text style={[modalStyles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
          {selectedLang !== 'all' ? `Practice · ${LANG_NATIVE[selectedLang as LanguageCode]}` : 'Choose a game'}
        </Text>
        {GAMES.map((game) => (
          <SpringButton
            key={game.key}
            style={[modalStyles.gameRow, { borderBottomColor: colors.borderLight }]}
            onPress={() => {
              setGameModalVisible(false);
              navigation.navigate(game.key as any, { language: selectedLang });
            }}
          >
            <View style={[modalStyles.gameIcon, { backgroundColor: game.tint + '1a' }]}>
              <Ionicons name={game.icon} size={20} color={game.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[modalStyles.gameName, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                {game.label}
              </Text>
              <Text style={[modalStyles.gameDesc, { color: colors.inkFaint }]}>{game.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
          </SpringButton>
        ))}
        <SpringButton style={modalStyles.cancel} onPress={() => setGameModalVisible(false)}>
          <Text style={[modalStyles.cancelText, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Cancel</Text>
        </SpringButton>
      </View>
    </Modal>
    </SafeAreaView>

    {/* Word detail popup for recently saved words */}
    <WordDetailSheet
      word={selectedWord}
      onClose={() => setSelectedWord(null)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: 0,
    paddingBottom: FLOAT_TAB_INSET,
  },
  streakBanner: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  streakNumber: { fontSize: 28, lineHeight: 34 },
  streakLabel: { fontSize: 12, letterSpacing: 0.5 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  pageTitle: {
    fontSize: 26,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: 13,
    letterSpacing: 1.8,
    fontWeight: '600',
  },
  practisePill: {
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 5,
    flexShrink: 0,
  },
  practisePillText: {
    fontSize: 12,
    letterSpacing: 0.3,
  },
  pilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: Spacing.sm,
  },
  pileCard: {
    padding: Spacing.md,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pileIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  pileCount: { fontSize: 28, lineHeight: 34 },
  pileLabel: { fontSize: 13, marginTop: 2 },
  pileDesc: { fontSize: 11, textAlign: 'center', marginTop: 2, lineHeight: 15 },
  allWordsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing.md, paddingVertical: 14,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  allWordsBtnText: { fontSize: 14 },
  recentCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  tipContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  tipText: { flex: 1, fontSize: 13, lineHeight: 18 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: { fontSize: 18, textAlign: 'center' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 22, opacity: 0.8 },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
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

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
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
  gameName: { lineHeight: 22 },
  gameDesc: { fontSize: 12, marginTop: 1 },
  cancel: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  cancelText: { fontSize: 15 },
});
