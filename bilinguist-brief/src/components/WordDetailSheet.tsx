import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, PanResponder, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { WordAudioButton } from './WordAudioButton';
import { WordPopup } from './WordPopup';
import { GlassButton } from './GlassButton';
import { Spacing } from '../theme';
import { useWordBankStore, type SavedWord, type Pile } from '../store/useWordBankStore';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import { verifyTenses } from '../services/wordLookup';
import { lookupWord, type TenseTable } from '../services/wordService';

const PAST_TENSE_LABEL: Partial<Record<LanguageCode, string>> = {
  fr: 'PASSÉ COMPOSÉ', de: 'PRÄTERITUM', es: 'PRETÉRITO',
  it: 'PASSATO PROSSIMO', sv: 'PRETERITUM', en: 'SIMPLE PAST', tr: 'GEÇMİŞ ZAMAN',
};

const CASE_EXPAND_DS: Record<string, string> = {
  NOM: 'Nominative', AKK: 'Accusative', DAT: 'Dative', GEN: 'Genitive',
  ACC: 'Accusative', LOC: 'Locative', ABL: 'Ablative',
};
function expandKeyDS(raw: string): string {
  const u = raw.toUpperCase().trim();
  return CASE_EXPAND_DS[u] ?? (raw.charAt(0).toUpperCase() + raw.slice(1));
}
type SplitDeclDS =
  | { mode: 'split'; singular: Record<string, string>; plural: Record<string, string> }
  | { mode: 'flat';  table: Record<string, string> };
