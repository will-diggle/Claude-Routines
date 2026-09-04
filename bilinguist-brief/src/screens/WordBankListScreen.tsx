import { SpringButton } from '../components/SpringButton';
import { GlassButton } from '../components/GlassButton';
import { BlurView } from 'expo-blur';
import React, { useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, Animated, Modal, Pressable, useWindowDimensions,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useWordBankStore, type SavedWord, type Pile } from '../store/useWordBankStore';
import { WordDetailSheet } from '../components/WordDetailSheet';
import { Spacing } from '../theme';
import type { LanguageCode } from '../store/useSettingsStore';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import { FLOAT_TAB_INSET, IPAD_SIDEBAR_W } from '../components/FloatingTabBar';

type WordBankNav = NativeStackNavigationProp<PracticeStackParamList>;

const GAMES: Array<{
  key: keyof PracticeStackParamList;
  label: string;
  icon: any;
  description: string;
  tint: string;
}> = [
  { key: 'Flashcards',     label: 'Flashcards',            icon: 'layers-outline',          description: 'Flip cards with spaced repetition',           tint: '#4A6FA5' },
  { key: 'Matching',       label: 'Speed Snap',            icon: 'grid-outline',            description: 'Match words to translations against the clock', tint: '#B5510A' },
  { key: 'MultipleChoice', label: 'Multiple Choice',       icon: 'list-outline',            description: 'Which word means…? Four options',              tint: '#1E6B3A' },
  { key: 'FillBlank',      label: 'Fill in the Blank',     icon: 'pencil-outline',          description: 'Complete the original news sentence',          tint: '#6A1B9A' },
  { key: 'Translation',    label: 'Translation Challenge', icon: 'swap-horizontal-outline', description: 'Translate between languages',                  tint: '#8B1A1A' },
];

const LANG_NATIVE: Partial<Record<LanguageCode, string>> = {
  fr: 'FR', de: 'DE', sv: 'SV', en: 'EN', it: 'IT', es: 'ES', tr: 'TR',
};

const PILE_COLOR: Record<Pile, string> = {
  new: '#4A6FA5', learning: '#F9A825', mastered: '#43A047', revisit: '#E53935',
};

const PILE_LABEL: Record<Pile | 'all', string> = {
  all: 'All Words', new: 'New Words', learning: 'Learning',
  mastered: 'Mastered', revisit: 'Revisit',
};

