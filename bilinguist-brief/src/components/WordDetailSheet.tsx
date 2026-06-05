import React from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { WordAudioButton } from './WordAudioButton';
import { Spacing } from '../theme';
import type { SavedWord, Pile } from '../store/useWordBankStore';
import type { LanguageCode } from '../store/useSettingsStore';

const PAST_TENSE_LABEL: Partial<Record<LanguageCode, string>> = {
  fr: 'PASSÉ COMPOSÉ', de: 'PRÄTERITUM', es: 'PRETÉRITO',
  it: 'PASSATO PROSSIMO', sv: 'PRETERITUM', en: 'SIMPLE PAST', tr: 'GEÇMİŞ ZAMAN',
};

const PILE_COLOR: Record<Pile, string> = {
  new: '#4A6FA5', learning: '#F9A825', mastered: '#43A047', revisit: '#E53935',
};

interface Props {
  word: SavedWord | null;
  onClose: () => void;
  onMovePile?: (id: string, pile: Pile) => void;
}

export function WordDetailSheet({ word, onClose, onMovePile }: Props) {
  const { colors, fontFamily, fontSize } = useTheme();
  const insets = useSafeAreaInsets();

  if (!word) return null;

  const lang = word.language as LanguageCode;
  const pileColor = PILE_COLOR[word.pile];
  const hasRichData = !!(word.verbTable || word.forms || word.explanation);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />

      <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={[styles.handle, { backgroundColor: colors.borderMid }]} />

        {/* Header: word + audio + close */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.word, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
              {word.word}
            </Text>
            {word.lemma && word.lemma !== word.word.toLowerCase() && (
              <Text style={[styles.lemma, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                ← {word.lemma}
              </Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <WordAudioButton word={word.word} language={lang} size="md" />
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={colors.inkLight} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Translation row */}
        <View style={[styles.translationRow, { borderTopColor: colors.borderLight, borderBottomColor: colors.borderLight }]}>
          <Text style={[styles.translationLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>EN</Text>
          <Text style={[styles.translation, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
            {word.translation || '—'}
          </Text>
          {word.wordType && (
            <View style={[styles.typeBadge, { backgroundColor: colors.borderLight }]}>
              <Text style={[styles.typeBadgeText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                {word.wordType.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>

          {/* Pile status + move options */}
          <View style={styles.pileRow}>
            <View style={[styles.pileBadge, { borderColor: pileColor }]}>
              <Text style={[styles.pileBadgeText, { color: pileColor, fontFamily: fontFamily.regular }]}>
                {word.pile.toUpperCase()}
              </Text>
            </View>
            {onMovePile && (
              <View style={styles.pileButtons}>
                {(['new', 'learning', 'mastered', 'revisit'] as Pile[])
                  .filter((p) => p !== word.pile)
                  .map((p) => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => { onMovePile(word.id, p); onClose(); }}
                      style={[styles.movePileBtn, { borderColor: PILE_COLOR[p] }]}
                    >
                      <Text style={[styles.movePileBtnText, { color: PILE_COLOR[p], fontFamily: fontFamily.regular }]}>
                        → {p}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
            )}
          </View>

          {/* Explanation */}
          {word.explanation ? (
            <>
              <Text style={[styles.subLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>EXPLANATION</Text>
              <Text style={[styles.explanation, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                {word.explanation}
              </Text>
            </>
          ) : null}

          {/* Conjugation tables */}
          {word.verbTable && Object.keys(word.verbTable).length > 0 && (
            <>
              <Text style={[styles.subLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>CONJUGATION</Text>
              <View style={styles.conjColumns}>
                <View style={styles.conjCol}>
                  <Text style={[styles.conjHeader, { color: colors.accentGold, fontFamily: fontFamily.regular }]}>PRESENT</Text>
                  {Object.entries(word.verbTable).map(([pronoun, form]) => (
                    <View key={pronoun} style={[styles.conjRow, { borderTopColor: colors.borderLight }]}>
                      <Text style={[styles.conjPronoun, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>{pronoun}</Text>
                      <Text style={[styles.conjForm, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{form}</Text>
                    </View>
                  ))}
                </View>
                {word.verbTablePast && Object.keys(word.verbTablePast).length > 0 && (
                  <>
                    <View style={[styles.conjDivider, { backgroundColor: colors.borderLight }]} />
                    <View style={styles.conjCol}>
                      <Text style={[styles.conjHeader, { color: colors.accentGold, fontFamily: fontFamily.regular }]}>
                        {PAST_TENSE_LABEL[lang] ?? 'PAST'}
                      </Text>
                      {Object.entries(word.verbTablePast).map(([pronoun, form]) => (
                        <View key={pronoun} style={[styles.conjRow, { borderTopColor: colors.borderLight }]}>
                          <Text style={[styles.conjPronoun, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>{pronoun}</Text>
                          <Text style={[styles.conjForm, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{form}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </>
          )}

          {/* Noun / adjective forms */}
          {word.forms && Object.keys(word.forms).length > 0 && (
            <>
              <Text style={[styles.subLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>FORMS</Text>
              <View style={styles.formsRow}>
                {Object.entries(word.forms).map(([key, value]) => (
                  <View key={key} style={[styles.formChip, { backgroundColor: colors.borderLight }]}>
                    <Text style={[styles.formChipLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>{key.toUpperCase()}</Text>
                    <Text style={[styles.formChipValue, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{value}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Pronunciation */}
          {word.pronunciation ? (
            <>
              <Text style={[styles.subLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>PRONUNCIATION</Text>
              <Text style={[styles.pronunciation, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>/{word.pronunciation}/</Text>
            </>
          ) : null}

          {/* Example sentence */}
          {word.exampleSentence ? (
            <>
              <Text style={[styles.subLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>EXAMPLE</Text>
              <Text style={[styles.example, { color: colors.inkMid, fontFamily: fontFamily.italic, fontSize: fontSize.body }]}>
                "{word.exampleSentence}"
              </Text>
            </>
          ) : null}

          {/* Original sentence from briefing */}
          {word.originalSentence ? (
            <Text style={[styles.original, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              From briefing: {word.originalSentence.slice(0, 140)}{word.originalSentence.length > 140 ? '…' : ''}
            </Text>
          ) : null}

          {/* Tip */}
          {word.tip ? (
            <View style={[styles.tipBox, { backgroundColor: colors.borderLight }]}>
              <Ionicons name="bulb-outline" size={13} color={colors.accentGold} />
              <Text style={[styles.tipText, { color: colors.inkMid, fontFamily: fontFamily.italic }]}>{word.tip}</Text>
            </View>
          ) : null}

          {!hasRichData && (
            <Text style={[styles.noData, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
              Tap this word in your briefing to load the full dictionary entry.
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '82%' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  headerLeft: { flex: 1, gap: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginLeft: Spacing.md },
  word: {},
  lemma: { fontSize: 13 },
  translationRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm, minHeight: 48,
  },
  translationLabel: { fontSize: 10, letterSpacing: 1, width: 24 },
  translation: { flex: 1 },
  typeBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText: { fontSize: 10, letterSpacing: 1.5 },
  body: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  pileRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  pileBadge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  pileBadgeText: { fontSize: 11, letterSpacing: 0.5 },
  pileButtons: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  movePileBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  movePileBtnText: { fontSize: 11 },
  subLabel: { fontSize: 10, letterSpacing: 1.5, marginTop: Spacing.md, marginBottom: Spacing.xs },
  explanation: { lineHeight: 24, marginBottom: Spacing.xs },
  conjColumns: { flexDirection: 'row', marginBottom: Spacing.sm },
  conjCol: { flex: 1 },
  conjDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: 8 },
  conjHeader: { fontSize: 9, letterSpacing: 1.5, marginBottom: 6 },
  conjRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth },
  conjPronoun: { fontSize: 12, flex: 1 },
  conjForm: { fontSize: 12, flex: 1, textAlign: 'right' },
  formsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.xs },
  formChip: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  formChipLabel: { fontSize: 9, letterSpacing: 1.5, marginBottom: 2 },
  formChipValue: { fontSize: 15 },
  pronunciation: { fontSize: 15, letterSpacing: 1, marginBottom: Spacing.xs },
  example: { lineHeight: 22, marginBottom: Spacing.xs },
  original: { fontSize: 12, lineHeight: 18, marginTop: Spacing.sm, opacity: 0.6 },
  tipBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginTop: Spacing.md },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19 },
  noData: { fontSize: 13, textAlign: 'center', paddingVertical: Spacing.xl, lineHeight: 22 },
});
