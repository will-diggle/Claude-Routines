import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  PanResponder,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useWordBankStore } from '../store/useWordBankStore';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { lookupWord } from '../services/wordService';
import type { WordEntry, TenseTable } from '../services/wordService';
import { verifyTenses } from '../services/wordLookup';
import { translateWord } from '../services/deepl';
import { writeBackDictionary } from '../services/dictionaryService';
import { Spacing } from '../theme';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import * as analytics from '../services/analytics';
import { GlassButton } from './GlassButton';
import { WordAudioButton } from './WordAudioButton';

// Expand abbreviated case labels to full words
const CASE_EXPAND: Record<string, string> = {
  NOM: 'Nominative', AKK: 'Accusative', DAT: 'Dative', GEN: 'Genitive',
  ACC: 'Accusative', LOC: 'Locative', ABL: 'Ablative',
};
function expandKey(raw: string): string {
  const u = raw.toUpperCase().trim();
  return CASE_EXPAND[u] ?? (raw.charAt(0).toUpperCase() + raw.slice(1));
}

// If a declension table has "X sg" / "X pl" keys, split into two sub-tables
type SplitDecl =
  | { mode: 'split'; singular: Record<string, string>; plural: Record<string, string> }
  | { mode: 'flat';  table: Record<string, string> };

function splitDeclTable(table: Record<string, string>): SplitDecl {
  const hasSg = Object.keys(table).some((k) => / sg$/i.test(k));
  const hasPl = Object.keys(table).some((k) => / pl$/i.test(k));
  if (hasSg && hasPl) {
    const singular: Record<string, string> = {};
    const plural: Record<string, string> = {};
    for (const [k, v] of Object.entries(table)) {
      if (/ sg$/i.test(k)) singular[expandKey(k.replace(/ sg$/i, '').trim())] = v;
      else if (/ pl$/i.test(k)) plural[expandKey(k.replace(/ pl$/i, '').trim())] = v;
    }
    return { mode: 'split', singular, plural };
  }
  const expanded: Record<string, string> = {};
  for (const [k, v] of Object.entries(table)) expanded[expandKey(k)] = v;
  return { mode: 'flat', table: expanded };
}

const PAST_TENSE_LABEL: Partial<Record<LanguageCode, string>> = {
  fr: 'PASSÉ COMPOSÉ',
  de: 'PRÄTERITUM',
  es: 'PRETÉRITO',
  it: 'PASSATO PROSSIMO',
  sv: 'PRETERITUM',
  en: 'SIMPLE PAST',
  tr: 'GEÇMİŞ ZAMAN',
};

interface Props {
  word: string | null;
  /** Lemma resolved from token map (e.g. "ansehen" for tapped "sehe"). Falls back to word. */
  lemma?: string;
  sentence: string;
  language: LanguageCode;
  level: LanguageLevel;
  genre?: string;
  onClose: () => void;
  /** When true, shows a back arrow (←) instead of close (✕) — used for nested infinitive popup */
  isNested?: boolean;
}