function splitDeclTableDS(table: Record<string, string>): SplitDeclDS {
  const hasSg = Object.keys(table).some((k) => / sg$/i.test(k));
  const hasPl = Object.keys(table).some((k) => / pl$/i.test(k));
  if (hasSg && hasPl) {
    const singular: Record<string, string> = {};
    const plural: Record<string, string> = {};
    for (const [k, v] of Object.entries(table)) {
      if (/ sg$/i.test(k)) singular[expandKeyDS(k.replace(/ sg$/i, '').trim())] = v;
      else if (/ pl$/i.test(k)) plural[expandKeyDS(k.replace(/ pl$/i, '').trim())] = v;
    }
    return { mode: 'split', singular, plural };
  }
  const expanded: Record<string, string> = {};
  for (const [k, v] of Object.entries(table)) expanded[expandKeyDS(k)] = v;
  return { mode: 'flat', table: expanded };
}

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
  const [activeDeclIdx, setActiveDeclIdx] = useState(0);
  const [declNumber, setDeclNumber] = useState<'sg' | 'pl'>('sg');
  const [liveDecl, setLiveDecl] = useState<TenseTable[] | null>(null);
  const [nestedWord, setNestedWord] = useState<string | null>(null);

  const backfillWord = useWordBankStore((s) => s.backfillWord);

  useEffect(() => {
    if (!word) return;
    setVerifiedTenses(null);
    setActiveTenseIdx(0);
    setActiveDeclIdx(0);
    setDeclNumber('sg');
    setLiveDecl(null);
    const isVerb = word.wordType === 'verb' || !!word.verbTable;
    const hasTenses = Array.isArray(word.tenses) && word.tenses.length > 2;

    if (isVerb && hasTenses && word.lemma) {
      // Existing full tenses — just verify them
      verifyTenses(word.tenses!, word.lemma, word.language as LanguageCode)
        .then((v) => { if (v) setVerifiedTenses(v); })
        .catch(() => {});
    } else if (isVerb) {
      // Missing or legacy 2-tense data — bypass in-memory cache, hit worker for backfilled tenses
      lookupWord(word.word, word.language as LanguageCode, (word.level as LanguageLevel) ?? 'B1', { forceRefresh: true })
        .then((result) => {
          if (result?.tenses && result.tenses.length > 0) {
            setVerifiedTenses(result.tenses);
            backfillWord(word.word, word.language as LanguageCode, { tenses: result.tenses });
          }
        })
        .catch(() => {});
    } else {
      // Non-verb — use stored declensions or fetch from worker if missing
      const hasDeclensions = Array.isArray(word.declensions) && word.declensions.length > 0;
      if (hasDeclensions) {
        setLiveDecl(word.declensions!);
      } else {
        lookupWord(word.word, word.language as LanguageCode, (word.level as LanguageLevel) ?? 'B1', { forceRefresh: true })
          .then((result) => {
            if (result?.declensions && result.declensions.length > 0) {
              setLiveDecl(result.declensions);
              backfillWord(word.word, word.language as LanguageCode, { declensions: result.declensions });
            }
          })
          .catch(() => {});
      }
    }
  }, [word?.id]);

  const dragY = useRef(new Animated.Value(700)).current;
  const overlayOpacity = dragY.interpolate({ inputRange: [0, 300], outputRange: [0.35, 0], extrapolate: 'clamp' });

  useEffect(() => {
    Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }, []);

  const dismissSheet = useCallback(() => {
    Animated.timing(dragY, { toValue: 800, duration: 220, useNativeDriver: true }).start(() => onClose());
  }, [onClose]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        dragY.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100) {
          Animated.timing(dragY, { toValue: 800, duration: 220, useNativeDriver: true }).start(() => onClose());
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
        }
      },
    })
  ).current;

  if (!word) return null;

  const lang = word.language as LanguageCode;

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

  // Subtitle: lemma · /IPA/ for all word types
  const dsSubtitleLemma = (() => {
    const wt = word.wordType;
    const f = word.forms;
    if (wt === 'noun' && f) {
      if (f.article && word.lemma) return `${f.article} ${word.lemma}`;
    }
    if (word.lemma && word.lemma !== word.word.toLowerCase()) return word.lemma;
    return null;
  })();
  const dsPillLabel = (() => {
    const wt = word.wordType;
    if (wt === 'verb') return 'Infinitive';
    if (wt === 'noun') return 'Noun';
    if (wt === 'adjective') return 'Adjective';
    if (wt === 'adverb') return 'Adverb';
    return 'Root';
  })();

  return (
    <Modal visible animationType="none" transparent onRequestClose={dismissSheet}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: overlayOpacity }]} pointerEvents="none" />
      <View style={styles.modalContainer}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismissSheet} />

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

          {/* Word row: stub · [mirror·word·🔊 centered] · ✕ */}
          <View style={styles.wordRow}>
            <View style={styles.wordStub} />
            <View style={styles.wordCenterZone}>
              <View style={styles.wordSpeakerMirror} />
              <Text style={[styles.wordText, { color: colors.inkDark, fontFamily: fontFamily.bold }]} numberOfLines={1} adjustsFontSizeToFit>
                {word.word}
              </Text>
              <WordAudioButton word={word.word} language={lang} size="md" />
            </View>
            <GlassButton onPress={dismissSheet} size={36} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={colors.inkMid} />
            </GlassButton>
          </View>

        {/* Subtitle: pill (lemma, tappable) + IPA */}
        {(dsSubtitleLemma || word.pronunciation) && (
          <View style={styles.subtitleRow}>
            {dsSubtitleLemma && (
              <TouchableOpacity
                onPress={() => setNestedWord(dsSubtitleLemma)}
                activeOpacity={0.7}
                style={[
                  styles.infinitivePill,
                  {
                    backgroundColor: colors.card,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.borderLight,
                  },
                ]}
              >
                <Text style={[styles.infinitivePillText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
                  {dsPillLabel}: {dsSubtitleLemma}
                </Text>
                <Ionicons name="chevron-forward" size={11} color={colors.inkMid} />
              </TouchableOpacity>
            )}
            {word.pronunciation && (
              <Text style={[styles.subtitleIPA, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                {dsSubtitleLemma ? `· ${word.pronunciation}` : word.pronunciation}
              </Text>
            )}
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        {/* Translation — large, centered */}
        <View style={styles.translationBlock}>
          <Text style={[styles.translationLarge, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            {word.translation || '—'}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        {/* Grammar tag row — plain text, same style as brief word popup */}
        {word.wordType && (
          <View style={styles.chipsRow}>
            <Text style={[styles.grammarTags, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
              {[
                word.wordType.charAt(0).toUpperCase() + word.wordType.slice(1),
                word.pile !== 'new' ? word.pile.charAt(0).toUpperCase() + word.pile.slice(1) : null,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>

          {/* Explanation */}
          {word.explanation ? (
            <Text style={[styles.explanationCentered, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
              {word.explanation}
            </Text>
          ) : null}

          {/* Example sentence — directly under definition */}
          {word.exampleSentence ? (
            <View style={[styles.blockquote, { borderLeftColor: colors.accentRed }]}>
              <Text style={[styles.blockquoteText, { color: colors.inkMid, fontFamily: fontFamily.italic, fontSize: 13 }]}>
                „{word.exampleSentence}"
              </Text>
            </View>
          ) : null}

          {/* Noun / adjective forms — plain rows with centered header */}
          {word.forms && Object.keys(word.forms).length > 0 && (
            <View style={styles.formsList}>
              <Text style={[styles.tenseSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular, textAlign: 'center', marginBottom: 4 }]}>
                FORMS
              </Text>
              {Object.entries(word.forms).map(([key, value]) => (
                <View key={key} style={[styles.formsRow, { borderTopColor: colors.borderLight }]}>
                  <Text style={[styles.formsRowLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    {key.replace(/_/g, ' ')}
                  </Text>
                  <Text style={[styles.formsRowValue, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                    {String(value)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Declension / inflection table — nouns, adjectives, adverbs */}
          {liveDecl && liveDecl.length > 0 && (() => {
            const allDecl = liveDecl;
            const activeDecl = allDecl[activeDeclIdx];
            if (!activeDecl) return null;
            const split = splitDeclTableDS(activeDecl.table);
            const INLINE_THRESHOLD = 13;
            const useInline = split.mode === 'split' && [
              ...Object.values(split.singular),
              ...Object.values(split.plural),
            ].every(v => v.length <= INLINE_THRESHOLD);
            const sectionLabel = split.mode === 'split' ? activeDecl.label : 'FORMS';

            if (useInline) {
              const caseKeys = Object.keys(split.singular);
              return (
                <>
                  <Text style={[styles.tenseSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular, textAlign: 'center', marginTop: Spacing.sm, marginBottom: 4 }]}>
                    {sectionLabel}
                  </Text>
                  <View style={[styles.declRow, { borderTopColor: colors.borderLight }]}>
                    <View style={styles.declCaseCol} />
                    <Text style={[styles.declColHeader, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>SG</Text>
                    <Text style={[styles.declColHeader, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>PL</Text>
                  </View>
                  {caseKeys.map((caseKey) => (
                    <View key={caseKey} style={[styles.declRow, { borderTopColor: colors.borderLight }]}>
                      <Text style={[styles.declCaseLabel, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>{caseKey}</Text>
                      <Text style={[styles.declValue, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>{split.singular[caseKey] ?? '—'}</Text>
                      <Text style={[styles.declValue, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>{split.plural[caseKey] ?? '—'}</Text>
                    </View>
                  ))}
                </>
              );
            }

            const rows = split.mode === 'split'
              ? (declNumber === 'sg' ? split.singular : split.plural)
              : split.table;
            const navLabel = split.mode === 'split'
              ? (declNumber === 'sg' ? 'SINGULAR' : 'PLURAL')
              : activeDecl.label;
            return (
              <>
                <View style={styles.tenseSectionCenter}>
                  <Text style={[styles.tenseSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    {sectionLabel}
                  </Text>
                  <View style={styles.tenseNav}>
                    <TouchableOpacity
                      onPress={() => {
                        if (split.mode === 'split' && declNumber === 'pl') { setDeclNumber('sg'); }
                        else { setActiveDeclIdx((i) => Math.max(0, i - 1)); setDeclNumber('sg'); }
                      }}
                      disabled={activeDeclIdx === 0 && (split.mode !== 'split' || declNumber === 'sg')}
                      style={[styles.tenseNavBtn, {
                        backgroundColor: (activeDeclIdx === 0 && (split.mode !== 'split' || declNumber === 'sg'))
                          ? colors.borderLight : colors.borderMid,
                      }]}
                    >
                      <Ionicons name="chevron-back" size={16} color={
                        (activeDeclIdx === 0 && (split.mode !== 'split' || declNumber === 'sg'))
                          ? colors.borderMid : colors.inkDark
                      } />
                    </TouchableOpacity>
                    <Text style={[styles.tenseLabel, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                      {navLabel}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (split.mode === 'split' && declNumber === 'sg') { setDeclNumber('pl'); }
                        else { setActiveDeclIdx((i) => Math.min(allDecl.length - 1, i + 1)); setDeclNumber('sg'); }
                      }}
                      disabled={activeDeclIdx === allDecl.length - 1 && (split.mode !== 'split' || declNumber === 'pl')}
                      style={[styles.tenseNavBtn, {
                        backgroundColor: (activeDeclIdx === allDecl.length - 1 && (split.mode !== 'split' || declNumber === 'pl'))
                          ? colors.borderLight : colors.borderMid,
                      }]}
                    >
                      <Ionicons name="chevron-forward" size={16} color={
                        (activeDeclIdx === allDecl.length - 1 && (split.mode !== 'split' || declNumber === 'pl'))
                          ? colors.borderMid : colors.inkDark
                      } />
                    </TouchableOpacity>
                  </View>
                </View>
                {Object.entries(rows).map(([key, value]) => (
                  <View key={key} style={[styles.conjRow, { borderTopColor: colors.borderLight }]}>
                    <Text style={[styles.conjPronoun, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>{key}</Text>
                    <Text style={[styles.conjForm, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>{value}</Text>
                  </View>
                ))}
              </>
            );
          })()}

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

      {nestedWord && (
        <WordPopup
          word={nestedWord}
          lemma={nestedWord}
          sentence={word.exampleSentence ?? word.word}
          language={lang}
          level={(word.level as LanguageLevel) ?? 'B1'}
          genre=""
          isNested
          onClose={() => setNestedWord(null)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1 },
  sheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '90%' },

  handleArea: { paddingTop: 14, paddingBottom: 8, paddingHorizontal: 40, alignItems: 'center' },
  handle: { width: 44, height: 5, borderRadius: 3 },

  // Word row: word · 🔊 · /IPA/ · ✕
  wordRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs, gap: 8,
  },
  wordStub: { width: 36 },
  wordCenterZone: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  wordSpeakerMirror: { width: 34 },
  wordText: { fontSize: 34, flexShrink: 1 },
  ipaInline: { fontSize: 13, letterSpacing: 0.5 },
  subtitleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.xs, flexWrap: 'wrap',
  },
  infinitivePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 11, paddingVertical: 4, borderRadius: 99,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  infinitivePillText: { fontSize: 14 },
  subtitleIPA: { fontSize: 14, fontStyle: 'italic' },

  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.lg, marginVertical: Spacing.sm },

  // Translation block
  translationBlock: { alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  translationLarge: { fontSize: 26, textAlign: 'center' },

  // Grammar tag row — dot-separated plain text (matches brief word popup style)
  chipsRow: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs,
  },
  grammarTags: { fontSize: 13, textAlign: 'center', letterSpacing: 0.2 },

  // Scroll body
  scrollArea: { paddingHorizontal: Spacing.lg },
  explanationCentered: { lineHeight: 24, textAlign: 'center', paddingVertical: Spacing.sm },

  // Forms plain rows (replaces old grid tiles)
  formsList: { marginBottom: 4 },
  formsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  formsRowLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  formsRowValue: { fontSize: 15 },

  // Blockquote
  blockquote: { borderLeftWidth: 3, paddingLeft: 14, paddingVertical: 10, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  blockquoteText: { lineHeight: 22 },

  // Verb tenses — centered
  tenseSectionCenter: { alignItems: 'center', marginTop: Spacing.sm, marginBottom: Spacing.xs },
  tenseSectionLabel: { fontSize: 10, letterSpacing: 1.5, marginBottom: 6 },
  tenseNav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tenseNavBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tenseLabel: { fontSize: 11, letterSpacing: 1, width: 160, textAlign: 'center' },
  conjRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  conjPronoun: { fontSize: 13, flex: 1, fontStyle: 'italic' },
  conjForm: { fontSize: 13, flex: 1, textAlign: 'right' },
  declRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth },
  declCaseCol: { flex: 1.2 },
  declCaseLabel: { flex: 1.2, fontSize: 12 },
  declColHeader: { flex: 1, fontSize: 10, letterSpacing: 1, textAlign: 'right' },
  declValue: { flex: 1, fontSize: 13, textAlign: 'right' },

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
