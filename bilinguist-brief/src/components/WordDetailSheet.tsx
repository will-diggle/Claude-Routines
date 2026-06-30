import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, PanResponder, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { WordAudioButton } from './WordAudioButton';
import { Spacing } from '../theme';
import type { SavedWord, Pile } from '../store/useWordBankStore';
import type { LanguageCode } from '../store/useSettingsStore';
import { verifyTenses } from '../services/wordLookup';
import type { TenseTable } from '../services/wordService';

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
  const [activeTenseIdx, setActiveTenseIdx] = useState(0);
  const [verifiedTenses, setVerifiedTenses] = useState<TenseTable[] | null>(null);

  useEffect(() => {
    if (!word) return;
    setVerifiedTenses(null);
    setActiveTenseIdx(0);
    if (word.wordType !== 'verb' || !word.tenses?.length || !word.lemma) return;
    verifyTenses(word.tenses, word.lemma, word.language as LanguageCode)
      .then((v) => { if (v) setVerifiedTenses(v); })
      .catch(() => {});
  }, [word?.id]);

  const dragY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        dragY.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100) {
          onClose();
          dragY.setValue(0);
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
        }
      },
    })
  ).current;

  if (!word) return null;

  const lang = word.language as LanguageCode;
  const pileColor = PILE_COLOR[word.pile];

  // Verified > rich tenses array > legacy two-field fallback
  const tenses: Array<{ label: string; table: Record<string, string> }> = (() => {
    if (verifiedTenses && verifiedTenses.length > 0) return verifiedTenses;
    if (word.tenses && word.tenses.length > 0) return word.tenses;
    const list: Array<{ label: string; table: Record<string, string> }> = [];
    if (word.verbTable && Object.keys(word.verbTable).length > 0) {
      list.push({ label: 'PRESENT', table: word.verbTable });
    }
    if (word.verbTablePast && Object.keys(word.verbTablePast).length > 0) {
      list.push({ label: PAST_TENSE_LABEL[lang] ?? 'PAST', table: word.verbTablePast });
    }
    return list;
  })();
  const activeTense = tenses[activeTenseIdx] ?? null;

  const showLemma = word.lemma && word.lemma !== word.word.toLowerCase();

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 },
            { transform: [{ translateY: dragY }] },
          ]}
        >
          {/* Drag handle */}
          <View {...panResponder.panHandlers} style={styles.handleArea}>
            <View style={[styles.handle, { backgroundColor: colors.borderMid }]} />
          </View>

          {/* Word row: word · 🔊 · /IPA/ · ✕ */}
          <View style={styles.wordRow}>
            <Text style={[styles.wordText, { color: colors.inkDark, fontFamily: fontFamily.bold }]} numberOfLines={1} adjustsFontSizeToFit>
              {word.word}
            </Text>
            <View style={styles.wordRight}>
              <WordAudioButton word={word.word} language={lang} size="md" />
              {word.pronunciation ? (
                <Text style={[styles.ipaInline, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  /{word.pronunciation}/
                </Text>
              ) : null}
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={26} color={colors.inkLight} />
              </TouchableOpacity>
            </View>
          </View>

        {/* Subtitle: lemma */}
        {showLemma && (
          <Text style={[styles.subtitle, { color: colors.accentRed, fontFamily: fontFamily.italic }]}>
            ← {word.lemma}
          </Text>
        )}

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        {/* Translation — large, centered */}
        <View style={styles.translationBlock}>
          <Text style={[styles.translationLarge, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            {word.translation || '—'}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        {/* Grammar chips + pile badge on same row */}
        <View style={styles.chipsRow}>
          {word.wordType && (
            <View style={[styles.chipFilled, { backgroundColor: colors.accentRed }]}>
              <Text style={[styles.chipFilledText, { color: '#FFF', fontFamily: fontFamily.bold }]}>
                {word.wordType.charAt(0).toUpperCase() + word.wordType.slice(1)}
              </Text>
            </View>
          )}
          <View style={[styles.pileBadge, { borderColor: pileColor }]}>
            <Text style={[styles.pileBadgeText, { color: pileColor, fontFamily: fontFamily.regular }]}>
              {word.pile.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>

          {/* Explanation */}
          {word.explanation ? (
            <Text style={[styles.explanationCentered, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
              {word.explanation}
            </Text>
          ) : null}

          {/* Noun / adjective forms grid */}
          {word.forms && Object.keys(word.forms).length > 0 && (
            <View style={styles.formsGrid}>
              {Object.entries(word.forms).map(([key, value]) => (
                <View key={key} style={[styles.formBox, { backgroundColor: colors.borderLight }]}>
                  <Text style={[styles.formBoxLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    {key.replace(/_/g, ' ').toUpperCase()}
                  </Text>
                  <Text style={[styles.formBoxValue, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                    {String(value)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Example sentence (above verb tenses) */}
          {word.exampleSentence ? (
            <View style={[styles.blockquote, { borderLeftColor: colors.accentRed }]}>
              <Text style={[styles.blockquoteText, { color: colors.inkMid, fontFamily: fontFamily.italic, fontSize: fontSize.body }]}>
                „{word.exampleSentence}"
              </Text>
            </View>
          ) : null}

          {/* Verb tenses with centered label and circular nav arrows */}
          {tenses.length > 0 && activeTense && (
            <>
              <View style={styles.tenseSectionCenter}>
                <Text style={[styles.tenseSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  VERB TENSES
                </Text>
                {tenses.length > 1 ? (
                  <View style={styles.tenseNav}>
                    <TouchableOpacity
                      onPress={() => setActiveTenseIdx((i) => Math.max(0, i - 1))}
                      disabled={activeTenseIdx === 0}
                      style={[styles.tenseNavBtn, {
                        backgroundColor: activeTenseIdx === 0 ? colors.borderLight : colors.borderMid,
                      }]}
                    >
                      <Ionicons name="chevron-back" size={16} color={activeTenseIdx === 0 ? colors.borderMid : colors.inkDark} />
                    </TouchableOpacity>
                    <Text style={[styles.tenseLabel, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                      {activeTense.label}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setActiveTenseIdx((i) => Math.min(tenses.length - 1, i + 1))}
                      disabled={activeTenseIdx === tenses.length - 1}
                      style={[styles.tenseNavBtn, {
                        backgroundColor: activeTenseIdx === tenses.length - 1 ? colors.borderLight : colors.borderMid,
                      }]}
                    >
                      <Ionicons name="chevron-forward" size={16} color={activeTenseIdx === tenses.length - 1 ? colors.borderMid : colors.inkDark} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={[styles.tenseLabel, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                    {activeTense.label}
                  </Text>
                )}
              </View>
              {Object.entries(activeTense.table).map(([pronoun, form]) => (
                <View key={pronoun} style={[styles.conjRow, { borderTopColor: colors.borderLight }]}>
                  <Text style={[styles.conjPronoun, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>{pronoun}</Text>
                  <Text style={[styles.conjForm, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>{form}</Text>
                </View>
              ))}
            </>
          )}

          {/* Original sentence from briefing */}
          {word.originalSentence ? (
            <Text style={[styles.originalSentence, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              From briefing: {word.originalSentence.slice(0, 140)}{word.originalSentence.length > 140 ? '…' : ''}
            </Text>
          ) : null}

          {/* Tip */}
          {word.tip ? (
            <View style={[styles.tipBox, { borderColor: colors.borderMid }]}>
              <View style={styles.tipHeader}>
                <Ionicons name="bulb-outline" size={14} color={colors.accentRed} />
                <Text style={[styles.tipLabel, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>TIP</Text>
              </View>
              <Text style={[styles.tipText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>{word.tip}</Text>
            </View>
          ) : null}

          {/* Move pile buttons */}
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

        </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '90%' },

  handleArea: { paddingTop: 14, paddingBottom: 8, paddingHorizontal: 40, alignItems: 'center' },
  handle: { width: 44, height: 5, borderRadius: 3 },

  // Word row: word · 🔊 · /IPA/ · ✕
  wordRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs, gap: 8,
  },
  wordText: { fontSize: 34, flex: 1 },
  wordRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  ipaInline: { fontSize: 13, letterSpacing: 0.5 },
  subtitle: { fontSize: 15, textAlign: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },

  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.lg, marginVertical: Spacing.sm },

  // Translation block
  translationBlock: { alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  translationLarge: { fontSize: 26, textAlign: 'center' },

  // Chips row
  chipsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs,
    justifyContent: 'center',
  },
  chipFilled: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  chipFilledText: { fontSize: 13, letterSpacing: 0.3 },
  pileBadge: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  pileBadgeText: { fontSize: 13, letterSpacing: 0.5 },

  // Scroll body
  scrollArea: { paddingHorizontal: Spacing.lg },
  explanationCentered: { lineHeight: 24, textAlign: 'center', paddingVertical: Spacing.sm },

  // Forms grid
  formsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md },
  formBox: {
    width: '47.5%', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 5,
  },
  formBoxLabel: { fontSize: 10, letterSpacing: 1.5, marginBottom: 8 },
  formBoxValue: { fontSize: 18 },

  // Blockquote
  blockquote: { borderLeftWidth: 3, paddingLeft: 14, paddingVertical: 10, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  blockquoteText: { lineHeight: 22 },

  // Verb tenses — centered
  tenseSectionCenter: { alignItems: 'center', marginTop: Spacing.md, marginBottom: Spacing.xs },
  tenseSectionLabel: { fontSize: 10, letterSpacing: 1.5, marginBottom: 6 },
  tenseNav: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  tenseNavBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tenseLabel: { fontSize: 11, letterSpacing: 1, minWidth: 110, textAlign: 'center' },
  conjRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  conjPronoun: { fontSize: 13, flex: 1, fontStyle: 'italic' },
  conjForm: { fontSize: 13, flex: 1, textAlign: 'right' },

  originalSentence: { fontSize: 12, lineHeight: 18, marginTop: Spacing.sm, opacity: 0.6 },

  // Tip
  tipBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 14, marginTop: Spacing.sm, marginBottom: Spacing.md },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  tipLabel: { fontSize: 11, letterSpacing: 1.5 },
  tipText: { fontSize: 13, lineHeight: 20 },

  // Pile move
  pileButtons: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: Spacing.md, marginBottom: Spacing.md },
  movePileBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  movePileBtnText: { fontSize: 13 },
});