export function WordPopup({ word, lemma, sentence, language, level, genre, onClose, isNested = false }: Props) {
  const lookupLemma = lemma ?? word ?? '';

  const { colors, fontFamily, fontSize, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { saveWord, isWordSaved, backfillWord } = useWordBankStore();
  const { isFullAccess } = useSubscriptionStore();
  const fullAccess = isFullAccess();

  const [entry, setEntry] = useState<WordEntry | null>(null);
  const [quickTranslation, setQuickTranslation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTenseIdx, setActiveTenseIdx] = useState(0);
  const [verifiedTenses, setVerifiedTenses] = useState<TenseTable[] | null>(null);
  const [activeDeclIdx, setActiveDeclIdx] = useState(0);
  const [declNumber, setDeclNumber] = useState<'sg' | 'pl'>('sg');
  const [nestedWord, setNestedWord] = useState<string | null>(null);

  const alreadySaved = word ? isWordSaved(word, language) : false;

  // Sheet slides in from bottom; dragY drives both position and backdrop opacity.
  const dragY = useRef(new Animated.Value(700)).current;
  const overlayOpacity = dragY.interpolate({ inputRange: [0, 300], outputRange: [0.45, 0], extrapolate: 'clamp' });

  // Track whether the inner ScrollView is at its top so we know when to
  // let the parent sheet capture the drag gesture instead.
  const scrollAtTop = useRef(true);

  useEffect(() => {
    Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }, []);

  const dismissSheet = useCallback(() => {
    Animated.timing(dragY, { toValue: 800, duration: 220, useNativeDriver: true }).start(() => onClose());
  }, [onClose]);

  // Keep a stable ref so the panResponder closure never goes stale.
  const dismissRef = useRef(dismissSheet);
  useEffect(() => { dismissRef.current = dismissSheet; }, [dismissSheet]);

  const panResponder = useRef(
    PanResponder.create({
      // Don't claim on touch-start — let child ScrollViews handle taps/scroll.
      onStartShouldSetPanResponder: () => false,
      // Claim when the scroll content is at top AND the gesture is clearly downward.
      onMoveShouldSetPanResponder: (_, g) =>
        scrollAtTop.current && g.dy > 6 && g.dy > Math.abs(g.dx) * 0.75,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 0.5) {
          dismissRef.current();
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (!word) return;
    setEntry(null);
    setQuickTranslation(null);
    setIsLoading(true);
    setSaved(false);
    setActiveTenseIdx(0);
    setActiveDeclIdx(0);
    setDeclNumber('sg');
    setVerifiedTenses(null);

    const currentWord = word;
    const currentLemma = lookupLemma;
    const currentLang = language;

    (async () => {
      analytics.trackWordTapped(currentWord, currentLang, level, false);

      translateWord(currentLemma, currentLang).then((result) => {
        if (result?.translation) setQuickTranslation(result.translation);
      }).catch(() => {});

      lookupWord(currentWord, currentLang, level, { sentence }).then(async (result) => {
        // If we got a verb back with only legacy 2-tense data, force-refresh to hit the worker backfill
        let finalResult = result;
        if (result?.wordType === 'verb' && (!result.tenses || result.tenses.length < 3)) {
          finalResult = await lookupWord(currentWord, currentLang, level, { forceRefresh: true, sentence }).catch(() => result);
        }
        setEntry(finalResult);
        setIsLoading(false);
        if (finalResult) {
          writeBackDictionary(currentLemma, currentLang, finalResult).catch(() => {});
          const stored = useWordBankStore.getState().words.find(
            w => w.word.toLowerCase() === currentWord.toLowerCase() && w.language === currentLang
          );
          if (stored) {
            backfillWord(currentWord, currentLang, {
              translation:   finalResult.translation ?? undefined,
              explanation:   finalResult.explanation ?? undefined,
              lemma:         finalResult.lemma,
              pronunciation: finalResult.pronunciation,
              tenses:        finalResult.tenses,
              verbTable:     finalResult.verbTable,
              verbTablePast: finalResult.verbTablePast,
              forms:         finalResult.forms,
              wordType:      finalResult.wordType,
              tip:           finalResult.tip,
              meta:          finalResult.meta,
            });
          }
          // Background verification — show tenses immediately, silently correct if needed
          if (finalResult.wordType === 'verb' && finalResult.tenses?.length && finalResult.lemma) {
            verifyTenses(finalResult.tenses, finalResult.lemma, currentLang).then((verified) => {
              if (verified) setVerifiedTenses(verified);
            }).catch(() => {});
          }
        }
      }).catch(() => { setIsLoading(false); });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, lookupLemma, language]);

  // Build ordered tense list — verified > rich array > legacy two-field fallback
  const tenses = useMemo(() => {
    if (!entry) return [];
    if (verifiedTenses && verifiedTenses.length > 0) return verifiedTenses;
    if (entry.tenses && entry.tenses.length > 0) return entry.tenses;
    const list: Array<{ label: string; table: Record<string, string> }> = [];
    if (entry.verbTable && Object.keys(entry.verbTable).length > 0) {
      list.push({ label: 'PRESENT', table: entry.verbTable });
    }
    if (entry.verbTablePast && Object.keys(entry.verbTablePast).length > 0) {
      list.push({ label: PAST_TENSE_LABEL[language] ?? 'PAST', table: entry.verbTablePast });
    }
    return list;
  }, [entry, verifiedTenses, language]);

  function handleSave() {
    if (!word || alreadySaved || saved) return;
    analytics.trackWordSaved(word, language, level);
    saveWord({
      word,
      language,
      translation: entry?.translation ?? quickTranslation ?? '',
      explanation: entry?.explanation ?? '',
      exampleSentence: entry?.example ?? '',
      originalSentence: sentence,
      lemma: entry?.lemma ?? null,
      pronunciation: entry?.pronunciation ?? null,
      tenses: verifiedTenses ?? entry?.tenses ?? null,
      declensions: entry?.declensions ?? null,
      verbTable: entry?.verbTable ?? null,
      verbTablePast: entry?.verbTablePast ?? null,
      forms: entry?.forms ?? null,
      wordType: entry?.wordType ?? null,
      tip: entry?.tip ?? null,
      meta: entry?.meta ?? null,
    });
    setSaved(true);
  }

  if (!word) return null;

  const isSaved = saved || alreadySaved;
  const displayTranslation = entry?.translation ?? quickTranslation;
  const activeTense = tenses[activeTenseIdx] ?? null;

  // Subtitle: lemma part (article+lemma for nouns, lemma/infinitive for all others)
  const subtitleLemma = (() => {
    if (!entry) return lookupLemma && lookupLemma.toLowerCase() !== word.toLowerCase() ? lookupLemma : null;
    const wt = entry.wordType;
    const f = entry.forms;
    if (wt === 'noun' && f) {
      if (f.article && entry.lemma) return `${f.article} ${entry.lemma}`;
    }
    const lemma = entry.lemma ?? lookupLemma;
    if (lemma && lemma.toLowerCase() !== word.toLowerCase()) return lemma;
    return null;
  })();
  const pillLabel = (() => {
    const wt = entry?.wordType;
    if (wt === 'verb') return 'Infinitive';
    if (wt === 'noun') return 'Noun';
    if (wt === 'adjective') return 'Adjective';
    if (wt === 'adverb') return 'Adverb';
    return 'Root';
  })();

  // subtitle kept as fallback only — new render splits pill + IPA separately
  const subtitle = subtitleLemma
    ? (entry?.pronunciation ? `${subtitleLemma}  ·  ${entry.pronunciation}` : subtitleLemma)
    : (entry?.pronunciation ? entry.pronunciation : null);


  return (
    <Modal visible animationType="none" transparent onRequestClose={dismissSheet}>
      {/* Dimming overlay — fades in on entry, fades out as sheet is dragged down */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: overlayOpacity }]} pointerEvents="none" />
      <View style={styles.modalContainer}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismissSheet} />

        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 },
            { transform: [{ translateY: dragY }] },
          ]}
        >
          {/* Drag handle — visual affordance; the whole sheet is now draggable */}
          <View style={styles.handleArea}>
            <View style={[styles.handle, { backgroundColor: colors.borderMid }]} />
          </View>

          {/* Word row: [← back (nested only)] · [mirror·word·🔊 centred] · [✕ close] */}
          <View style={styles.wordRow}>
            {isNested ? (
              <GlassButton onPress={onClose} size={36} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="arrow-back" size={20} color={isDark ? colors.bg : colors.inkMid} />
              </GlassButton>
            ) : (
              <View style={styles.wordStub} />
            )}
            <View style={styles.wordCenterZone}>
              <View style={styles.wordSpeakerMirror} />
              <Text
                style={[styles.wordText, { color: colors.inkDark, fontFamily: fontFamily.bold }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {word}
              </Text>
              <WordAudioButton word={word} language={language} size="md" />
            </View>
            <GlassButton onPress={dismissSheet} size={36} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={isDark ? colors.bg : colors.inkMid} />
            </GlassButton>
          </View>

        {/* Subtitle: infinitive pill (tappable) + IPA plain text */}
        {(subtitleLemma || entry?.pronunciation) && (
          <View style={styles.subtitleRow}>
            {subtitleLemma && !isNested ? (
              <TouchableOpacity
                onPress={() => setNestedWord(subtitleLemma)}
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
                  {pillLabel}: {subtitleLemma}
                </Text>
                <Ionicons name="chevron-forward" size={11} color={colors.inkMid} />
              </TouchableOpacity>
            ) : subtitleLemma ? (
              <Text style={[styles.subtitleIPA, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                {subtitleLemma}
              </Text>
            ) : null}
            {entry?.pronunciation && (
              <Text style={[styles.subtitleIPA, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                {subtitleLemma ? `· ${entry.pronunciation}` : entry.pronunciation}
              </Text>
            )}
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        {/* Translation — centered, large (above chips) */}
        <View style={styles.translationBlock}>
          {displayTranslation ? (
            <Text style={[styles.translationLarge, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              {displayTranslation}
            </Text>
          ) : isLoading ? (
            <ActivityIndicator size="small" color={colors.inkFaint} style={{ marginVertical: 8 }} />
          ) : (
            <Text style={[styles.translationError, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
              Translation unavailable
            </Text>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        {/* Grammar tags — dot-separated: word type in red, rest in inkFaint */}
        {entry?.wordType && (
          <View style={styles.chipsRow}>
            <Text style={[styles.grammarTags, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
              {[
                entry.wordType.charAt(0).toUpperCase() + entry.wordType.slice(1),
                entry.wordType === 'noun' && entry.forms?.gender
                  ? entry.forms.gender.charAt(0).toUpperCase() + entry.forms.gender.slice(1)
                  : null,
                entry.wordType === 'verb' && entry.meta?.isRegular === true  ? 'Regular'   : null,
                entry.wordType === 'verb' && entry.meta?.isRegular === false ? 'Irregular' : null,
                entry.wordType === 'verb' && entry.meta?.auxiliary ? entry.meta.auxiliary as string : null,
                entry.wordType === 'verb' && entry.meta?.isSeparable ? 'Separable' : null,
                entry.meta?.verbClass ? entry.meta.verbClass as string : null,
                entry.level ?? null,
              ].filter(Boolean).join('  ·  ')}
            </Text>
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        {/* Loading spinner — above scroll area so it's always visible */}
        {isLoading && !entry && (
          <View style={styles.loadingBody}>
            <ActivityIndicator size="small" color={colors.inkFaint} />
          </View>
        )}

        <ScrollView
          style={styles.scrollArea}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={e => { scrollAtTop.current = e.nativeEvent.contentOffset.y <= 0; }}
        >

          {/* Explanation */}
          {entry?.explanation && (
            <Text style={[styles.explanationCentered, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
              {entry.explanation}
            </Text>
          )}

          {/* Example sentence — directly under definition */}
          {entry?.example && (
            <View style={[styles.blockquote, { borderLeftColor: colors.accentRed }]}>
              <Text style={[styles.blockquoteText, { color: colors.inkMid, fontFamily: fontFamily.italic, fontSize: 13 }]}>
                „{entry.example}"
              </Text>
            </View>
          )}

          {/* Forms — plain rows with centered header */}
          {entry?.forms && Object.keys(entry.forms).length > 0 && (
            <View style={styles.formsList}>
              <Text style={[styles.tenseSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular, textAlign: 'center', marginBottom: 4 }]}>
                FORMS
              </Text>
              {Object.entries(entry.forms).map(([key, value]) => (
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
          {entry?.declensions && entry.declensions.length > 0 && (() => {
            const allDecl = entry.declensions;
            const activeDecl = allDecl[activeDeclIdx];
            if (!activeDecl) return null;
            const split = splitDeclTable(activeDecl.table);

            // Three-column layout when sg+pl fit — fall back to arrow nav if any value > 13 chars
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
                  {/* Header row */}
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

            // Arrow nav fallback for long words
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

          {/* Verb tenses — circular nav with CENTERED tense title */}
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

          {/* Tip */}
          {entry?.tip && (
            <View style={[styles.tipBox, { borderColor: colors.borderMid }]}>
              <View style={styles.tipHeader}>
                <Ionicons name="bulb-outline" size={14} color={colors.accentRed} />
                <Text style={[styles.tipLabel, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>TIP</Text>
              </View>
              <Text style={[styles.tipText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>{entry.tip}</Text>
            </View>
          )}

          {!fullAccess && entry && !entry.explanation && !entry.verbTable && !entry.tenses?.length && (
            <View style={[styles.upgradeRow, { borderColor: colors.borderLight }]}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.inkFaint} />
              <Text style={[styles.upgradeText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                Upgrade to unlock full grammar details
              </Text>
            </View>
          )}

        </ScrollView>

          <TouchableOpacity
            style={[styles.saveButton, {
              backgroundColor: isSaved ? colors.borderLight : isLoading ? colors.borderLight : colors.accentRed,
              opacity: isLoading && !isSaved ? 0.5 : 1,
            }]}
            onPress={handleSave}
            disabled={isSaved || isLoading}
          >
            <Ionicons name={isSaved ? 'checkmark-circle' : 'bookmark-outline'} size={18} color={isSaved ? colors.inkLight : '#FFF'} />
            <Text style={[styles.saveText, { color: isSaved ? colors.inkLight : '#FFF', fontFamily: fontFamily.regular }]}>
              {isSaved ? 'Saved to word bank' : 'Save word'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Nested popup for the infinitive/lemma — opens on top of this sheet */}
      {nestedWord && !isNested && (
        <WordPopup
          word={nestedWord}
          lemma={nestedWord}
          sentence={word ?? ''}
          language={language}
          level={level}
          genre={genre}
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

  // Handle + drag area — wider hit target so it's easy to grab
  handleArea: { paddingTop: 14, paddingBottom: 8, paddingHorizontal: 40, alignItems: 'center' },
  handle: { width: 44, height: 5, borderRadius: 3 },

  // Word header: word · /IPA/ · 🔊 · ✕
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
    gap: 8,
  },
  wordStub: { width: 36 },
  wordCenterZone: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  wordSpeakerMirror: { width: 34 },
  wordText: { fontSize: 34, flexShrink: 1 },

  // Subtitle area — pill + IPA side by side
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  infinitivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 99,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  infinitivePillText: { fontSize: 14 },
  subtitleIPA: { fontSize: 14, fontStyle: 'italic' },

  // Dividers
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.lg, marginVertical: Spacing.sm },

  // Translation block (above chips)
  translationBlock: { alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs },
  translationLarge: { fontSize: 26, textAlign: 'center' },
  translationError: { fontSize: 14, textAlign: 'center' },

  // Grammar tags — dot-separated plain text row
  chipsRow: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs,
  },
  grammarTags: { fontSize: 13, textAlign: 'center', letterSpacing: 0.2 },

  // Scroll body
  scrollArea: { paddingHorizontal: Spacing.lg, minHeight: 80 },
  loadingBody: { paddingVertical: Spacing.xl, alignItems: 'center' },
  explanationCentered: { lineHeight: 24, textAlign: 'center', paddingVertical: Spacing.sm },

  // Forms plain list
  formsList: { marginBottom: 4 },
  formsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth },
  formsRowLabel: { fontSize: 13, fontStyle: 'italic' },
  formsRowValue: { fontSize: 15 },

  // Blockquote example (now above verb tenses)
  blockquote: { borderLeftWidth: 3, paddingLeft: 14, paddingVertical: 10, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  blockquoteText: { lineHeight: 22 },

  // Verb tenses — centered layout
  tenseSectionCenter: {
    alignItems: 'center',
    marginTop: Spacing.sm, marginBottom: Spacing.xs,
  },
  tenseSectionLabel: { fontSize: 10, letterSpacing: 1.5, marginBottom: 6 },
  tenseNav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tenseNavBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tenseLabel: { fontSize: 11, letterSpacing: 1, width: 160, textAlign: 'center' },
  conjRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  conjPronoun: { fontSize: 13, flex: 1, fontStyle: 'italic' },
  conjForm: { fontSize: 13, flex: 1, textAlign: 'right' },
  // Three-column declension layout
  declRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth },
  declCaseCol: { flex: 1.2 },
  declCaseLabel: { flex: 1.2, fontSize: 12 },
  declColHeader: { flex: 1, fontSize: 10, letterSpacing: 1, textAlign: 'right' },
  declValue: { flex: 1, fontSize: 13, textAlign: 'right' },

  // Tip box
  tipBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 14, marginTop: Spacing.sm, marginBottom: Spacing.md },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  tipLabel: { fontSize: 11, letterSpacing: 1.5 },
  tipText: { fontSize: 13, lineHeight: 20 },

  // Upgrade nudge
  upgradeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    marginTop: Spacing.md, marginBottom: Spacing.md, opacity: 0.6,
  },
  upgradeText: { fontSize: 13 },

  // Save button
  saveButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: Spacing.lg, marginTop: 6,
    paddingVertical: 14, borderRadius: 10, gap: Spacing.sm,
  },
  saveText: { fontSize: 16 },
});
