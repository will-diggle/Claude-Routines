import React, { useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useWordBankStore, type SavedWord, type Pile } from '../store/useWordBankStore';
import { WordDetailSheet } from '../components/WordDetailSheet';
import { Spacing } from '../theme';
import type { LanguageCode } from '../store/useSettingsStore';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import { FLOAT_TAB_INSET } from '../components/FloatingTabBar';

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
  const { colors, fontFamily, fontSize } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PracticeStackParamList, 'WordBankList'>>();

  const { pile: initialPile = 'all', language: initialLang = 'all' } = route.params ?? {};

  const [selectedPile, setSelectedPile] = useState<Pile | 'all'>(initialPile);
  const [selectedLang, setSelectedLang] = useState<LanguageCode | 'all'>(initialLang);
  const [detailWord, setDetailWord] = useState<SavedWord | null>(null);

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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Nav header */}
      <View style={[styles.navHeader, { borderBottomColor: colors.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.inkDark} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
          {PILE_LABEL[selectedPile]} {filtered.length > 0 ? `· ${filtered.length}` : ''}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Pile filter tabs */}
      <View style={[styles.filterRow, { borderBottomColor: colors.borderLight }]}>
        {(['all', 'new', 'learning', 'mastered', 'revisit'] as const).map((p) => {
          const active = selectedPile === p;
          const color = p === 'all' ? colors.chrome : PILE_COLOR[p];
          return (
            <TouchableOpacity
              key={p}
              onPress={() => setSelectedPile(p)}
              style={[styles.filterTab, active && { borderBottomColor: color, borderBottomWidth: 2 }]}
            >
              <Text style={[styles.filterTabText, { color: active ? color : colors.inkFaint, fontFamily: fontFamily.regular }]}>
                {p === 'all' ? 'All' : PILE_LABEL[p].split(' ')[0]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Language filter (only if multiple languages) */}
      {presentLangs.length > 1 && (
        <View style={[styles.langRow, { borderBottomColor: colors.borderLight }]}>
          {(['all', ...presentLangs] as (LanguageCode | 'all')[]).map((lang) => {
            const active = selectedLang === lang;
            return (
              <TouchableOpacity
                key={lang}
                onPress={() => setSelectedLang(lang)}
                style={[styles.langChip, { borderColor: active ? colors.inkDark : colors.borderMid },
                  active && { backgroundColor: colors.inkDark }]}
              >
                <Text style={[styles.langChipText, { color: active ? (colors.isNight ? colors.inkDark : '#FFF') : colors.inkMid, fontFamily: fontFamily.regular }]}>
                  {lang === 'all' ? 'All' : (LANG_NATIVE[lang] ?? lang.toUpperCase())}
                </Text>
              </TouchableOpacity>
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
          contentContainerStyle={{ paddingBottom: FLOAT_TAB_INSET }}
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
              renderRightActions={(progress) => {
                const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1], extrapolate: 'clamp' });
                return (
                  <Animated.View style={[styles.deleteAction, { transform: [{ scale }] }]}>
                    <TouchableOpacity
                      style={styles.deleteActionInner}
                      onPress={() => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        deleteWord(item.id);
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color="#FFF" />
                      <Text style={[styles.deleteLabel, { fontFamily: fontFamily.regular }]}>Delete</Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              }}
            >
              <TouchableOpacity
                style={[styles.wordRow, { borderBottomColor: colors.borderLight, backgroundColor: colors.bg }]}
                onPress={() => setDetailWord(item)}
                activeOpacity={0.7}
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
              </TouchableOpacity>
            </Swipeable>
          )}
        />
      )}

      <WordDetailSheet
        word={detailWord}
        onClose={() => setDetailWord(null)}
        onMovePile={moveToPile}
      />
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
    justifyContent: 'center',
    marginBottom: StyleSheet.hairlineWidth,
  },
  deleteActionInner: {
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    width: 76,
    gap: 4,
    alignSelf: 'stretch',
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
});