export function WordBankListScreen() {
  const { colors, fontFamily, fontSize, isDark } = useTheme();
  const { width: winW } = useWindowDimensions();
  const isIPad = winW >= 768;
  const navigation = useNavigation<WordBankNav>();
  const route = useRoute<RouteProp<PracticeStackParamList, 'WordBankList'>>();

  const { pile: initialPile = 'all', language: initialLang = 'all' } = route.params ?? {};

  const [selectedPile, setSelectedPile] = useState<Pile | 'all'>(initialPile);
  const [selectedLang, setSelectedLang] = useState<LanguageCode | 'all'>(initialLang);
  const [detailWord, setDetailWord] = useState<SavedWord | null>(null);
  const [gameModalVisible, setGameModalVisible] = useState(false);

  const { words, moveToPile, deleteWord } = useWordBankStore();

  // Track the currently open swipeable so we can close it when another opens
  const openSwipeable = useRef<Swipeable | null>(null);

  const presentLangs = Array.from(new Set(words.map((w) => w.language))) as LanguageCode[];

  const filtered = words.filter((w) => {
    if (selectedPile !== 'all' && w.pile !== selectedPile) return false;
    if (selectedLang !== 'all' && w.language !== selectedLang) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => a.word.localeCompare(b.word));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, paddingLeft: isIPad ? IPAD_SIDEBAR_W : 0 }} edges={['top']}>
      {/* Nav header */}
      <View style={[styles.navHeader, { borderBottomColor: colors.borderLight }]}>
        <GlassButton onPress={() => navigation.goBack()} size={44}>
          <Ionicons name="chevron-back" size={22} color={colors.inkDark} />
        </GlassButton>
        <Text style={[styles.navTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
          {PILE_LABEL[selectedPile]} {filtered.length > 0 ? `· ${filtered.length}` : ''}
        </Text>
        {filtered.length > 0 ? (
          <SpringButton
            style={[styles.practisePill, { borderColor: colors.borderMid, overflow: 'hidden' }]}
            onPress={() => setGameModalVisible(true)}
          >
            <BlurView
              intensity={isDark ? 60 : 70}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <Text style={[styles.practisePillText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
              Practice →
            </Text>
          </SpringButton>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      {/* Pile filter tabs */}
      <View style={[styles.filterRow, { borderBottomColor: colors.borderLight }]}>
        {(['all', 'new', 'learning', 'mastered', 'revisit'] as const).map((p) => {
          const active = selectedPile === p;
          const color = p === 'all' ? colors.chrome : PILE_COLOR[p];
          return (
            <SpringButton
              key={p}
              onPress={() => setSelectedPile(p)}
              style={[styles.filterTab, active && { borderBottomColor: color, borderBottomWidth: 2 }]}
            >
              <Text style={[styles.filterTabText, { color: active ? color : colors.inkFaint, fontFamily: fontFamily.regular }]}>
                {p === 'all' ? 'All' : PILE_LABEL[p].split(' ')[0]}
              </Text>
            </SpringButton>
          );
        })}
      </View>

      {/* Language filter (only if multiple languages) */}
      {presentLangs.length > 1 && (
        <View style={[styles.langRow, { borderBottomColor: colors.borderLight }]}>
          {(['all', ...presentLangs] as (LanguageCode | 'all')[]).map((lang) => {
            const active = selectedLang === lang;
            return (
              <SpringButton
                key={lang}
                onPress={() => setSelectedLang(lang)}
                style={[styles.langChip, { borderColor: active ? colors.inkDark : colors.borderMid },
                  active && { backgroundColor: colors.inkDark }]}
              >
                <Text style={[styles.langChipText, { color: active ? (colors.isNight ? colors.inkDark : '#FFF') : colors.inkMid, fontFamily: fontFamily.regular }]}>
                  {lang === 'all' ? 'All' : (LANG_NATIVE[lang] ?? lang.toUpperCase())}
                </Text>
              </SpringButton>
            );
          })}
        </View>
      )}

      {/* Word list */}
      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={36} color={colors.borderMid} />
          <Text style={[styles.emptyText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            No words here yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(w) => w.id}
          contentContainerStyle={{ paddingBottom: isIPad ? 40 : FLOAT_TAB_INSET }}
          renderItem={({ item }) => (
            <Swipeable
              ref={(ref) => {
                if (ref && openSwipeable.current && openSwipeable.current !== ref) {
                  openSwipeable.current.close();
                }
              }}
              onSwipeableOpen={() => {
                // close any previously open row
              }}
              friction={2}
              rightThreshold={60}
              renderRightActions={() => (
                <Pressable
                  style={styles.deleteAction}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    deleteWord(item.id);
                  }}
                >
                  <Ionicons name="trash-outline" size={22} color="#FFF" />
                  <Text style={[styles.deleteLabel, { fontFamily: fontFamily.regular }]}>Delete</Text>
                </Pressable>
              )}
            >
              <SpringButton
                style={[styles.wordRow, { borderBottomColor: colors.borderLight, backgroundColor: colors.bg }]}
                onPress={() => setDetailWord(item)}
               
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.word, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.body }]}>
                    {item.word}
                  </Text>
                  {item.translation ? (
                    <Text style={[styles.translation, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
                      {item.translation}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.wordMeta}>
                  <Text style={[styles.langTag, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    {LANG_NATIVE[item.language] ?? item.language.toUpperCase()}
                  </Text>
                  <View style={[styles.pileBadge, { borderColor: PILE_COLOR[item.pile] }]}>
                    <Text style={[styles.pileBadgeText, { color: PILE_COLOR[item.pile], fontFamily: fontFamily.regular }]}>
                      {item.pile}
                    </Text>
                  </View>
                  {(item.verbTable || item.forms || item.explanation) ? (
                    <Ionicons name="layers-outline" size={12} color={colors.accentGold} />
                  ) : null}
                </View>
              </SpringButton>
            </Swipeable>
          )}
        />
      )}

      <WordDetailSheet
        word={detailWord}
        onClose={() => setDetailWord(null)}
        onMovePile={moveToPile}
      />

      <Modal
        visible={gameModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGameModalVisible(false)}
      >
        <View style={modalStyles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGameModalVisible(false)} />
          <View style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[modalStyles.handle, { backgroundColor: colors.borderMid }]} />
          <Text style={[modalStyles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            {selectedLang !== 'all'
              ? `Practice · ${PILE_LABEL[selectedPile]} · ${selectedLang.toUpperCase()}`
              : `Practice · ${PILE_LABEL[selectedPile]}`}
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
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  navHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTitle: { fontSize: 16 },
  filterRow: {
    flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterTabText: { fontSize: 12, letterSpacing: 0.5 },
  langRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: 8,
    gap: 8, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  langChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  langChipText: { fontSize: 12, letterSpacing: 0.3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  emptyText: { fontSize: 15 },
  deleteAction: {
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    width: 82,
    alignSelf: 'stretch',
    gap: 4,
  },
  deleteLabel: {
    color: '#FFF',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  wordRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm,
  },
  word: {},
  translation: { fontSize: 13, marginTop: 2 },
  wordMeta: { alignItems: 'flex-end', gap: 4 },
  langTag: { fontSize: 10, letterSpacing: 1 },
  pileBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  pileBadgeText: { fontSize: 10, letterSpacing: 0.3 },
  practisePill: {
    borderWidth: 1, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 5,
  },
  practisePillText: { fontSize: 12, letterSpacing: 0.3 },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 34 },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  title: { fontSize: 16, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  gameRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md,
  },
  gameIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  gameName: { lineHeight: 22 },
  gameDesc: { fontSize: 12, marginTop: 1 },
  cancel: { paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  cancelText: { fontSize: 15 },
});
